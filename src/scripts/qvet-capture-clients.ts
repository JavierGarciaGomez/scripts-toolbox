/**
 * QVET Capture Client Fields
 *
 * Abre un cliente en QVET, captura el HTML de cada pestaña y lista todos los campos
 * editables (inputs, selects, textareas, checkboxes) con sus IDs y labels.
 *
 * Output: tmp/qvet-client-tabs/*.html + tmp/qvet-client-tabs/fields.json
 *
 * Usage:
 *   npx ts-node src/scripts/qvet-capture-clients.ts [idPropietario]
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
} catch {
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
      console.log('   Seleccionando sucursal URBAN...');
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
          let selected = false;
          for (const item of items) {
            const text = (item.textContent || '').toUpperCase();
            if (text.includes('URBAN')) {
              (item as HTMLElement).click();
              selected = true;
              break;
            }
          }
          if (!selected && items.length > 0) {
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

async function navigateToClients(page: Page): Promise<boolean> {
  console.log('📁 Navegando a Clientes / Mascotas...');
  const ssDir = path.join(process.cwd(), 'tmp', 'qvet-client-tabs');

  try {
    // Step 1: Click "Inicio" to expand the menu
    await page.evaluate(() => {
      const links = document.querySelectorAll('a, .menu-item, .nav-link, li');
      for (const link of links) {
        // Match only direct "Inicio" text (not child submenus)
        const directText = Array.from(link.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => (n.textContent || '').trim())
          .join('');
        if (directText === 'Inicio') {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    console.log('   Expandido "Inicio"');
    await delay(1500);
    await page.screenshot({ path: path.join(ssDir, 'nav-01-inicio-expanded.png') });

    // Step 2: Find and click "Clientes / Mascotas" - log what we find
    const menuItemInfo = await page.evaluate(() => {
      const results: { text: string; tag: string; href: string; visible: boolean; rect: any }[] = [];
      const all = document.querySelectorAll('a, li, span, div');
      for (const el of all) {
        const directText = Array.from(el.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => (n.textContent || '').trim())
          .join('');
        if (directText.includes('Clientes') || directText.includes('Mascotas')) {
          const rect = el.getBoundingClientRect();
          results.push({
            text: directText,
            tag: el.tagName,
            href: (el as HTMLAnchorElement).href || '',
            visible: rect.width > 0 && rect.height > 0,
            rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          });
        }
      }
      return results;
    });
    console.log('   Elementos con "Clientes":', JSON.stringify(menuItemInfo, null, 2));

    // Click the "Clientes / Mascotas" menu item - use textContent on <a> elements
    // (spans inside are 0x0 but their parent <a> or <li> is the clickable element)
    const clicked = await page.evaluate(() => {
      // Strategy 1: Find <a> tags whose textContent matches
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const text = (link.textContent || '').trim();
        if (text === 'Clientes / Mascotas') {
          const rect = link.getBoundingClientRect();
          (link as HTMLElement).click();
          return { clicked: true, tag: 'A', text, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
        }
      }

      // Strategy 2: Find span with the text and click its closest <a> or <li> parent
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        const directText = Array.from(span.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => (n.textContent || '').trim())
          .join('');
        if (directText === 'Clientes / Mascotas') {
          const parent = span.closest('a, li') || span.parentElement;
          if (parent) {
            const rect = parent.getBoundingClientRect();
            (parent as HTMLElement).click();
            return { clicked: true, tag: parent.tagName, text: directText, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
          }
        }
      }

      return { clicked: false };
    });

    console.log('   Click result:', JSON.stringify(clicked));

    if (!clicked.clicked) {
      console.log('   ⚠️ No se pudo hacer click en "Clientes / Mascotas"');
      return false;
    }

    await delay(2000);
    await page.screenshot({ path: path.join(ssDir, 'nav-02-after-click-clientes.png') });
    console.log(`   URL after click: ${page.url()}`);

    // Wait a bit more and check if content loaded
    await delay(3000);
    await page.screenshot({ path: path.join(ssDir, 'nav-03-after-wait.png') });

    // Save the full HTML of the page for analysis
    const html = await page.content();
    fs.writeFileSync(path.join(ssDir, 'nav-page-after-click.html'), html);
    console.log(`   HTML guardado (${Math.round(html.length / 1024)}KB)`);

    // Check what loaded in the main content area
    const pageInfo = await page.evaluate(() => {
      const mainContent = document.querySelector('#contenido, .content, main, [role="main"]') || document.body;
      const inputs = mainContent.querySelectorAll('input');
      const grids = mainContent.querySelectorAll('.k-grid');
      const frames = document.querySelectorAll('iframe');

      const inputInfo: string[] = [];
      inputs.forEach(i => {
        const el = i as HTMLInputElement;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) {
          inputInfo.push(`id="${el.id}" name="${el.name}" placeholder="${el.placeholder}" type="${el.type}"`);
        }
      });

      // Check for any new content that loaded
      const contentAreaHTML = mainContent.innerHTML.substring(0, 500);

      return {
        inputs: inputInfo,
        gridCount: grids.length,
        frameCount: frames.length,
        contentSnippet: contentAreaHTML,
        bodyClasses: document.body.className,
        url: window.location.href,
      };
    });

    console.log(`   Grids: ${pageInfo.gridCount}`);
    console.log(`   Frames: ${pageInfo.frameCount}`);
    console.log(`   Inputs visibles: ${JSON.stringify(pageInfo.inputs)}`);
    console.log(`   Content snippet: ${pageInfo.contentSnippet.substring(0, 200)}`);

    return true;
  } catch (e: any) {
    console.log(`   ❌ Error navegando: ${e.message}`);
    return false;
  }
}

async function listAllMenuItems(page: Page): Promise<void> {
  console.log('📋 Listando items del menú...\n');
  const items = await page.evaluate(() => {
    const result: string[] = [];
    const links = document.querySelectorAll('a, .menu-item, .nav-link');
    links.forEach(link => {
      const text = (link.textContent || '').trim();
      const href = (link as HTMLAnchorElement).href || '';
      if (text && text.length < 50) {
        result.push(`${text} → ${href}`);
      }
    });
    return [...new Set(result)];
  });

  for (const item of items) {
    console.log(`   ${item}`);
  }
  console.log('');
}

async function openClient(page: Page, idPropietario: number): Promise<boolean> {
  console.log(`📝 Abriendo cliente ${idPropietario}...`);
  const ssDir = path.join(process.cwd(), 'tmp', 'qvet-client-tabs');

  try {
    // Select "Todos" radio for Activos (to include inactive clients)
    await page.evaluate(() => {
      const radios = document.querySelectorAll('input[type="radio"][name="Activo_Basica"]');
      for (const radio of radios) {
        if ((radio as HTMLInputElement).value === 'on') {
          (radio as HTMLInputElement).click();
          return;
        }
      }
      // Fallback: click the third radio (Todos)
      if (radios.length >= 3) {
        (radios[2] as HTMLInputElement).click();
      }
    });
    console.log('   Seleccionado "Todos" en filtro Activos');
    await delay(500);

    // Find the "Código" (Id) field and type the client ID
    const idField = await page.$('input[name="Id"]');
    if (!idField) {
      console.log('   ❌ No se encontró campo "Código" (input[name="Id"])');
      return false;
    }

    await idField.click({ clickCount: 3 });
    await page.keyboard.type(String(idPropietario));
    console.log(`   ID "${idPropietario}" escrito en campo Código`);

    // Press Enter to search
    await page.keyboard.press('Enter');
    console.log('   Enter presionado para buscar');

    await delay(3000);
    await page.screenshot({ path: path.join(ssDir, 'after-search.png') });

    // Check if results appeared in the grid
    const gridInfo = await page.evaluate(() => {
      const grids = document.querySelectorAll('.k-grid');
      for (const grid of grids) {
        const rows = grid.querySelectorAll('.k-grid-content tr, tbody tr');
        if (rows.length > 0) {
          const firstRowText = rows[0]?.textContent?.trim().substring(0, 100) || '';
          return { found: true, rowCount: rows.length, firstRowText };
        }
      }
      return { found: false, rowCount: 0, firstRowText: '' };
    });

    console.log(`   Grid results: ${gridInfo.rowCount} filas`);
    if (gridInfo.firstRowText) {
      console.log(`   Primera fila: ${gridInfo.firstRowText}`);
    }

    if (gridInfo.rowCount === 0) {
      console.log('   ⚠️ No se encontraron resultados en el grid');
      return false;
    }

    // Double-click the first row in the main client grid (not the Plans de Salud grid)
    const rowCoords = await page.evaluate((prefix) => {
      const $ = (window as any).jQuery;
      if (!$) return null;
      // Use the main client grid specifically
      const gridEl = $(`#${prefix}_Grid`);
      if (gridEl.length === 0) return null;
      const row = gridEl.find('.k-grid-content tr').first();
      if (row.length === 0) return null;
      const rect = row[0].getBoundingClientRect();
      if (rect.width === 0) return null;
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, await page.evaluate(() => {
      // Get the dynamic prefix from any input with name="Id"
      const idInput = document.querySelector('input[name="Id"]') as HTMLInputElement;
      return idInput ? idInput.id.replace('_Id', '') : '';
    }));

    if (!rowCoords) {
      console.log('   ❌ No se encontró fila en el grid de clientes');
      await page.screenshot({ path: path.join(ssDir, 'no-row-found.png') });
      return false;
    }

    // Physical double-click using mouse coordinates
    await page.mouse.click(rowCoords.x, rowCoords.y, { clickCount: 2 });
    console.log(`   Doble click en fila (${Math.round(rowCoords.x)}, ${Math.round(rowCoords.y)})`);
    await delay(3000);
    await page.screenshot({ path: path.join(ssDir, 'after-doubleclick.png') });

    // Check if modal/window opened
    const modalOpened = await page.$('.k-window-content');
    if (modalOpened) {
      console.log('   ✅ Cliente abierto (modal)\n');
      return true;
    }

    // Maybe the view changed - check for tabstrip or new content
    const afterInfo = await page.evaluate(() => {
      return {
        windows: document.querySelectorAll('.k-window').length,
        tabstrips: document.querySelectorAll('[data-role="tabstrip"]').length,
        url: window.location.href,
        // Check if there are more inputs now (client form may have loaded)
        inputCount: document.querySelectorAll('input:not([type="hidden"])').length,
      };
    });
    console.log(`   After dblclick: windows=${afterInfo.windows}, tabstrips=${afterInfo.tabstrips}, inputs=${afterInfo.inputCount}`);
    console.log(`   URL: ${afterInfo.url}`);

    // Save HTML for debugging
    const html = await page.content();
    fs.writeFileSync(path.join(ssDir, 'after-dblclick-page.html'), html);

    return afterInfo.windows > 0 || afterInfo.tabstrips > 0;
  } catch (e: any) {
    console.log(`   ❌ Error: ${e.message}`);
    return false;
  }
}

interface FieldInfo {
  tag: string;
  id: string;
  name: string;
  type: string;
  value: string;
  label: string;
  visible: boolean;
  inModal: boolean;
  tab: string;
  selector: string;
}

async function captureFields(page: Page, tabName: string): Promise<FieldInfo[]> {
  return await page.evaluate((tab) => {
    const fields: FieldInfo[] = [];
    const container = document.querySelector('.k-window-content') || document;

    const elements = container.querySelectorAll('input, select, textarea');
    for (const el of elements) {
      const input = el as HTMLInputElement;
      const rect = input.getBoundingClientRect();

      // Find label
      let label = '';
      if (input.id) {
        const labelEl = document.querySelector(`label[for="${input.id}"]`);
        if (labelEl) label = labelEl.textContent?.trim() || '';
      }
      if (!label) {
        const parent = input.closest('.form-group, .k-widget, td, .editor-field, div');
        if (parent) {
          const labelEl = parent.querySelector('label, .editor-label, .k-label');
          if (labelEl) label = labelEl.textContent?.trim() || '';
        }
      }

      // Build a CSS selector
      let selector = '';
      if (input.id) {
        selector = `#${input.id}`;
      } else if (input.name) {
        selector = `[name="${input.name}"]`;
      }

      fields.push({
        tag: input.tagName.toLowerCase(),
        id: input.id || '',
        name: input.name || '',
        type: input.type || '',
        value: input.value || '',
        label,
        visible: rect.width > 0 && rect.height > 0,
        inModal: !!input.closest('.k-window-content'),
        tab,
        selector,
      });
    }

    return fields;
  }, tabName);
}

async function getTabNames(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const tabs: string[] = [];
    // Look for tabs inside the modal
    const modal = document.querySelector('.k-window-content') || document;
    const tabItems = modal.querySelectorAll('li.k-item[role="tab"]');
    tabItems.forEach(tab => {
      const text = tab.textContent?.trim() || '';
      if (text) tabs.push(text);
    });
    return tabs;
  });
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

async function captureTabHtml(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const modal = document.querySelector('.k-window-content') || document.body;
    return modal.innerHTML;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const idPropietario = parseInt(args[0] || '957864');

  const outputDir = path.join(process.cwd(), 'tmp', 'qvet-client-tabs');

  console.log('🏥 QVET Capture Client Fields');
  console.log('==============================\n');
  console.log(`👤 Cliente ID: ${idPropietario}`);
  console.log(`📁 Output: ${outputDir}\n`);

  if (!QVET_USER || !QVET_PASS || !QVET_AUTO) {
    console.log('❌ Faltan credenciales en .env');
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
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
    if (!loginOk) throw new Error('Login falló');

    // List menu items first
    await listAllMenuItems(page);

    // Take screenshot of home page
    await page.screenshot({ path: path.join(outputDir, 'home.png'), fullPage: false });

    // Navigate to clients
    const navOk = await navigateToClients(page);
    if (!navOk) {
      console.log('⚠️ No se pudo navegar automáticamente a Clientes.');
      console.log('   Revisa los items del menú listados arriba.');
      console.log('   El script se pausará 30 segundos para que navegues manualmente.');
      await page.screenshot({ path: path.join(outputDir, 'nav-fail.png'), fullPage: false });
      await delay(30000);
    }

    await page.screenshot({ path: path.join(outputDir, 'clients-list.png'), fullPage: false });
    await delay(2000);

    // Open a client
    const opened = await openClient(page, idPropietario);
    if (!opened) {
      console.log('⚠️ No se pudo abrir el cliente automáticamente.');
      console.log('   El script se pausará 30 segundos para que abras un cliente manualmente.');
      await delay(30000);
    }

    await page.screenshot({ path: path.join(outputDir, 'client-opened.png'), fullPage: false });

    // Get tab names
    const tabs = await getTabNames(page);
    console.log(`📑 Pestañas encontradas: ${tabs.length}`);
    tabs.forEach((t, i) => console.log(`   ${i}. ${t}`));
    console.log('');

    // Capture each tab
    const allFields: FieldInfo[] = [];

    for (let i = 0; i < tabs.length; i++) {
      const tabName = tabs[i]!;
      console.log(`📸 Capturando: [${i}] ${tabName}...`);

      const selected = await selectTab(page, tabName);
      if (!selected) {
        console.log(`   ⚠️ No se pudo seleccionar`);
        continue;
      }
      await delay(2000);

      // Capture HTML
      const html = await captureTabHtml(page);

      // Capture fields
      const tabFields = await captureFields(page, tabName);
      allFields.push(...tabFields);

      // Take screenshot
      await page.screenshot({ path: path.join(outputDir, `tab-${i}-${tabName.replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: false });

      // Save HTML
      const filename = `tab-${i}-${tabName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>QVET Client - ${tabName}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
  </style>
</head>
<body>
  <h1>Pestaña ${i}: ${tabName}</h1>
  <p>Cliente: ${idPropietario}</p>
  <p>Capturado: ${new Date().toISOString()}</p>
  <hr>
  ${html}
</body>
</html>`;

      fs.writeFileSync(path.join(outputDir, `${filename}.html`), fullHtml);

      // Print visible fields for this tab
      const visibleFields = tabFields.filter(f => f.visible && f.type !== 'hidden');
      if (visibleFields.length > 0) {
        console.log(`   Campos visibles: ${visibleFields.length}`);
        for (const f of visibleFields) {
          console.log(`     - [${f.tag}${f.type ? ':' + f.type : ''}] id="${f.id}" name="${f.name}" label="${f.label}" value="${f.value?.substring(0, 50)}"`);
        }
      }
    }

    // Also capture if there are grids
    const gridInfo = await page.evaluate(() => {
      const $ = (window as any).jQuery;
      if (!$) return [];
      const grids: any[] = [];
      $('[data-role="grid"]').each(function(i: number, el: HTMLElement) {
        const grid = $(el).data('kendoGrid');
        if (!grid) return;
        const columns = grid.columns.map((c: any) => ({
          field: c.field,
          title: c.title,
          hidden: c.hidden,
          width: c.width,
        }));
        grids.push({
          id: el.id || `grid-${i}`,
          selector: el.id ? `#${el.id}` : `[data-role="grid"]:eq(${i})`,
          rows: grid.dataSource.total(),
          columns,
        });
      });
      return grids;
    });

    if (gridInfo.length > 0) {
      console.log(`\n📊 Grids encontrados: ${gridInfo.length}`);
      for (const g of gridInfo) {
        console.log(`   Grid: ${g.id} (${g.rows} filas)`);
        for (const col of g.columns) {
          console.log(`     - ${col.field} "${col.title}" ${col.hidden ? '(hidden)' : ''}`);
        }
      }
    }

    // Save all field info to JSON
    const fieldsOutput = {
      idPropietario,
      capturedAt: new Date().toISOString(),
      tabs: tabs.map((t, i) => ({ index: i, name: t })),
      grids: gridInfo,
      fields: allFields.filter(f => f.visible && f.type !== 'hidden'),
      allFields,
    };

    fs.writeFileSync(
      path.join(outputDir, 'fields.json'),
      JSON.stringify(fieldsOutput, null, 2),
    );
    console.log(`\n💾 Campos guardados en: ${path.join(outputDir, 'fields.json')}`);

    // Close modal
    console.log('\n🔓 Cerrando cliente...');
    await page.keyboard.press('Escape');
    await delay(1000);
    await page.goto('https://go.qvet.net/Home/Index', { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});

    console.log('\n✅ Captura completada');
    console.log(`📁 Archivos guardados en: ${outputDir}`);

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
