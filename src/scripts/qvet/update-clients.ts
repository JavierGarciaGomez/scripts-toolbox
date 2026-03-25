/**
 * QVET Update Clients - Client editor
 *
 * Reads an Excel file and applies field changes to clients in QVET.
 *
 * Excel format:
 *   - Single sheet: all non-empty cells with mapped columns are applied
 *   - Two sheets (Original + Editar): only cells that differ are applied
 *
 * Supported fields: see client-column-map.ts for full mapping.
 *
 * Usage:
 *   npx ts-node src/scripts/qvet/update-clients.ts <archivo.xlsx> [--limit=N] [--dry-run] [--force]
 */

import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { Page } from 'puppeteer';
import {
  loadEnv, delay, log, initLogger, closeLogger,
  setScreenshotDir, screenshot, launchBrowser, loginQVET, ensureDataDir,
} from './common';
import { CLIENT_COLUMN_MAP } from './client-column-map';
import {
  navigateToClients, openClient, saveClient, closeClient,
  selectTab, inspectSelector,
  editTextField, editCheckbox, editTextarea, editDropdown, editDropdownWithClick,
  handlePoblacionPopup,
} from './client-editor';
import { UpdateIntent, FieldUpdate, UpdateResult, UpdateReport, Logger } from './types';

// =============================================================================
// Excel Reading
// =============================================================================

function findIdColumn(headers: string[]): number {
  const idx = headers.findIndex(h => {
    const header = h?.toString().toLowerCase() || '';
    return header.includes('id propietario') || header.includes('idpropietario')
      || header === 'id' || header === 'codigo' || header === 'código'
      || header.includes('comunicacion_idcliente');
  });
  if (idx === -1) throw new Error('No se encontró columna de ID en el Excel (busca: ID PROPIETARIO, ID, CODIGO, COMUNICACION_IDCLIENTE)');
  return idx;
}

