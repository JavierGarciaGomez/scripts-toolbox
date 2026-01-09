/**
 * QVET Batch Edit - Puppeteer
 *
 * Edita múltiples artículos agregando un texto a Referencia
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Load .env
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
  console.log('No se pudo cargar .env');
}

const QVET_USER = process.env.QVET_USER || '';
const QVET_PASS = process.env.QVET_PASS || '';
const QVET_AUTO = process.env.QVET_AUTO || '';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// Lista de artículos a modificar
const ARTICLE_IDS = [
  3406, 5666, 5817, 6224, 4364, 3970, 4266, 1102, 4415, 3668,
  6245, 2992, 8661, 8659, 4527, 4525, 4524, 4526, 4528, 2112,
  4640, 4446, 6100, 2876, 8608, 7334, 4022, 8478, 3955, 6285,
  4418, 4421, 7343, 4420, 4422, 6286, 4419, 4417, 6098, 6097,
  2609, 8530, 7417, 7383, 7370, 7419, 7379, 7376, 7373, 7377,
  7381, 7369, 7371, 7382, 7372, 7375, 7378, 7380, 7420, 6277,
  6281, 4344, 4343, 7421, 7422, 6246, 3898, 8509, 7398, 7396,
  4434, 8510, 8630, 7397, 7395, 7394, 7439, 7423, 8641, 7438,
  4296, 4295, 8582, 7424, 7428, 7425, 7426, 7427, 7406, 7401,
  6247, 6258, 7432, 7429, 7390
];

const TEXT_TO_ADD = 'SCL';

interface EditResult {
  id: number;
  success: boolean;
  oldValue?: string | undefined;
  newValue?: string | undefined;
  error?: string | undefined;
  skipped?: boolean | undefined;
}

async function login(page: Page): Promise<boolean> {
  console.log('🔐 Iniciando login...');

  try {
    await page.goto('https://go.qvet.net/', { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(3000);

    console.log('   Llenando formulario...');
    await page.waitForSelector('#Clinica', { timeout: 15000 });
    await page.type('#Clinica', QVET_AUTO, { delay: 80 });
    await delay(300);
    await page.type('#UserName', QVET_USER, { delay: 80 });
    await delay(300);
    await page.type('#Password', QVET_PASS, { delay: 80 });
    await delay(500);

    console.log('   Haciendo clic en login...');
    await page.click('#btnLogin');
    await delay(5000);

    const currentUrl = page.url();
    console.log(`   URL actual: ${currentUrl}`);

    if (currentUrl.includes('AutoLogin')) {
      console.log('   Seleccionando sucursal...');
      try {
        await page.waitForSelector('#IdCentro', { timeout: 10000 });
        await page.click('.k-dropdown-wrap');
        await delay(800);
        await page.evaluate(() => {
          const items = document.querySelectorAll('#IdCentro_listbox li');
          if (items.length > 0) {
            (items[0] as HTMLElement).click();
          }
        });
        await delay(1500);
        await page.click('#btnLogin');
        await delay(5000);
      } catch (e: any) {
        console.log(`   Error en AutoLogin: ${e.message}`);
      }
    }

    // Check multiple possible selectors for logged-in state
    const loggedIn = await Promise.race([
      page.waitForSelector('.main-menu', { timeout: 20000 }).then(() => true).catch(() => false),
      page.waitForSelector('.navbar', { timeout: 20000 }).then(() => true).catch(() => false),
      page.waitForSelector('#navbarContent', { timeout: 20000 }).then(() => true).catch(() => false),
    ]);

    if (loggedIn) {
      console.log('   ✅ Login exitoso\n');
      return true;
    }

    // Check if we're on home page by URL
    const finalUrl = page.url();
    if (finalUrl.includes('/Home') || finalUrl.includes('Index')) {
      console.log('   ✅ Login exitoso (por URL)\n');
      return true;
    }

    console.log(`   ❌ Login falló - URL final: ${finalUrl}`);
    return false;
  } catch (e: any) {
    console.log(`   ❌ Error en login: ${e.message}`);
    return false;
  }
}

async function navigateToArticles(page: Page): Promise<boolean> {
  console.log('📁 Navegando a Artículos...');

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
      const menuItems = document.querySelectorAll('[data-action*="Articulos"], [href*="Articulos"]');
      if (menuItems.length > 0) {
        (menuItems[0] as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (clicked) {
      await delay(2000);
      console.log('   ✅ Navegación exitosa\n');
      return true;
    }
    return false;
  } catch (e) {
    console.log('   ❌ Error navegando');
    return false;
  }
}

async function processArticle(page: Page, idArticulo: number): Promise<EditResult> {
  try {
    // Clear and search for the article
    const searchField = await page.$('input[name*="IdArticulo"]') as any;
    if (searchField) {
      await searchField.click({ clickCount: 3 });
      await page.keyboard.type(String(idArticulo));
      await page.keyboard.press('Enter');
      await delay(2000);
    } else {
      // Alternative search
      await page.evaluate((id) => {
        const inputs = document.querySelectorAll('input');
        for (const input of inputs) {
          const name = input.getAttribute('name') || '';
          if (name.includes('IdArticulo')) {
            input.value = String(id);
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            break;
          }
        }
      }, idArticulo);
      await delay(2000);
    }

    // Wait for grid to update
    await delay(1500);

    // Check if article was found
    const rowExists = await page.$('.k-grid-content tr');
    if (!rowExists) {
      return { id: idArticulo, success: false, error: 'Artículo no encontrado en grid' };
    }

    // Double click to open
    const row = await page.$('.k-grid-content tr');
    if (row) {
      await row.click({ clickCount: 2 });
    }
    await delay(3000);

    // Wait for modal
    try {
      await page.waitForSelector('.k-window-content, .FichaArticulo', { timeout: 10000 });
    } catch {
      return { id: idArticulo, success: false, error: 'Modal no se abrió' };
    }

    // Edit Referencia field
    const result = await page.evaluate((textToAdd) => {
      const modal = document.querySelector('.k-window-content') || document.querySelector('.FichaArticulo') || document;

      const selectors = [
        'input[name="Referencia"]',
        'input[name$="Referencia"]',
        'input[id$="Referencia"]',
      ];

      let field: HTMLInputElement | null = null;
      for (const sel of selectors) {
        field = modal.querySelector(sel) as HTMLInputElement | null;
        if (field) break;
      }

      if (!field) {
        return { error: 'Campo Referencia no encontrado' };
      }

      const current = field.value || '';

      // Check if already contains SCL
      if (current.toUpperCase().includes(textToAdd.toUpperCase())) {
        return { current, skipped: true };
      }

      // Add SCL preserving existing content
      const newValue = current ? `${current} ${textToAdd}` : textToAdd;

      field.value = newValue;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.dispatchEvent(new Event('blur', { bubbles: true }));

      try {
        const $ = (window as any).jQuery;
        if ($) {
          $(field).trigger('change');
        }
      } catch {}

      return { current, newValue, success: true };
    }, TEXT_TO_ADD);

    if (result.error) {
      // Close modal
      await page.keyboard.press('Escape');
      await delay(500);
      return { id: idArticulo, success: false, error: result.error };
    }

    if (result.skipped) {
      // Close modal without saving
      await page.keyboard.press('Escape');
      await delay(500);
      return { id: idArticulo, success: true, oldValue: result.current, skipped: true };
    }

    // Save the article
    await delay(500);
    const saved = await page.evaluate(() => {
      // Find save button in modal
      const modal = document.querySelector('.k-window-content') || document;
      const buttons = modal.querySelectorAll('button, .btn, .k-button, i.fa-floppy-disk, i.fa-save');

      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        const title = btn.getAttribute('title')?.toLowerCase() || '';
        const className = btn.className?.toLowerCase() || '';

        if (text.includes('guardar') || title.includes('guardar') ||
            className.includes('save') || className.includes('floppy')) {
          (btn as HTMLElement).click();
          return true;
        }
      }

      // Try clicking parent of save icon
      const saveIcon = modal.querySelector('.fa-floppy-disk, .fa-save');
      if (saveIcon && saveIcon.parentElement) {
        (saveIcon.parentElement as HTMLElement).click();
        return true;
      }

      return false;
    });

    await delay(2000);

    // Close modal if still open
    try {
      const modalStillOpen = await page.$('.k-window-content');
      if (modalStillOpen) {
        await page.keyboard.press('Escape');
        await delay(500);
      }
    } catch {}

    return {
      id: idArticulo,
      success: saved,
      ...(result.current !== undefined ? { oldValue: result.current } : {}),
      ...(result.newValue !== undefined ? { newValue: result.newValue } : {}),
    };

  } catch (e: any) {
    // Try to close any open modal
    try {
      await page.keyboard.press('Escape');
      await delay(500);
    } catch {}

    return { id: idArticulo, success: false, error: e.message };
  }
}

async function main() {
  console.log('🏥 QVET Batch Edit');
  console.log('==================\n');
  console.log(`📋 Artículos a procesar: ${ARTICLE_IDS.length}`);
  console.log(`✏️  Texto a agregar: "${TEXT_TO_ADD}"`);
  console.log(`👤 Usuario: ${QVET_USER}\n`);

  if (!QVET_USER || !QVET_PASS || !QVET_AUTO) {
    console.log('❌ Faltan credenciales en .env');
    process.exit(1);
  }

  const results: EditResult[] = [];
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
      defaultViewport: null,
    });

    const page = await browser.newPage();

    // Login
    const loginOk = await login(page);
    if (!loginOk) {
      throw new Error('Login falló');
    }

    // Navigate to articles
    await navigateToArticles(page);
    await delay(2000);

    // Process each article
    let processed = 0;
    let modified = 0;
    let skipped = 0;
    let errors = 0;

    for (const id of ARTICLE_IDS) {
      processed++;
      process.stdout.write(`\r[${processed}/${ARTICLE_IDS.length}] Procesando artículo ${id}...`);

      const result = await processArticle(page, id);
      results.push(result);

      if (result.skipped) {
        skipped++;
        console.log(` ⏭️  Ya tiene SCL: "${result.oldValue}"`);
      } else if (result.success) {
        modified++;
        console.log(` ✅ "${result.oldValue}" → "${result.newValue}"`);
      } else {
        errors++;
        console.log(` ❌ ${result.error}`);
      }

      // Small delay between articles
      await delay(500);
    }

    console.log('\n\n📊 RESUMEN');
    console.log('==========');
    console.log(`✅ Modificados: ${modified}`);
    console.log(`⏭️  Omitidos (ya tenían SCL): ${skipped}`);
    console.log(`❌ Errores: ${errors}`);
    console.log(`📋 Total procesados: ${processed}`);

    // Save results to file
    const dataDir = path.join(process.cwd(), 'data', 'qvet');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsPath = path.join(dataDir, `batch-edit-${timestamp}.json`);
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Resultados guardados en: ${resultsPath}`);

    // Keep browser open briefly to verify
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
