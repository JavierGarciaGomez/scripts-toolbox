/**
 * QVET Update Articles - Unified article editor
 *
 * Reads an Excel file and applies field changes to articles in QVET.
 *
 * Excel format:
 *   - Single sheet: all non-empty cells with mapped columns are applied
 *   - Two sheets (Original + Editar): only cells that differ are applied
 *
 * Supported fields: see column-map.ts for full mapping.
 *
 * Usage:
 *   npx ts-node src/scripts/qvet/update-articles.ts <archivo.xlsx> [--limit=N] [--dry-run] [--force]
 *
 * Flags:
 *   --limit=N   Process only the first N articles
 *   --dry-run   Show what would change without editing QVET
 *   --force     When using 2 sheets, apply even if Original == Editar (ignore comparison)
 */

import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { Page } from 'puppeteer';
import {
  loadEnv, delay, log, initLogger, closeLogger,
  setScreenshotDir, screenshot, launchBrowser, loginQVET, ensureDataDir,
} from './common';
import { COLUMN_MAP } from './column-map';
import {
  navigateToArticles, openArticle, selectTab, saveArticle, closeArticle,
  inspectSelector,
  editTextField, editCheckbox, editNumericField, editTextarea,
  editGridCell, editDropdown, editDropdownWithClick, editTarifaCell,
} from './article-editor';
import { UpdateIntent, FieldUpdate, UpdateResult, UpdateReport, Logger } from './types';

// =============================================================================
// Excel Reading
// =============================================================================

function findIdColumn(headers: string[]): number {
  const idx = headers.findIndex(h => {
    const header = h?.toString().toLowerCase() || '';
    return header.includes('codigo interno') || header.includes('idarticulo') || header === 'id';
  });
  if (idx === -1) throw new Error('No se encontró columna de ID en el Excel');
  return idx;
}

/**
 * Read Excel and build UpdateIntents.
 *
 * - If 2 sheets (Original + Editar): compare and only include differences
 * - If 1 sheet: include all non-empty mapped cells
 * - --force with 2 sheets: include all non-empty mapped cells from Editar (skip comparison)
 */
function readUpdateIntents(excelPath: string, force: boolean): { intents: UpdateIntent[]; mode: string } {
  const workbook = XLSX.read(fs.readFileSync(excelPath), { type: 'buffer' });

  const hasOriginal = !!workbook.Sheets['Original'];
  const hasEditar = !!workbook.Sheets['Editar'];

  let dataRows: any[][];
  let origRows: any[][] | null = null;
  let headers: string[];
  let mode: string;

  if (hasOriginal && hasEditar && !force) {
    // Two-sheet mode with comparison
    mode = '2 hojas (comparando)';
    origRows = XLSX.utils.sheet_to_json(workbook.Sheets['Original']!, { header: 1 }) as any[][];
    dataRows = XLSX.utils.sheet_to_json(workbook.Sheets['Editar']!, { header: 1 }) as any[][];
    headers = dataRows[0] as string[];
  } else if (hasEditar) {
    // Two-sheet mode with --force, or only Editar sheet: use Editar, no comparison
    mode = force && hasOriginal ? '2 hojas (--force, sin comparar)' : 'hoja Editar';
    dataRows = XLSX.utils.sheet_to_json(workbook.Sheets['Editar']!, { header: 1 }) as any[][];
    headers = dataRows[0] as string[];
  } else {
    // Single sheet: use first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Excel vacío');
    mode = '1 hoja';
    dataRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]!, { header: 1 }) as any[][];
    headers = dataRows[0] as string[];
  }

  const idColIndex = findIdColumn(headers);
  log(`   Columna ID: "${headers[idColIndex]}" (índice ${idColIndex})`);
  log(`   Modo: ${mode}`);
  log(`   Filas de datos: ${dataRows.length - 1}`);

  const intentsByArticle = new Map<number, FieldUpdate[]>();

  for (let rowIndex = 1; rowIndex < dataRows.length; rowIndex++) {
    const row = dataRows[rowIndex];
    if (!row) continue;

    const idArticulo = parseInt(row[idColIndex]);
    if (isNaN(idArticulo)) continue;

    const origRow = origRows ? origRows[rowIndex] : null;

    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      const header = headers[colIndex];
      if (!header) continue;

      const mapping = COLUMN_MAP[header];
      if (!mapping) continue;

      const newValue = row[colIndex];
      const newNorm = newValue === undefined || newValue === null ? '' : String(newValue).trim();

      if (origRow) {
        // Two-sheet mode: compare Original vs Editar
        // Empty in Editar + non-empty in Original = intent to clear the field
        const oldValue = origRow[colIndex];
        const oldNorm = oldValue === undefined || oldValue === null ? '' : String(oldValue).trim();
        if (oldNorm === newNorm) continue; // No change
      } else {
        // Single-sheet mode: skip empty cells (no intent to change)
        if (newNorm === '') continue;
      }

      const update: FieldUpdate = {
        field: header,
        newValue: newNorm,
        tab: mapping.tab,
        fieldType: mapping.type,
        selector: mapping.selector,
        gridConfig: mapping.gridConfig,
        tarifaConfig: mapping.tarifaConfig,
      };

      if (!intentsByArticle.has(idArticulo)) {
        intentsByArticle.set(idArticulo, []);
      }
      intentsByArticle.get(idArticulo)!.push(update);
    }
  }

  const intents: UpdateIntent[] = [];
  for (const [idArticulo, updates] of intentsByArticle) {
    intents.push({ idArticulo, updates });
  }

  // Sort by article ID
  intents.sort((a, b) => a.idArticulo - b.idArticulo);

  return { intents, mode };
}

