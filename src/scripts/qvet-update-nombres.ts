/**
 * QVET Update Nombres - Actualiza Descripcion1 y Descripcion2 desde Excel de validación
 *
 * Lee la hoja "Validación" de un Excel y actualiza los nombres de artículos en QVET
 * donde el nombre propuesto difiere del actual.
 *
 * Uso:
 *   npx ts-node src/scripts/qvet-update-nombres.ts <archivo.xlsx>
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Cargar .env
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && match[1] && match[2]) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  }
} catch (err) {
  console.log('⚠️  No se pudo cargar .env');
}

const QVET_USER = process.env.QVET_USER || '';
const QVET_PASS = process.env.QVET_PASS || '';
const QVET_AUTO = process.env.QVET_AUTO || '';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// =============================================================================
// Tipos
// =============================================================================

interface ArticleChange {
  codigo: number;
  nombreActual: string;
  nombrePropuesto: string;
}

interface ChangeResult {
  codigo: number;
  nombreActual: string;
  nombrePropuesto: string;
  status: 'success' | 'error' | 'skipped';
  error?: string;
}

// =============================================================================
// Funciones de Excel
// =============================================================================

function readChangesFromExcel(filePath: string): ArticleChange[] {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });

  const sheet = workbook.Sheets['Validación'];
  if (!sheet) {
    throw new Error('No se encontró la hoja "Validación" en el Excel');
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const changes: ArticleChange[] = [];

  // Empezar desde fila 1 (fila 0 son headers)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    const codigo = parseInt(row[0] || '0');
    const nombreActual = (row[1] || '').toString().trim();
    const nombrePropuesto = (row[2] || '').toString().trim();

    // Solo incluir si hay un cambio real
    if (codigo && nombrePropuesto && nombreActual !== nombrePropuesto) {
      changes.push({ codigo, nombreActual, nombrePropuesto });
    }
  }

  return changes;
}

// =============================================================================
// Funciones de Puppeteer
// =============================================================================

async function loginQVET(page: Page): Promise<boolean> {
  console.log('🔐 Iniciando login...');

  try {
    await page.goto('https://go.qvet.net/', { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(3000);

    await page.waitForSelector('#Clinica', { timeout: 15000 });
    await page.type('#Clinica', QVET_AUTO, { delay: 80 });
    await delay(300);
    await page.type('#UserName', QVET_USER, { delay: 80 });
    await delay(300);
    await page.type('#Password', QVET_PASS, { delay: 80 });
    await delay(500);

    await page.click('#btnLogin');
    await delay(5000);

    const currentUrl = page.url();

    if (currentUrl.includes('AutoLogin')) {
      await delay(2000);
      try {
        await page.waitForSelector('#IdCentro', { timeout: 15000 });
        await delay(1000);

        await page.evaluate(() => {
          const wrapper = document.querySelector('.k-dropdown-wrap') ||
                         document.querySelector('[aria-owns="IdCentro_listbox"]');
          if (wrapper) (wrapper as HTMLElement).click();
        });

        await delay(1000);
        await page.evaluate(() => {
          const items = document.querySelectorAll('#IdCentro_listbox li');
          if (items.length > 0) (items[0] as HTMLElement).click();
        });
        await delay(1500);

        await page.click('#btnLogin');
        await delay(5000);
      } catch (e: any) {
        console.log(`   Error en AutoLogin: ${e.message}`);
      }
    }

    const finalUrl = page.url();
    if (finalUrl.includes('/Home') || finalUrl.includes('Index')) {
      console.log('   ✅ Login exitoso\n');
      return true;
    }

    return false;
  } catch (e: any) {
    console.log(`   ❌ Error en login: ${e.message}`);
    return false;
  }
}

async function navigateToArticles(page: Page): Promise<boolean> {
  try {
    const clicked = await page.evaluate(() => {
      const links = document.querySelectorAll('a, .menu-item, .nav-link');
      for (const link of links) {
        const text = link.textContent || '';
        if (text.includes('Artículos') || text.includes('Conceptos')) {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      await delay(3000);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function openArticle(page: Page, codigo: number): Promise<boolean> {
  try {
    // Buscar el campo de búsqueda por ID de artículo
    const searchField = await page.$('input[name*="IdArticulo"]') as any;
    if (searchField) {
      await searchField.click({ clickCount: 3 });
      await page.keyboard.type(String(codigo));
      await page.keyboard.press('Enter');
      await delay(2000);
    }

    // Doble click en la fila para abrir
    const row = await page.$('.k-grid-content tr');
    if (row) {
      await row.click({ clickCount: 2 });
    }
    await delay(3000);

    await page.waitForSelector('.k-window-content, .FichaArticulo', { timeout: 10000 });
    return true;
  } catch (e: any) {
    return false;
  }
}

async function selectTab(page: Page, tabName: string): Promise<boolean> {
  return await page.evaluate((name) => {
    const $ = (window as any).jQuery;
    if (!$) return false;

    const tabStrips = $('[data-role="tabstrip"]');
    for (let i = 0; i < tabStrips.length; i++) {
      const tabStrip = $(tabStrips[i]).data('kendoTabStrip');
      if (!tabStrip) continue;

      const items = tabStrip.tabGroup.children('li');
      for (let j = 0; j < items.length; j++) {
        const text = $(items[j]).text().trim();
        if (text.toLowerCase().includes(name.toLowerCase())) {
          tabStrip.select(j);
          return true;
        }
      }
    }
    return false;
  }, tabName);
}

async function editTextField(page: Page, selector: string, value: string): Promise<boolean> {
  try {
    const input = await page.$(selector);
    if (!input) return false;

    await input.click({ clickCount: 3 });
    await delay(100);
    await page.keyboard.type(value);
    return true;
  } catch (e) {
    return false;
  }
}

async function saveArticle(page: Page): Promise<boolean> {
  try {
    const saved = await page.evaluate(() => {
      const modal = document.querySelector('.k-window-content') || document;

      // Buscar por clase
      const guardarBtn = modal.querySelector('button.guardar, [id$="_guardar"]');
      if (guardarBtn) {
        (guardarBtn as HTMLElement).click();
        return true;
      }

      // Buscar por texto
      const buttons = modal.querySelectorAll('button, .btn, .k-button');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('guardar')) {
          (btn as HTMLElement).click();
          return true;
        }
      }

      return false;
    });

    await delay(3000);
    return saved;
  } catch (e) {
    return false;
  }
}

async function closeArticle(page: Page): Promise<void> {
  try {
    await page.keyboard.press('Escape');
    await delay(1000);
  } catch (e) {
    // Ignorar
  }
}

// =============================================================================
// Procesar cambios
// =============================================================================

async function processChanges(page: Page, changes: ArticleChange[]): Promise<ChangeResult[]> {
  const results: ChangeResult[] = [];

  console.log(`\n📝 Procesando ${changes.length} artículos...\n`);

  // Navegar a Artículos UNA sola vez
  await navigateToArticles(page);
  await delay(2000);

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]!;
    console.log(`[${i + 1}/${changes.length}] Artículo ${change.codigo}:`);
    console.log(`   "${change.nombreActual}"`);
    console.log(`   → "${change.nombrePropuesto}"`);

    try {

      const opened = await openArticle(page, change.codigo);
      if (!opened) {
        console.log(`   ❌ No se pudo abrir el artículo`);
        results.push({
          codigo: change.codigo,
          nombreActual: change.nombreActual,
          nombrePropuesto: change.nombrePropuesto,
          status: 'error',
          error: 'No se pudo abrir el artículo'
        });
        continue;
      }

      // Asegurarse de estar en la pestaña "Datos generales"
      await selectTab(page, 'Datos generales');
      await delay(1000);

      // Actualizar Descripción 1
      const desc1Updated = await editTextField(page, '[id$="_Descripcio1"]', change.nombrePropuesto);
      if (!desc1Updated) {
        console.log(`   ⚠️ No se pudo actualizar Descripción 1`);
      }

      // Actualizar Descripción 2
      const desc2Updated = await editTextField(page, '[id$="_Descripcio2"]', change.nombrePropuesto);
      if (!desc2Updated) {
        console.log(`   ⚠️ No se pudo actualizar Descripción 2`);
      }

      // Guardar
      const saved = await saveArticle(page);
      if (saved) {
        console.log(`   ✅ Guardado`);
        results.push({
          codigo: change.codigo,
          nombreActual: change.nombreActual,
          nombrePropuesto: change.nombrePropuesto,
          status: 'success'
        });
      } else {
        console.log(`   ❌ Error al guardar`);
        results.push({
          codigo: change.codigo,
          nombreActual: change.nombreActual,
          nombrePropuesto: change.nombrePropuesto,
          status: 'error',
          error: 'Error al guardar'
        });
      }

      // Cerrar y liberar bloqueo
      await closeArticle(page);
      await delay(500);

    } catch (e: any) {
      console.log(`   ❌ Error: ${e.message}`);
      results.push({
        codigo: change.codigo,
        nombreActual: change.nombreActual,
        nombrePropuesto: change.nombrePropuesto,
        status: 'error',
        error: e.message
      });
      await closeArticle(page);
    }
  }

  return results;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || !args[0]) {
    console.log('❌ Uso: npx ts-node src/scripts/qvet-update-nombres.ts <archivo.xlsx>');
    process.exit(1);
  }

  const excelPath: string = args[0];
  if (!fs.existsSync(excelPath)) {
    console.log(`❌ Archivo no encontrado: ${excelPath}`);
    process.exit(1);
  }

  console.log('🏥 QVET Update Nombres');
  console.log('======================\n');
  console.log(`📄 Archivo: ${excelPath}`);
  console.log(`👤 Usuario: ${QVET_USER}`);
  console.log(`🏢 Clínica: ${QVET_AUTO}\n`);

  if (!QVET_USER || !QVET_PASS || !QVET_AUTO) {
    console.log('❌ Faltan credenciales en .env');
    process.exit(1);
  }

  // Leer cambios del Excel
  console.log('📊 Leyendo Excel...');
  const changes = readChangesFromExcel(excelPath);

  if (changes.length === 0) {
    console.log('   ℹ️  No se detectaron cambios (nombres iguales)');
    process.exit(0);
  }

  console.log(`   ✅ ${changes.length} artículos con cambios detectados\n`);

  // Ejecutar
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
      defaultViewport: null,
    });

    const page = await browser.newPage();

    const loginOk = await loginQVET(page);
    if (!loginOk) {
      throw new Error('Login falló');
    }

    const results = await processChanges(page, changes);

    // Resumen final
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;

    console.log('\n========================================');
    console.log('📊 RESUMEN FINAL');
    console.log('========================================');
    console.log(`✅ Exitosos: ${successful}`);
    console.log(`❌ Fallidos: ${failed}`);

    // Guardar reporte
    const dataDir = path.join(process.cwd(), 'data', 'qvet');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const reportPath = path.join(dataDir, `reporte-nombres-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({ timestamp, results }, null, 2));
    console.log(`\n📄 Reporte guardado en: ${reportPath}`);

    console.log('\n⏳ Cerrando en 5 segundos...');
    await delay(5000);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(console.error);
