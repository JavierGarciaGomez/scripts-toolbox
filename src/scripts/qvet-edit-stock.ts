/**
 * QVET Edit Stock - Puppeteer
 *
 * Edita el stock mínimo y óptimo de un artículo en un almacén específico
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
      await delay(2000);
      try {
        // Wait for the dropdown to be ready
        await page.waitForSelector('#IdCentro', { timeout: 15000 });
        await delay(1000);

        // Try clicking on the dropdown wrapper
        const dropdownClicked = await page.evaluate(() => {
          const wrapper = document.querySelector('.k-dropdown-wrap') ||
                         document.querySelector('[aria-owns="IdCentro_listbox"]') ||
                         document.querySelector('#IdCentro');
          if (wrapper) {
            (wrapper as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (dropdownClicked) {
          await delay(1000);
          await page.evaluate(() => {
            const items = document.querySelectorAll('#IdCentro_listbox li');
            if (items.length > 0) {
              (items[0] as HTMLElement).click();
            }
          });
          await delay(1500);
        }

        await page.click('#btnLogin');
        await delay(5000);
      } catch (e: any) {
        console.log(`   Error en AutoLogin: ${e.message}`);
      }
    }

    const loggedIn = await Promise.race([
      page.waitForSelector('.main-menu', { timeout: 20000 }).then(() => true).catch(() => false),
      page.waitForSelector('.navbar', { timeout: 20000 }).then(() => true).catch(() => false),
      page.waitForSelector('#navbarContent', { timeout: 20000 }).then(() => true).catch(() => false),
    ]);

    if (loggedIn) {
      console.log('   ✅ Login exitoso\n');
      return true;
    }

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

interface StockConfig {
  idArticulo: number;
  almacen: string;
  stockMin: number;
  stockOptimo: number;
}

async function editArticleStock(page: Page, config: StockConfig): Promise<{ success: boolean; error?: string }> {
  const { idArticulo, almacen, stockMin, stockOptimo } = config;

  try {
    // Search for the article
    const searchField = await page.$('input[name*="IdArticulo"]') as any;
    if (searchField) {
      await searchField.click({ clickCount: 3 });
      await page.keyboard.type(String(idArticulo));
      await page.keyboard.press('Enter');
      await delay(2000);
    }

    // Check if article was found
    const rowExists = await page.$('.k-grid-content tr');
    if (!rowExists) {
      return { success: false, error: 'Artículo no encontrado en grid' };
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
      return { success: false, error: 'Modal no se abrió' };
    }

    // Click on "Almacenes" tab using Kendo API
    console.log('   Buscando pestaña Almacenes...');

    // Try to use Kendo TabStrip API to select the tab
    const tabResult = await page.evaluate(() => {
      const $ = (window as any).jQuery;
      if (!$) return { success: false, error: 'jQuery not found' };

      // Find the TabStrip widget
      const tabStrips = $('[data-role="tabstrip"]');
      if (tabStrips.length === 0) return { success: false, error: 'No TabStrip found' };

      for (let i = 0; i < tabStrips.length; i++) {
        const tabStrip = $(tabStrips[i]).data('kendoTabStrip');
        if (!tabStrip) continue;

        // Find the Almacenes tab
        const items = tabStrip.tabGroup.children('li');
        for (let j = 0; j < items.length; j++) {
          const item = $(items[j]);
          const text = item.text().trim();
          if (text.includes('Almacenes')) {
            // Select this tab using Kendo API
            tabStrip.select(j);
            return { success: true, tabIndex: j, text };
          }
        }
      }

      return { success: false, error: 'Almacenes tab not found in any TabStrip' };
    });

    console.log(`   Resultado Kendo: ${JSON.stringify(tabResult)}`);

    if (!tabResult.success) {
      // Fallback: try direct click
      console.log('   Intentando click directo...');
      const tabCoords = await page.evaluate(() => {
        const kLinks = document.querySelectorAll('span.k-link');
        for (const link of kLinks) {
          if (!link) continue;
          const text = link.textContent?.trim() || '';
          if (text.includes('Almacenes')) {
            const rect = link.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          }
        }
        return null;
      });

      if (tabCoords) {
        await page.mouse.click(tabCoords.x, tabCoords.y);
      } else {
        await page.keyboard.press('Escape');
        await delay(500);
        return { success: false, error: 'Pestaña Almacenes no encontrada' };
      }
    }

    await delay(3000);

    // Find the almacenes grid and the row for the warehouse
    console.log(`   Buscando almacén "${almacen}" en grid...`);

    // Use Kendo Grid API to edit the cells
    const editResult = await page.evaluate((almacenName, minStock, optimoStock) => {
      const $ = (window as any).jQuery;
      if (!$) return { success: false, error: 'jQuery not found' };

      // Find the Almacenes grid
      const gridElement = $('[id*="GridAlmacenes"]');
      if (gridElement.length === 0) return { success: false, error: 'Grid not found' };

      const grid = gridElement.data('kendoGrid');
      if (!grid) return { success: false, error: 'Kendo Grid not initialized' };

      // Find the row for the warehouse
      const dataSource = grid.dataSource;
      const data = dataSource.data();
      let targetItem = null;
      let targetIndex = -1;

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const nombre = (item.NombreAlmacen || '').toLowerCase();
        if (nombre.includes(almacenName.toLowerCase())) {
          targetItem = item;
          targetIndex = i;
          break;
        }
      }

      if (!targetItem) {
        return { success: false, error: `Almacén "${almacenName}" no encontrado en datos` };
      }

      // Update the values directly in the data source
      targetItem.set('StockMinimo', minStock);
      targetItem.set('StockMaximo', optimoStock);

      // Mark the row as dirty so it gets saved
      targetItem.dirty = true;

      return {
        success: true,
        rowIndex: targetIndex,
        almacen: targetItem.NombreAlmacen,
        oldMin: targetItem.StockMinimo,
        oldMax: targetItem.StockMaximo
      };
    }, almacen, stockMin, stockOptimo);

    console.log(`   Resultado edición: ${JSON.stringify(editResult)}`);

    if (!editResult.success) {
      await page.keyboard.press('Escape');
      await delay(500);
      return { success: false, error: editResult.error || 'Error editando grid' };
    }

    console.log(`   Stock editado: Min=${stockMin}, Óptimo=${stockOptimo}`);

    // Save the article
    await delay(1000);
    const saved = await page.evaluate(() => {
      const modal = document.querySelector('.k-window-content') || document;

      // Find save button/icon
      const saveIcon = modal.querySelector('.fa-floppy-disk, .fa-save, [class*="floppy"], [class*="save"]');
      if (saveIcon) {
        const btn = saveIcon.closest('button, a, .btn') || saveIcon.parentElement;
        if (btn) {
          (btn as HTMLElement).click();
          return true;
        }
      }

      const buttons = modal.querySelectorAll('button, .btn, .k-button');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        const title = btn.getAttribute('title')?.toLowerCase() || '';
        if (text.includes('guardar') || title.includes('guardar')) {
          (btn as HTMLElement).click();
          return true;
        }
      }

      return false;
    });

    await delay(3000);

    // Close modal if still open
    try {
      const modalStillOpen = await page.$('.k-window-content');
      if (modalStillOpen) {
        await page.keyboard.press('Escape');
        await delay(500);
      }
    } catch {}

    return { success: saved };

  } catch (e: any) {
    try {
      await page.keyboard.press('Escape');
      await delay(500);
    } catch {}

    return { success: false, error: e.message };
  }
}

async function main() {
  console.log('🏥 QVET Edit Stock');
  console.log('==================\n');

  // Configuration - multiple warehouses
  const idArticulo = 6242;
  const almacenes = ['urban', 'harbor', 'montejo'];
  const stockMin = 1;
  const stockOptimo = 6;

  console.log(`📦 Artículo: ${idArticulo}`);
  console.log(`🏪 Almacenes: ${almacenes.join(', ')}`);
  console.log(`📊 Stock Mínimo: ${stockMin}`);
  console.log(`📊 Stock Óptimo: ${stockOptimo}`);
  console.log(`👤 Usuario: ${QVET_USER}\n`);

  if (!QVET_USER || !QVET_PASS || !QVET_AUTO) {
    console.log('❌ Faltan credenciales en .env');
    process.exit(1);
  }

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

    // Edit the article stock for all warehouses in one go
    console.log(`\n📝 Editando artículo ${idArticulo}...`);

    // Search for the article
    const searchField = await page.$('input[name*="IdArticulo"]') as any;
    if (searchField) {
      await searchField.click({ clickCount: 3 });
      await page.keyboard.type(String(idArticulo));
      await page.keyboard.press('Enter');
      await delay(2000);
    }

    // Double click to open
    const row = await page.$('.k-grid-content tr');
    if (row) {
      await row.click({ clickCount: 2 });
    }
    await delay(3000);

    // Wait for modal
    await page.waitForSelector('.k-window-content, .FichaArticulo', { timeout: 10000 });

    // Open Almacenes tab using Kendo API
    console.log('   Abriendo pestaña Almacenes...');
    await page.evaluate(() => {
      const $ = (window as any).jQuery;
      const tabStrips = $('[data-role="tabstrip"]');
      for (let i = 0; i < tabStrips.length; i++) {
        const tabStrip = $(tabStrips[i]).data('kendoTabStrip');
        if (!tabStrip) continue;
        const items = tabStrip.tabGroup.children('li');
        for (let j = 0; j < items.length; j++) {
          if ($(items[j]).text().includes('Almacenes')) {
            tabStrip.select(j);
            return;
          }
        }
      }
    });
    await delay(2000);

    // Edit all warehouses using double-click on cells
    for (const almacen of almacenes) {
      console.log(`   Editando ${almacen}...`);

      // Find the row and get cell coordinates for StockMinimo
      const cellInfo = await page.evaluate((almacenName) => {
        const $ = (window as any).jQuery;
        const gridElement = $('[id*="GridAlmacenes"]');
        const grid = gridElement.data('kendoGrid');
        if (!grid) return null;

        const data = grid.dataSource.data();
        for (let i = 0; i < data.length; i++) {
          const item = data[i];
          if ((item.NombreAlmacen || '').toLowerCase().includes(almacenName.toLowerCase())) {
            // Find the row in the DOM
            const rows = gridElement.find('tbody tr.k-master-row');
            const row = rows.eq(i);
            if (row.length === 0) return null;

            // Get visible cells (excluding hidden ones)
            const cells = row.find('td:visible');
            // cells order: expand(0), NombreAlmacen(1), CompraMin(2), CompraMin2(3), StockMinimo(4), StockMaximo(5), StockTotal(6)
            const stockMinCell = cells.eq(4);
            const stockMaxCell = cells.eq(5);

            const minRect = stockMinCell[0]?.getBoundingClientRect();
            const maxRect = stockMaxCell[0]?.getBoundingClientRect();

            return {
              almacen: item.NombreAlmacen,
              minX: minRect ? minRect.x + minRect.width / 2 : 0,
              minY: minRect ? minRect.y + minRect.height / 2 : 0,
              maxX: maxRect ? maxRect.x + maxRect.width / 2 : 0,
              maxY: maxRect ? maxRect.y + maxRect.height / 2 : 0
            };
          }
        }
        return null;
      }, almacen);

      if (!cellInfo) {
        console.log(`   ❌ ${almacen}: No encontrado`);
        continue;
      }

      // Double click on StockMinimo cell
      console.log(`      StockMinimo en (${Math.round(cellInfo.minX)}, ${Math.round(cellInfo.minY)})`);
      await page.mouse.click(cellInfo.minX, cellInfo.minY, { clickCount: 2 });
      await delay(500);

      // Clear and type new value
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.type(String(stockMin));
      await page.keyboard.press('Tab');
      await delay(300);

      // Double click on StockMaximo cell
      console.log(`      StockOptimo en (${Math.round(cellInfo.maxX)}, ${Math.round(cellInfo.maxY)})`);
      await page.mouse.click(cellInfo.maxX, cellInfo.maxY, { clickCount: 2 });
      await delay(500);

      // Clear and type new value
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.type(String(stockOptimo));
      await page.keyboard.press('Tab');
      await delay(300);

      console.log(`   ✅ ${cellInfo.almacen}: Min=${stockMin}, Óptimo=${stockOptimo}`);
    }

    // Save the article - use real click
    console.log('   Guardando...');
    const saveCoords = await page.evaluate(() => {
      const modal = document.querySelector('.k-window-content') || document;

      // Try multiple selectors for save button
      const selectors = [
        'button.guardar',
        '[id$="_guardar"]',
        'button.guardar.k-button',
        'i.fa-floppy-disk',
        'i.fa-save',
        '.fa-floppy-disk',
        '.fa-save',
        'button[title*="Guardar"]'
      ];

      for (const sel of selectors) {
        const el = modal.querySelector(sel);
        if (el) {
          const btn = el.closest('button, a, .btn, span') || el.parentElement || el;
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, selector: sel };
          }
        }
      }
      return null;
    });

    if (saveCoords) {
      console.log(`      Click en guardar: (${Math.round(saveCoords.x)}, ${Math.round(saveCoords.y)}) [${saveCoords.selector}]`);
      await page.mouse.click(saveCoords.x, saveCoords.y);
    } else {
      console.log('      ⚠️ Botón guardar no encontrado, usando Ctrl+S');
      await page.keyboard.down('Control');
      await page.keyboard.press('s');
      await page.keyboard.up('Control');
    }
    await delay(4000);

    // Close modal properly
    console.log('   Cerrando modal...');
    await page.keyboard.press('Escape');
    await delay(1000);

    // Try clicking close button if modal still open
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.k-window-action.k-button-icon .k-i-close, .k-window-titlebar .k-i-x');
      if (closeBtn) {
        const btn = closeBtn.closest('button, a, span') || closeBtn;
        (btn as HTMLElement).click();
      }
    });
    await delay(1000);

    // Navigate away to release the article lock
    console.log('   Liberando artículo...');
    await page.goto('https://go.qvet.net/Home/Index', { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    await delay(2000);

    console.log('\n✅ Proceso completado');

    // Keep browser open briefly to verify
    console.log('\n⏳ Cerrando en 10 segundos...');
    await delay(10000);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(console.error);