// =============================================================================
// Apply Updates
// =============================================================================

async function applyFieldUpdate(
  page: Page,
  update: FieldUpdate,
  logger: Logger,
  debugScreenshot?: (name: string) => Promise<void>,
): Promise<{ success: boolean; error?: string | undefined }> {
  try {
    // Debug: inspect what the selector resolves to before editing
    if (update.selector) {
      const info = await inspectSelector(page, update.selector);
      logger(`         [DEBUG] selector="${update.selector}" → found=${info.found}, count=${info.count}`);
      for (const el of info.elements) {
        logger(`         [DEBUG]   ${el.inModal ? '[MODAL]' : '[PAGE]'} ${el.visible ? 'visible' : 'hidden'} id="${el.id}" value="${el.value}" label="${el.label}"`);
      }
      if (debugScreenshot) await debugScreenshot(`before-${update.field}`);
    }

    switch (update.fieldType) {
      case 'text':
        if (update.selector) {
          const ok = await editTextField(page, update.selector, update.newValue);
          if (debugScreenshot) await debugScreenshot(`after-${update.field}`);
          return { success: ok, error: ok ? undefined : 'Campo no encontrado' };
        }
        return { success: false, error: 'Sin selector' };

      case 'checkbox':
        if (update.selector) {
          const ok = await editCheckbox(page, update.selector, update.newValue);
          return { success: ok, error: ok ? undefined : 'Checkbox no encontrado' };
        }
        return { success: false, error: 'Sin selector' };

      case 'numeric':
        if (update.selector) {
          const numValue = parseFloat(update.newValue) || 0;
          const ok = await editNumericField(page, update.selector, numValue);
          return { success: ok, error: ok ? undefined : 'Campo numérico no encontrado' };
        }
        return { success: false, error: 'Sin selector' };

      case 'textarea':
        if (update.selector) {
          const ok = await editTextarea(page, update.selector, update.newValue);
          return { success: ok, error: ok ? undefined : 'Textarea no encontrado' };
        }
        return { success: false, error: 'Sin selector' };

      case 'grid':
        if (update.gridConfig) {
          const numValue = parseFloat(update.newValue) || 0;
          const gridResult = await editGridCell(page, update.gridConfig.warehouse, update.gridConfig.column, numValue);
          return { success: gridResult.success, error: gridResult.error };
        }
        return { success: false, error: 'Sin gridConfig' };

      case 'dropdown':
        if (update.selector) {
          const isCascade = update.field.toLowerCase().includes('familia');
          const isSeccion = update.field.toLowerCase().includes('seccion');

          let result;
          if (isSeccion) {
            result = await editDropdownWithClick(page, update.selector, update.newValue);
          } else {
            result = await editDropdown(page, update.selector, update.newValue, isCascade);
          }
          return result;
        }
        return { success: false, error: 'Sin selector' };

      case 'tarifa':
        if (update.tarifaConfig) {
          const numValue = parseFloat(update.newValue) || 0;
          const tarifaResult = await editTarifaCell(page, update.tarifaConfig.tarifaName, update.tarifaConfig.column, numValue);
          return { success: tarifaResult.success, error: tarifaResult.success ? undefined : 'Tarifa no encontrada' };
        }
        return { success: false, error: 'Sin tarifaConfig' };

      default:
        return { success: false, error: 'Tipo de campo no soportado' };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function applyUpdates(
  page: Page,
  intents: UpdateIntent[],
  options: { limit: number; dryRun: boolean },
  logger: Logger,
): Promise<UpdateResult[]> {
  const results: UpdateResult[] = [];

  const totalArticles = options.limit > 0 ? Math.min(options.limit, intents.length) : intents.length;
  logger(`\n📝 ${options.dryRun ? '[DRY RUN] ' : ''}Procesando ${totalArticles}${options.limit > 0 ? ` de ${intents.length}` : ''} artículos...\n`);

  for (let i = 0; i < totalArticles; i++) {
    const intent = intents[i]!;
    logger(`[${i + 1}/${totalArticles}] Artículo ${intent.idArticulo}:`);

    if (options.dryRun) {
      for (const update of intent.updates) {
        logger(`      [DRY] ${update.field}: → ${update.newValue}`);
        results.push({
          idArticulo: intent.idArticulo,
          field: update.field,
          previousValue: '',
          newValue: update.newValue,
          status: 'dry_run',
        });
      }
      continue;
    }

    await navigateToArticles(page);

    const doScreenshot = i < 3;

    const opened = await openArticle(page, intent.idArticulo, logger);
    if (!opened) {
      logger(`   ✗ No se pudo abrir el artículo ${intent.idArticulo}`);
      if (doScreenshot) await screenshot(page, `art-${intent.idArticulo}-open-fail`);
      for (const update of intent.updates) {
        results.push({
          idArticulo: intent.idArticulo,
          field: update.field,
          previousValue: '',
          newValue: update.newValue,
          status: 'error',
          error: 'No se pudo abrir el artículo',
        });
      }
      continue;
    }

    if (doScreenshot) await screenshot(page, `art-${intent.idArticulo}-opened`);

    // Group updates by tab
    const updatesByTab = new Map<string, FieldUpdate[]>();
    for (const update of intent.updates) {
      const existing = updatesByTab.get(update.tab) || [];
      existing.push(update);
      updatesByTab.set(update.tab, existing);
    }

    for (const [tabName, tabUpdates] of updatesByTab) {
      // Sort: P_Minimo before tariffs (floor price must be set first to avoid validation errors)
      tabUpdates.sort((a, b) => {
        const priority = (u: FieldUpdate) => u.fieldType === 'tarifa' ? 1 : 0;
        return priority(a) - priority(b);
      });

      logger(`   📑 ${tabName}`);

      const tabSelected = await selectTab(page, tabName);
      if (!tabSelected) {
        for (const update of tabUpdates) {
          results.push({
            idArticulo: intent.idArticulo,
            field: update.field,
            previousValue: '',
            newValue: update.newValue,
            status: 'error',
            error: `Pestaña ${tabName} no encontrada`,
          });
        }
        continue;
      }
      await delay(1500);
      if (doScreenshot) await screenshot(page, `art-${intent.idArticulo}-tab-${tabName.replace(/\s/g, '_')}`);

      for (const update of tabUpdates) {
        const debugSS = doScreenshot
          ? (name: string) => screenshot(page, `art-${intent.idArticulo}-${name}`)
          : undefined;
        const { success, error } = await applyFieldUpdate(page, update, logger, debugSS);

        results.push({
          idArticulo: intent.idArticulo,
          field: update.field,
          previousValue: '',
          newValue: update.newValue,
          status: success ? 'applied' : 'error',
          error: success ? undefined : (error || 'Error aplicando cambio'),
        });

        logger(`      ${success ? '✓' : '✗'} ${update.field}: → ${update.newValue}${error ? ' (' + error + ')' : ''}`);
      }
    }

    if (doScreenshot) await screenshot(page, `art-${intent.idArticulo}-before-save`);
    const saved = await saveArticle(page);
    logger(`   ${saved ? '💾 Guardado' : '⚠️ Error guardando'}`);
    if (doScreenshot) await screenshot(page, `art-${intent.idArticulo}-after-save`);

    await closeArticle(page);
    await delay(500);
  }

  return results;
}

// =============================================================================
// Report Generation
// =============================================================================

function generateReport(
  excelFile: string,
  options: { force: boolean; dryRun: boolean; limit: number },
  intents: UpdateIntent[],
  results: UpdateResult[],
): UpdateReport {
  const report: UpdateReport = {
    timestamp: new Date().toISOString(),
    excelFile,
    options,
    totalIntents: intents.length,
    totalFields: results.length,
    applied: results.filter(r => r.status === 'applied').length,
    skippedSame: results.filter(r => r.status === 'skipped_same').length,
    failed: results.filter(r => r.status === 'error').length,
    dryRun: results.filter(r => r.status === 'dry_run').length,
    results,
    summary: { byField: {}, byArticle: {} },
  };

  for (const result of results) {
    if (!report.summary.byField[result.field]) {
      report.summary.byField[result.field] = { total: 0, applied: 0, skipped: 0, failed: 0 };
    }
    const fs = report.summary.byField[result.field]!;
    fs.total++;
    if (result.status === 'applied' || result.status === 'dry_run') fs.applied++;
    else if (result.status === 'skipped_same') fs.skipped++;
    else fs.failed++;

    if (!report.summary.byArticle[result.idArticulo]) {
      report.summary.byArticle[result.idArticulo] = { total: 0, applied: 0, skipped: 0, failed: 0 };
    }
    const as = report.summary.byArticle[result.idArticulo]!;
    as.total++;
    if (result.status === 'applied' || result.status === 'dry_run') as.applied++;
    else if (result.status === 'skipped_same') as.skipped++;
    else as.failed++;
  }

  return report;
}

function saveReport(report: UpdateReport, dataDir: string): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');

  // JSON
  const jsonPath = path.join(dataDir, `reporte-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  // Markdown
  const mdPath = path.join(dataDir, `reporte-${timestamp}.md`);
  let md = `# Reporte QVET Update Articles\n\n`;
  md += `**Fecha:** ${report.timestamp}\n`;
  md += `**Archivo:** ${report.excelFile}\n`;
  md += `**Opciones:** force=${report.options.force}, dry-run=${report.options.dryRun}, limit=${report.options.limit || 'sin limite'}\n\n`;

  md += `## Resumen\n\n`;
  md += `| Métrica | Valor |\n|---------|-------|\n`;
  md += `| Artículos | ${report.totalIntents} |\n`;
  md += `| Campos | ${report.totalFields} |\n`;
  md += `| Aplicados | ${report.applied} |\n`;
  md += `| Sin cambio | ${report.skippedSame} |\n`;
  md += `| Fallidos | ${report.failed} |\n`;
  if (report.dryRun > 0) md += `| Dry run | ${report.dryRun} |\n`;

  md += `\n## Por Campo\n\n`;
  md += `| Campo | Total | OK | Skip | Fail |\n|-------|-------|----|------|------|\n`;
  for (const [field, stats] of Object.entries(report.summary.byField)) {
    md += `| ${field} | ${stats.total} | ${stats.applied} | ${stats.skipped} | ${stats.failed} |\n`;
  }

  md += `\n## Detalle\n\n`;
  for (const r of report.results) {
    const icon = r.status === 'applied' ? '+' : r.status === 'dry_run' ? '~' : r.status === 'skipped_same' ? '=' : 'X';
    md += `- [${icon}] Art. ${r.idArticulo} - ${r.field}: \`${r.newValue}\``;
    if (r.error) md += ` (${r.error})`;
    md += `\n`;
  }

  fs.writeFileSync(mdPath, md);
  return jsonPath;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  const excelPath = args.find(a => !a.startsWith('--'));
  if (!excelPath) {
    console.log('Uso: npx ts-node src/scripts/qvet/update-articles.ts <archivo.xlsx> [--limit=N] [--dry-run] [--force]');
    process.exit(1);
  }

  if (!fs.existsSync(excelPath)) {
    console.log(`Archivo no encontrado: ${excelPath}`);
    process.exit(1);
  }

  const limitArg = args.find(a => a.startsWith('--limit='));
  const articleLimit = limitArg ? parseInt(limitArg.split('=')[1]!) : 0;
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  // Init
  const credentials = loadEnv();
  const dataDir = ensureDataDir();
  const logTimestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');

  setScreenshotDir(path.join(dataDir, `screenshots-${logTimestamp}`));
  const logger = initLogger(path.join(dataDir, `log-${logTimestamp}.txt`));

  logger('🏥 QVET Update Articles');
  logger('=======================\n');
  logger(`📄 Archivo: ${excelPath}`);
  logger(`👤 Usuario: ${credentials.user}`);
  logger(`🏢 Clínica: ${credentials.auto}`);
  if (dryRun) logger('🔍 Modo: DRY RUN (no se editará nada)');
  if (force) logger('⚡ Modo: FORCE (sin comparar Original vs Editar)');
  if (articleLimit > 0) logger(`📊 Límite: ${articleLimit} artículos`);
  logger('');

  if (!credentials.user || !credentials.pass || !credentials.auto) {
    logger('❌ Faltan credenciales en .env');
    process.exit(1);
  }

  // Read Excel
  logger('📊 Leyendo Excel...');
  const { intents, mode } = readUpdateIntents(excelPath, force);

  if (intents.length === 0) {
    logger('   ℹ️  No se detectaron cambios para aplicar');
    closeLogger();
    process.exit(0);
  }

  const totalFields = intents.reduce((sum, i) => sum + i.updates.length, 0);
  logger(`   ✅ ${totalFields} cambios en ${intents.length} artículos`);

  // Summary by field
  const fieldCounts = new Map<string, number>();
  for (const intent of intents) {
    for (const update of intent.updates) {
      fieldCounts.set(update.field, (fieldCounts.get(update.field) || 0) + 1);
    }
  }
  for (const [field, count] of fieldCounts) {
    logger(`      - ${field}: ${count}`);
  }

  // Execute
  let browser = null;

  try {
    if (!dryRun) {
      browser = await launchBrowser();
      const page = await browser.newPage();

      const loginOk = await loginQVET(page, credentials, logger);
      if (!loginOk) throw new Error('Login falló');

      var results = await applyUpdates(page, intents, { limit: articleLimit, dryRun: false }, logger);
    } else {
      // Dry run: no browser needed
      var results = await applyUpdates(null as any, intents, { limit: articleLimit, dryRun: true }, logger);
    }

    const report = generateReport(excelPath, { force, dryRun, limit: articleLimit }, intents, results);
    const reportPath = saveReport(report, dataDir);

    logger('\n========================================');
    logger('📊 RESUMEN FINAL');
    logger('========================================');
    logger(`✅ Aplicados: ${report.applied}`);
    logger(`❌ Fallidos: ${report.failed}`);
    logger(`⏭️  Sin cambio: ${report.skippedSame}`);
    if (report.dryRun > 0) logger(`🔍 Dry run: ${report.dryRun}`);
    logger(`\n📄 Reportes:`);
    logger(`   - ${reportPath}`);
    logger(`   - ${reportPath.replace('.json', '.md')}`);

    if (!dryRun) {
      logger('\n⏳ Cerrando en 5 segundos...');
      await delay(5000);
    }
  } catch (error: any) {
    log(`\n❌ Error: ${error.message}`);
  } finally {
    closeLogger();
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(console.error);
