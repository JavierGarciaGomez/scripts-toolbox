/**
 * QVET Capture Fields
 *
 * Captura el HTML de cada pestaña de un artículo para documentar los campos editables
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
      console.log('   Seleccionando sucursal...');
      await delay(2000);
      try {
        await page.waitForSelector('#IdCentro', { timeout: 15000 });
        await delay(1000);

        await page.evaluate(() => {
          const wrapper = document.querySelector('.k-dropdown-wrap') ||
                         document.querySelector('[aria-owns="IdCentro_listbox"]') ||
                         document.querySelector('#IdCentro');
          if (wrapper) {
            (wrapper as HTMLElement).click();
          }
        });

        await delay(1000);
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

async function openArticle(page: Page, idArticulo: number): Promise<boolean> {
  console.log(`📝 Abriendo artículo ${idArticulo}...`);

  try {
    const searchField = await page.$('input[name*="IdArticulo"]') as any;
    if (searchField) {
      await searchField.click({ clickCount: 3 });
      await page.keyboard.type(String(idArticulo));
      await page.keyboard.press('Enter');
      await delay(2000);
    }

    const row = await page.$('.k-grid-content tr');
    if (row) {
      await row.click({ clickCount: 2 });
    }
    await delay(3000);

    await page.waitForSelector('.k-window-content, .FichaArticulo', { timeout: 10000 });
    console.log('   ✅ Artículo abierto\n');
    return true;
  } catch (e: any) {
    console.log(`   ❌ Error: ${e.message}`);
    return false;
  }
}

async function getTabNames(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const tabs: string[] = [];
    const tabItems = document.querySelectorAll('li.k-item[role="tab"]');
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
    const modal = document.querySelector('.k-window-content') || document.querySelector('.FichaArticulo');
    return modal ? modal.innerHTML : '';
  });
}

async function main() {
  const idArticulo = 6242; // Artículo de ejemplo
  const outputDir = path.join(process.cwd(), 'tmp', 'qvet-tabs');

  console.log('🏥 QVET Capture Fields');
  console.log('======================\n');
  console.log(`📦 Artículo: ${idArticulo}`);
  console.log(`📁 Output: ${outputDir}\n`);

  if (!QVET_USER || !QVET_PASS || !QVET_AUTO) {
    console.log('❌ Faltan credenciales en .env');
    process.exit(1);
  }

  // Crear directorio de salida
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
    if (!loginOk) {
      throw new Error('Login falló');
    }

    // Navigate to articles
    await navigateToArticles(page);
    await delay(2000);

    // Open article
    const opened = await openArticle(page, idArticulo);
    if (!opened) {
      throw new Error('No se pudo abrir el artículo');
    }

    // Get tab names
    const tabs = await getTabNames(page);
    console.log(`📑 Pestañas encontradas: ${tabs.length}`);
    tabs.forEach((t, i) => console.log(`   ${i + 1}. ${t}`));
    console.log('');

    // Capture each tab
    const tabMapping: Record<string, string> = {
      'datos': 'datos-generales',
      'general': 'datos-generales',
      'precio': 'precios-ventas',
      'compra': 'precios-ventas',
      'venta': 'precios-ventas',
      'almacen': 'almacenes',
      'almacén': 'almacenes',
      'stock': 'almacenes',
      'observ': 'observaciones',
    };

    for (const tabName of tabs) {
      console.log(`📸 Capturando: ${tabName}...`);

      // Select tab
      const selected = await selectTab(page, tabName);
      if (!selected) {
        console.log(`   ⚠️ No se pudo seleccionar`);
        continue;
      }
      await delay(2000);

      // Capture HTML
      const html = await captureTabHtml(page);

      // Determine filename
      let filename = tabName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      for (const [key, value] of Object.entries(tabMapping)) {
        if (tabName.toLowerCase().includes(key)) {
          filename = value;
          break;
        }
      }

      // Save to file
      const filePath = path.join(outputDir, `${filename}.html`);
      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>QVET - ${tabName}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .field-info { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Pestaña: ${tabName}</h1>
  <p>Artículo: ${idArticulo}</p>
  <p>Capturado: ${new Date().toISOString()}</p>
  <hr>
  ${html}
</body>
</html>`;

      fs.writeFileSync(filePath, fullHtml);
      console.log(`   ✅ Guardado: ${filename}.html (${Math.round(html.length / 1024)}KB)`);
    }

    // Close modal and release article
    console.log('\n🔓 Liberando artículo...');
    await page.keyboard.press('Escape');
    await delay(1000);
    await page.goto('https://go.qvet.net/Home/Index', { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    await delay(2000);

    console.log('\n✅ Captura completada');
    console.log(`📁 Archivos guardados en: ${outputDir}`);

    // Keep browser open briefly
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