function readUpdateIntents(excelPath: string, force: boolean): { intents: UpdateIntent[]; mode: string } {
  const workbook = XLSX.read(fs.readFileSync(excelPath), { type: 'buffer' });

  const hasOriginal = !!workbook.Sheets['Original'];
  const hasEditar = !!workbook.Sheets['Editar'];

  let dataRows: any[][];
  let origRows: any[][] | null = null;
  let headers: string[];
  let mode: string;

  if (hasOriginal && hasEditar && !force) {
    mode = '2 hojas (comparando)';
    origRows = XLSX.utils.sheet_to_json(workbook.Sheets['Original']!, { header: 1 }) as any[][];
    dataRows = XLSX.utils.sheet_to_json(workbook.Sheets['Editar']!, { header: 1 }) as any[][];
    headers = dataRows[0] as string[];
  } else if (hasEditar) {
    mode = force && hasOriginal ? '2 hojas (--force, sin comparar)' : 'hoja Editar';
    dataRows = XLSX.utils.sheet_to_json(workbook.Sheets['Editar']!, { header: 1 }) as any[][];
    headers = dataRows[0] as string[];
  } else {
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

  const intentsByClient = new Map<number, FieldUpdate[]>();

  for (let rowIndex = 1; rowIndex < dataRows.length; rowIndex++) {
    const row = dataRows[rowIndex];
    if (!row) continue;

    const idPropietario = parseInt(row[idColIndex]);
    if (isNaN(idPropietario)) continue;

    const origRow = origRows ? origRows[rowIndex] : null;

    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      const header = headers[colIndex];
      if (!header) continue;

      const mapping = CLIENT_COLUMN_MAP[header];
      if (!mapping) continue;

      const newValue = row[colIndex];
      const newNorm = newValue === undefined || newValue === null ? '' : String(newValue).trim();

      if (origRow) {
        const oldValue = origRow[colIndex];
        const oldNorm = oldValue === undefined || oldValue === null ? '' : String(oldValue).trim();
        if (oldNorm === newNorm) continue;
      } else {
        if (newNorm === '') continue;
      }

      const update: FieldUpdate = {
        field: header,
        newValue: newNorm,
        tab: mapping.tab,
        fieldType: mapping.type,
        selector: mapping.selector,
      };

      if (!intentsByClient.has(idPropietario)) {
        intentsByClient.set(idPropietario, []);
      }
      intentsByClient.get(idPropietario)!.push(update);
    }
  }

  const intents: UpdateIntent[] = [];
  for (const [idArticulo, updates] of intentsByClient) {
    intents.push({ idArticulo, updates });
  }

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
    if (update.selector) {
      const info = await inspectSelector(page, update.selector);
      logger(`         [DEBUG] selector="${update.selector}" → found=${info.found}, count=${info.count}`);
      for (const el of info.elements) {
        logger(`         [DEBUG]   ${el.inModal ? '[MODAL]' : '[PAGE]'} ${el.visible ? 'visible' : 'hidden'} id="${el.id}" value="${el.value}" label="${el.label}"`);
      }
    }

    // Fields that trigger the población popup after editing
    const triggersPoblacionPopup = update.field === 'CP';

    switch (update.fieldType) {
      case 'text':
        if (update.selector) {
          const ok = await editTextField(page, update.selector, update.newValue);
          if (ok && triggersPoblacionPopup) {
            // Click somewhere else to trigger the popup, then handle it
            await page.keyboard.press('Tab');
            await handlePoblacionPopup(page, logger);
          }
          return { success: ok, error: ok ? undefined : 'Campo no encontrado' };
        }
        return { success: false, error: 'Sin selector' };

      case 'checkbox':
        if (update.selector) {
          const ok = await editCheckbox(page, update.selector, update.newValue);
          return { success: ok, error: ok ? undefined : 'Checkbox no encontrado' };
        }
        return { success: false, error: 'Sin selector' };

      case 'textarea':
        if (update.selector) {
          const ok = await editTextarea(page, update.selector, update.newValue);
          return { success: ok, error: ok ? undefined : 'Textarea no encontrado' };
        }
        return { success: false, error: 'Sin selector' };

      case 'dropdown':
        if (update.selector) {
          // If changing País SMS, first clear Número Móvil to avoid >9 digit validation error
          if (update.field === 'PAIS_SMS' || update.field === 'Pais_SMS') {
            logger(`         [PRE] Vaciando Número Móvil antes de cambiar País SMS...`);
            const clearResult = await page.evaluate(() => {
              const $ = (window as any).jQuery;
              if (!$) return 'no_jquery';
              // Find TelefonoSMS inside the modal
              const el = $('.k-window-content [id$="_TelefonoSMS"]');
              if (el.length === 0) return 'not_found';
              const oldVal = el.val();
              el.val('');
              el.trigger('change');
              el.trigger('input');
              // Also clear via native
              const native = el[0] as HTMLInputElement;
              native.value = '';
              native.dispatchEvent(new Event('change', { bubbles: true }));
              return `cleared (was: "${oldVal}")`;
            });
            logger(`         [PRE] TelefonoSMS: ${clearResult}`);
            await delay(500);
          }
          // Use physical click to ensure cascade events fire (e.g. PrefijoSMS update)
          const result = await editDropdownWithClick(page, update.selector, update.newValue);
          return result;
        }
        return { success: false, error: 'Sin selector' };

      default:
        return { success: false, error: `Tipo de campo "${update.fieldType}" no soportado para clientes` };
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

  const totalClients = options.limit > 0 ? Math.min(options.limit, intents.length) : intents.length;
  logger(`\n📝 ${options.dryRun ? '[DRY RUN] ' : ''}Procesando ${totalClients}${options.limit > 0 ? ` de ${intents.length}` : ''} clientes...\n`);

  for (let i = 0; i < totalClients; i++) {
    const intent = intents[i]!;
    logger(`[${i + 1}/${totalClients}] Cliente ${intent.idArticulo}:`);

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

    await navigateToClients(page, logger);

    const doScreenshot = i < 3;

    const opened = await openClient(page, intent.idArticulo, logger);
    if (!opened) {
      logger(`   ✗ No se pudo abrir el cliente ${intent.idArticulo}`);
      if (doScreenshot) await screenshot(page, `client-${intent.idArticulo}-open-fail`);
      for (const update of intent.updates) {
        results.push({
          idArticulo: intent.idArticulo,
          field: update.field,
          previousValue: '',
          newValue: update.newValue,
          status: 'error',
          error: 'No se pudo abrir el cliente',
        });
      }
      continue;
    }

    if (doScreenshot) await screenshot(page, `client-${intent.idArticulo}-opened`);

    // Group updates by tab
    const updatesByTab = new Map<string, FieldUpdate[]>();
    for (const update of intent.updates) {
      const existing = updatesByTab.get(update.tab) || [];
      existing.push(update);
      updatesByTab.set(update.tab, existing);
    }

    for (const [tabName, tabUpdates] of updatesByTab) {
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
      if (doScreenshot) await screenshot(page, `client-${intent.idArticulo}-tab-${tabName.replace(/\s/g, '_')}`);

      for (const update of tabUpdates) {
        const debugSS = doScreenshot
          ? (name: string) => screenshot(page, `client-${intent.idArticulo}-${name}`)
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

    if (doScreenshot) await screenshot(page, `client-${intent.idArticulo}-before-save`);
    const saved = await saveClient(page);
    logger(`   ${saved ? '💾 Guardado' : '⚠️ Error guardando'}`);
    if (doScreenshot) await screenshot(page, `client-${intent.idArticulo}-after-save`);

    await closeClient(page);
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

  const jsonPath = path.join(dataDir, `reporte-clients-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const mdPath = path.join(dataDir, `reporte-clients-${timestamp}.md`);
  let md = `# Reporte QVET Update Clients\n\n`;
  md += `**Fecha:** ${report.timestamp}\n`;
  md += `**Archivo:** ${report.excelFile}\n`;
  md += `**Opciones:** force=${report.options.force}, dry-run=${report.options.dryRun}, limit=${report.options.limit || 'sin limite'}\n\n`;

  md += `## Resumen\n\n`;
  md += `| Métrica | Valor |\n|---------|-------|\n`;
  md += `| Clientes | ${report.totalIntents} |\n`;
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
    md += `- [${icon}] Cliente ${r.idArticulo} - ${r.field}: \`${r.newValue}\``;
    if (r.error) md += ` (${r.error})`;
    md += `\n`;
  }

  fs.writeFileSync(mdPath, md);
  return jsonPath;
}

// =============================================================================
// Main
// =============================================================================

// =============================================================================
// Progress tracking for batch/resume
// =============================================================================

function getProgressPath(excelPath: string): string {
  const base = path.basename(excelPath, path.extname(excelPath));
  return path.join(path.dirname(excelPath), `.${base}.progress.json`);
}

interface ProgressData {
  processed: number[];
  failed: number[];
  totalApplied: number;
  totalFailed: number;
  batches: { batch: number; applied: number; failed: number; timestamp: string }[];
}

function loadProgress(progressPath: string): ProgressData {
  if (fs.existsSync(progressPath)) {
    return JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  }
  return { processed: [], failed: [], totalApplied: 0, totalFailed: 0, batches: [] };
}

function saveProgress(progressPath: string, progress: ProgressData): void {
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
}

async function main() {
  const args = process.argv.slice(2);

  const excelPath = args.find(a => !a.startsWith('--'));
  if (!excelPath) {
    console.log('Uso: npx ts-node src/scripts/qvet/update-clients.ts <archivo.xlsx> [--limit=N] [--batch=N] [--dry-run] [--force] [--reset]');
    process.exit(1);
  }

  if (!fs.existsSync(excelPath)) {
    console.log(`Archivo no encontrado: ${excelPath}`);
    process.exit(1);
  }

  const limitArg = args.find(a => a.startsWith('--limit='));
  const clientLimit = limitArg ? parseInt(limitArg.split('=')[1]!) : 0;
  const batchArg = args.find(a => a.startsWith('--batch='));
  const batchSize = batchArg ? parseInt(batchArg.split('=')[1]!) : 0;
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const reset = args.includes('--reset');

  // Init
  const credentials = loadEnv();
  const dataDir = ensureDataDir();
  const logTimestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');

  setScreenshotDir(path.join(dataDir, `screenshots-clients-${logTimestamp}`));
  const logger = initLogger(path.join(dataDir, `log-clients-${logTimestamp}.txt`));

  logger('🏥 QVET Update Clients');
  logger('=======================\n');
  logger(`📄 Archivo: ${excelPath}`);
  logger(`👤 Usuario: ${credentials.user}`);
  logger(`🏢 Clínica: ${credentials.auto}`);
  if (dryRun) logger('🔍 Modo: DRY RUN (no se editará nada)');
  if (force) logger('⚡ Modo: FORCE (sin comparar Original vs Editar)');
  if (clientLimit > 0) logger(`📊 Límite: ${clientLimit} clientes`);
  if (batchSize > 0) logger(`📦 Lotes de: ${batchSize} clientes`);
  logger('');

  if (!credentials.user || !credentials.pass || !credentials.auto) {
    logger('❌ Faltan credenciales en .env');
    process.exit(1);
  }

  // Progress file
  const progressPath = getProgressPath(excelPath);
  if (reset && fs.existsSync(progressPath)) {
    fs.unlinkSync(progressPath);
    logger('🔄 Progreso reseteado\n');
  }
  const progress = loadProgress(progressPath);

  // Read Excel
  logger('📊 Leyendo Excel...');
  const { intents, mode } = readUpdateIntents(excelPath, force);

  if (intents.length === 0) {
    logger('   ℹ️  No se detectaron cambios para aplicar');
    closeLogger();
    process.exit(0);
  }

  const totalFields = intents.reduce((sum, i) => sum + i.updates.length, 0);
  logger(`   ✅ ${totalFields} cambios en ${intents.length} clientes`);

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

  // Filter out already processed
  const processedSet = new Set(progress.processed);
  const pending = intents.filter(i => !processedSet.has(i.idArticulo));

  if (processedSet.size > 0) {
    logger(`\n🔄 Resumiendo: ${processedSet.size} ya procesados, ${pending.length} pendientes`);
    logger(`   Acumulado: ✅ ${progress.totalApplied} aplicados, ❌ ${progress.totalFailed} fallidos`);
  }

  if (pending.length === 0) {
    logger('\n✅ Todos los clientes ya han sido procesados');
    closeLogger();
    process.exit(0);
  }

  // Apply limit
  const toProcess = clientLimit > 0 ? pending.slice(0, clientLimit) : pending;

  // Execute
  let browser = null;

  try {
    if (dryRun) {
      const results = await applyUpdates(null as any, toProcess, { limit: 0, dryRun: true }, logger);
      const report = generateReport(excelPath, { force, dryRun, limit: clientLimit }, intents, results);
      const reportPath = saveReport(report, dataDir);
      logger(`\n📄 Reporte: ${reportPath}`);
    } else {
      browser = await launchBrowser();
      let page = await browser.newPage();

      const loginOk = await loginQVET(page, credentials, logger);
      if (!loginOk) throw new Error('Login falló');

      // Helper to recover from detached frame / corrupted page
      async function recoverPage(): Promise<boolean> {
        try {
          logger(`   🔄 Recuperando página...`);
          // Close all pages and create a new one
          const pages = await browser!.pages();
          for (const p of pages) {
            try { await p.close(); } catch { /* ignore */ }
          }
          page = await browser!.newPage();
          return await loginQVET(page, credentials, logger);
        } catch (e: any) {
          logger(`   ❌ Recovery falló: ${e.message}`);
          return false;
        }
      }

      // Process in batches
      const effectiveBatch = batchSize > 0 ? batchSize : toProcess.length;
      let batchNum = progress.batches.length;

      for (let offset = 0; offset < toProcess.length; offset += effectiveBatch) {
        batchNum++;
        const batch = toProcess.slice(offset, offset + effectiveBatch);
        const batchApplied: number[] = [];
        const batchFailed: number[] = [];

        logger(`\n========================================`);
        logger(`📦 LOTE ${batchNum} (${offset + 1}-${offset + batch.length} de ${toProcess.length} pendientes)`);
        logger(`========================================\n`);

        const CLIENT_TIMEOUT = 60000; // 60 seconds max per client

        for (let i = 0; i < batch.length; i++) {
          const intent = batch[i]!;
          const globalIdx = processedSet.size + offset + i + 1;
          const startTime = Date.now();
          logger(`[${globalIdx}/${intents.length}] Cliente ${intent.idArticulo}: (${new Date().toLocaleTimeString()})`);

          let clientOk = false;
          let timedOut = false;

          try {
            // Wrap entire client processing in a timeout
            const result = await Promise.race([
              (async () => {
                let navOk = await navigateToClients(page, logger);
                if (!navOk) {
                  logger(`   🔄 Navegación fallida, re-logueando...`);
                  try {
                    await loginQVET(page, credentials, logger);
                    navOk = await navigateToClients(page, logger);
                  } catch { /* ignore */ }
                }

                const opened = navOk ? await openClient(page, intent.idArticulo, logger) : false;
                if (!opened) {
                  logger(`   ✗ No se pudo abrir el cliente ${intent.idArticulo}`);
                  return 'open_failed';
                }

                // Group updates by tab
                const updatesByTab = new Map<string, FieldUpdate[]>();
                for (const update of intent.updates) {
                  const existing = updatesByTab.get(update.tab) || [];
                  existing.push(update);
                  updatesByTab.set(update.tab, existing);
                }

                let allOk = true;
                for (const [tabName, tabUpdates] of updatesByTab) {
                  logger(`   📑 ${tabName}`);
                  const tabSelected = await selectTab(page, tabName);
                  if (!tabSelected) {
                    logger(`   ✗ Pestaña ${tabName} no encontrada`);
                    allOk = false;
                    continue;
                  }
                  await delay(1500);
                  for (const update of tabUpdates) {
                    const { success, error } = await applyFieldUpdate(page, update, logger);
                    logger(`      ${success ? '✓' : '✗'} ${update.field}: → ${update.newValue}${error ? ' (' + error + ')' : ''}`);
                    if (!success) allOk = false;
                  }
                }

                const saved = await saveClient(page);
                logger(`   ${saved ? '💾 Guardado' : '⚠️ Error guardando'}`);

                if (!saved) {
                  logger(`   🔄 Forzando cierre del modal...`);
                  await page.keyboard.press('Escape');
                  await delay(1000);
                  await page.keyboard.press('Escape');
                  await delay(1000);
                  try {
                    await page.goto('https://go.qvet.net/Home/Index', { waitUntil: 'networkidle2', timeout: 15000 });
                  } catch { /* ignore */ }
                  await delay(2000);
                  return 'save_failed';
                }

                if (saved) await closeClient(page);
                return allOk ? 'ok' : 'partial';
              })(),
              new Promise<string>(resolve => setTimeout(() => resolve('timeout'), CLIENT_TIMEOUT)),
            ]);

            if (result === 'timeout') {
              timedOut = true;
              logger(`   ⏱️ TIMEOUT (${CLIENT_TIMEOUT / 1000}s) - saltando cliente`);
              // Force recovery - create new page since old one may be stuck
              const recovered = await recoverPage();
              if (!recovered) {
                logger(`   ❌ No se pudo recuperar tras timeout. Abortando.`);
                throw new Error('Recovery failed after timeout');
              }
            }

            clientOk = result === 'ok' || result === 'partial';
          } catch (e: any) {
            logger(`   ❌ Error inesperado: ${e.message}`);
            if (e.message?.includes('detached') || e.message?.includes('disposed') || e.message?.includes('crashed')) {
              const recovered = await recoverPage();
              if (!recovered) {
                logger(`   ❌ No se pudo recuperar. Abortando.`);
                throw e;
              }
            } else {
              try {
                await page.goto('https://go.qvet.net/Home/Index', { waitUntil: 'networkidle2', timeout: 10000 });
              } catch { /* ignore */ }
            }
          }

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          if (clientOk) {
            batchApplied.push(intent.idArticulo);
            progress.totalApplied++;
            logger(`   ✅ (${elapsed}s)`);
          } else {
            batchFailed.push(intent.idArticulo);
            progress.failed.push(intent.idArticulo);
            progress.totalFailed++;
            logger(`   ❌ (${elapsed}s)${timedOut ? ' TIMEOUT' : ''}`);
          }

          progress.processed.push(intent.idArticulo);
          saveProgress(progressPath, progress);
          await delay(500);
        }

        // Batch summary
        progress.batches.push({
          batch: batchNum,
          applied: batchApplied.length,
          failed: batchFailed.length,
          timestamp: new Date().toISOString(),
        });
        saveProgress(progressPath, progress);

        logger(`\n--- Lote ${batchNum}: ✅ ${batchApplied.length} OK, ❌ ${batchFailed.length} fallidos ---`);
        if (batchFailed.length > 0) {
          logger(`   IDs fallidos: ${batchFailed.join(', ')}`);
        }
        logger(`--- Acumulado: ✅ ${progress.totalApplied} / ❌ ${progress.totalFailed} / Total: ${progress.processed.length}/${intents.length} ---`);
      }
    }

    logger('\n========================================');
    logger('📊 RESUMEN FINAL');
    logger('========================================');
    logger(`✅ Aplicados total: ${progress.totalApplied}`);
    logger(`❌ Fallidos total: ${progress.totalFailed}`);
    logger(`📊 Procesados: ${progress.processed.length}/${intents.length}`);
    if (progress.failed.length > 0) {
      logger(`\n❌ IDs con error: ${progress.failed.join(', ')}`);
    }
    logger(`\n📄 Progreso guardado en: ${progressPath}`);
    logger(`   (usa --reset para empezar de cero)`);

    if (!dryRun) {
      logger('\n⏳ Cerrando en 5 segundos...');
      await delay(5000);
    }
  } catch (error: any) {
    log(`\n❌ Error fatal: ${error.message}`);
    logger(`\n❌ Error fatal: ${error.message}`);
    logger(`📊 Progreso guardado. Procesados: ${progress.processed.length}/${intents.length}`);
    logger(`   Re-ejecuta el mismo comando para continuar donde se quedó.`);
    saveProgress(progressPath, progress);
  } finally {
    closeLogger();
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(console.error);
