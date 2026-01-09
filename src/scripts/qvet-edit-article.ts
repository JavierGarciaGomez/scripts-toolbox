/**
 * QVET Edit Article - Puppeteer
 *
 * Edita un artículo usando automatización del navegador
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
  console.log('⚠️  No se pudo cargar .env');
}

const QVET_USER = process.env.QVET_USER || '';
const QVET_PASS = process.env.QVET_PASS || '';
const QVET_AUTO = process.env.QVET_AUTO || '';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function login(page: Page): Promise<boolean> {
  console.log('🔐 Iniciando login...');

  await page.goto('https://go.qvet.net/', { waitUntil: 'networkidle2' });
  await delay(2000);

  // Fill login form using the correct IDs
  console.log('   Llenando formulario...');
  await page.waitForSelector('#Clinica', { timeout: 10000 });
  await page.type('#Clinica', QVET_AUTO, { delay: 100 });
  await delay(300);
  await page.type('#UserName', QVET_USER, { delay: 100 });
  await delay(300);
  await page.type('#Password', QVET_PASS, { delay: 100 });
  await delay(500);

  // Click login button
  console.log('   Haciendo clic en login...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    page.click('#btnLogin'),
  ]);
  await delay(2000);

  // Check if we need to select location (AutoLogin page)
  const currentUrl = page.url();
  if (currentUrl.includes('AutoLogin')) {
    console.log('   Seleccionando sucursal...');
    try {
      await page.waitForSelector('#IdCentro', { timeout: 5000 });

      // Click dropdown to open it
      await page.click('.k-dropdown-wrap');
      await delay(500);

      // Select the first location
      await page.evaluate(() => {
        const items = document.querySelectorAll('#IdCentro_listbox li');
        if (items.length > 0) {
          (items[0] as HTMLElement).click();
        }
      });
      await delay(1000);

      // Click login again
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
        page.click('#btnLogin'),
      ]);
      await delay(2000);
    } catch (e) {
      console.log('   ⚠️  Error en AutoLogin:', e);
    }
  }

  // Wait for home to load
  try {
    await page.waitForSelector('.main-menu, .navbar', { timeout: 15000 });
    console.log('   ✅ Login exitoso');
    return true;
  } catch {
    console.log('   ❌ Login falló');
    return false;
  }
}

async function navigateToArticles(page: Page): Promise<boolean> {
  console.log('📁 Navegando a Artículos...');

  // Click on "Inicio" menu and then "Artículos/Conceptos"
  try {
    // Try clicking the menu item directly via evaluate
    const clicked = await page.evaluate(() => {
      // Look for menu items containing "Artículos"
      const links = document.querySelectorAll('a, .menu-item, .nav-link');
      for (const link of links) {
        const text = link.textContent || '';
        if (text.includes('Artículos') || text.includes('Conceptos')) {
          (link as HTMLElement).click();
          return true;
        }
      }

      // Try clicking on the sidebar/menu
      const menuItems = document.querySelectorAll('[data-action*="Articulos"], [href*="Articulos"]');
      if (menuItems.length > 0) {
        (menuItems[0] as HTMLElement).click();
        return true;
      }

      return false;
    });

    if (clicked) {
      await delay(2000);
      console.log('   ✅ Navegación exitosa');
      return true;
    }

    console.log('   ⚠️  No se encontró el menú de Artículos');
    return false;
  } catch (e) {
    console.log('   ❌ Error navegando:', e);
    return false;
  }
}

async function searchArticle(page: Page, idArticulo: string): Promise<boolean> {
  console.log(`🔍 Buscando artículo ID: ${idArticulo}...`);

  try {
    // Wait for the grid filter
    await page.waitForSelector('[name*="IdArticulo"], input[placeholder*="código"]', { timeout: 10000 });

    // Try to find the ID search field
    const idField = await page.$('input[name*="IdArticulo"]');
    if (idField) {
      await idField.click({ clickCount: 3 }); // Select all
      await idField.type(idArticulo);
      await page.keyboard.press('Enter');
      await delay(2000);
      console.log('   ✅ Búsqueda realizada');
      return true;
    }

    // Alternative approach
    await page.evaluate((id) => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        const name = input.getAttribute('name') || '';
        const placeholder = input.getAttribute('placeholder') || '';
        if (name.includes('IdArticulo') || placeholder.includes('código')) {
          input.value = id;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
          break;
        }
      }
    }, idArticulo);
    await delay(2000);
    return true;
  } catch (e) {
    console.log('   ❌ Error buscando:', e);
    return false;
  }
}

async function openArticleForEdit(page: Page): Promise<boolean> {
  console.log('📝 Abriendo artículo para editar...');

  try {
    // DOUBLE click on the first row of the grid to open the article
    await page.waitForSelector('.k-grid-content tr', { timeout: 5000 });

    // Get the first row element
    const row = await page.$('.k-grid-content tr');
    if (row) {
      // Double click to open the article
      await row.click({ clickCount: 2 });
      console.log('   Doble clic realizado, esperando formulario...');
    }

    await delay(3000);

    // Wait for the edit form to load (modal or new page)
    await page.waitForSelector('input[name="Referencia"], input[name*="Referencia"], .FichaArticulo', { timeout: 15000 });
    console.log('   ✅ Formulario de edición abierto');
    return true;
  } catch (e) {
    console.log('   ❌ Error abriendo artículo:', e);
    return false;
  }
}

async function clickOnTab(page: Page, tabName: string): Promise<boolean> {
  try {
    const clicked = await page.evaluate((name) => {
      // Find tab by name in Kendo TabStrip
      const tabs = document.querySelectorAll('.k-tabstrip-items .k-link, .k-tabstrip .k-item span');
      for (const tab of tabs) {
        if (tab.textContent?.toLowerCase().includes(name.toLowerCase())) {
          (tab as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, tabName);
    if (clicked) {
      await delay(1000);
      return true;
    }
  } catch {
    // Ignore errors
  }
  return false;
}

async function editFields(page: Page, cambios: Record<string, string>): Promise<boolean> {
  console.log('✏️  Editando campos...');

  try {
    // Wait for the modal window to be fully loaded
    await page.waitForSelector('.k-window-content, .FichaArticulo', { timeout: 10000 });
    console.log('   Modal detectado');

    for (const [fieldName, appendValue] of Object.entries(cambios)) {
      console.log(`   📝 Editando ${fieldName}...`);

      // If field is Observacions, click on that tab first
      if (fieldName === 'Observacions') {
        console.log(`      Buscando pestaña Observaciones...`);
        await clickOnTab(page, 'Observaciones');
        await delay(500);
      }

      // Use evaluate to find and modify the field INSIDE the modal
      const result = await page.evaluate((name, value) => {
        // First, try to find the modal/window content
        const modal = document.querySelector('.k-window-content') || document.querySelector('.FichaArticulo') || document;

        // Search for the field within the modal
        const selectors = [
          `input[name="${name}"]`,
          `textarea[name="${name}"]`,
          `input[name$="${name}"]`,
          `textarea[name$="${name}"]`,
          `input[id$="${name}"]`,
          `textarea[id$="${name}"]`,
        ];

        let field: HTMLInputElement | HTMLTextAreaElement | null = null;
        for (const sel of selectors) {
          field = modal.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
          if (field) break;
        }

        if (!field) {
          return { error: 'Campo no encontrado' };
        }

        const current = field.value;

        // Check if already contains the value
        if (current.includes(value)) {
          return { current, alreadyHas: true };
        }

        // Calculate new value
        const newValue = current ? `${current} ${value}` : value;

        // Set the value
        field.value = newValue;

        // Trigger events so Kendo UI picks up the change
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.dispatchEvent(new Event('blur', { bubbles: true }));

        // Also try to update Kendo widget if exists
        try {
          const $ = (window as any).jQuery;
          if ($) {
            $(field).trigger('change');
          }
        } catch {
          // Ignore jQuery errors
        }

        return { current, newValue, success: true };
      }, fieldName, appendValue);

      if (result.error) {
        console.log(`      ⚠️  ${result.error}: ${fieldName}`);
      } else if (result.alreadyHas) {
        console.log(`      Ya contiene "${appendValue}"`);
      } else {
        console.log(`      "${result.current}" → "${result.newValue}"`);
      }
    }
    return true;
  } catch (e) {
    console.log('   ❌ Error editando:', e);
    return false;
  }
}

async function saveArticle(page: Page): Promise<boolean> {
  console.log('💾 Guardando artículo...');

  try {
    // Find and click the save button
    const saveButton = await page.$('.btn-guardar, button[title="Guardar"], .fa-floppy-disk');
    if (saveButton) {
      await saveButton.click();
      await delay(3000);

      // Check for success message or that the form closed
      console.log('   ✅ Artículo guardado');
      return true;
    }

    // Alternative: click by text
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, .btn');
      for (const btn of buttons) {
        if (btn.textContent?.includes('Guardar') || btn.getAttribute('title')?.includes('Guardar')) {
          (btn as HTMLElement).click();
          return;
        }
      }
      // Try clicking save icon
      const saveIcon = document.querySelector('.fa-floppy-disk, .fa-save');
      if (saveIcon) {
        (saveIcon as HTMLElement).click();
      }
    });
    await delay(3000);
    console.log('   ✅ Artículo guardado');
    return true;
  } catch (e) {
    console.log('   ❌ Error guardando:', e);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const idArticulo = args.find(a => !a.startsWith('--')) || '7442';
  const headless = args.includes('--headless');

  console.log('🏥 QVET Edit Article');
  console.log('====================\n');
  console.log(`🔍 Artículo: ${idArticulo}`);
  console.log(`👤 Usuario: ${QVET_USER}`);
  console.log(`🖥️  Modo: ${headless ? 'Headless' : 'Con ventana'}\n`);

  if (!QVET_USER || !QVET_PASS || !QVET_AUTO) {
    console.log('❌ Faltan credenciales en .env');
    console.log('   Necesitas: QVET_USER, QVET_PASS, QVET_AUTO');
    process.exit(1);
  }

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: headless,
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

    // Search for the article
    await searchArticle(page, idArticulo);
    await delay(2000);

    // Open the article for editing
    await openArticleForEdit(page);
    await delay(1000);

    // Edit the fields
    const cambios = {
      'Referencia': 'TEST',
      'Observacions': 'TEST',
    };
    await editFields(page, cambios);

    // Save
    await saveArticle(page);

    console.log('\n🎉 ¡Proceso completado!');

    // Keep browser open if not headless
    if (!headless) {
      console.log('\n⏳ El navegador permanecerá abierto 10 segundos para verificar...');
      await delay(10000);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(console.error);
