/**
 * QVET Verify Article
 *
 * Abre un artículo y muestra los valores actuales de los campos editables
 */

import puppeteer, { Browser, Page } from 'puppeteer';
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

async function openArticle(page: Page, idArticulo: number): Promise<boolean> {
  console.log(`📝 Abriendo artículo ${idArticulo}...`);

  try {
    // Navegar a artículos
    await page.evaluate(() => {
      const links = document.querySelectorAll('a, .menu-item, .nav-link');
      for (const link of links) {
        const text = link.textContent || '';
        if (text.includes('Artículos') || text.includes('Conceptos')) {
          (link as HTMLElement).click();
          return;
        }
      }
    });
    await delay(3000);

    // Buscar artículo
    const searchField = await page.$('input[name*="IdArticulo"]') as any;
    if (searchField) {
      await searchField.click({ clickCount: 3 });
      await page.keyboard.type(String(idArticulo));
      await page.keyboard.press('Enter');
      await delay(2000);
    }

    // Doble click en la fila
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

async function getAlmacenesValues(page: Page): Promise<Record<string, { stockMin: string; stockOpt: string }>> {
  return await page.evaluate(() => {
    const $ = (window as any).jQuery;
    if (!$) return {};

    const result: Record<string, { stockMin: string; stockOpt: string }> = {};
    const grid = $('[id*="GridAlmacenes"]');
    const rows = grid.find('tbody tr.k-master-row');

    rows.each(function(this: HTMLElement) {
      const cells = $(this).find('td:visible');
      const almacenName = cells.eq(1).text().trim();
      const stockMin = cells.eq(4).text().trim();
      const stockOpt = cells.eq(5).text().trim();

      if (almacenName) {
        result[almacenName] = { stockMin, stockOpt };
      }
    });

    return result;
  });
}

async function getObservaciones(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const textarea = document.querySelector('#Observacions, [name="Observacions"]') as HTMLTextAreaElement;
    return textarea ? textarea.value : '';
  });
}

async function main() {
  const idArticulo = parseInt(process.argv[2] || '6242');

  console.log('🏥 QVET Verify Article');
  console.log('======================\n');
  console.log(`📦 Artículo: ${idArticulo}`);
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

    const loginOk = await login(page);
    if (!loginOk) {
      throw new Error('Login falló');
    }

    const opened = await openArticle(page, idArticulo);
    if (!opened) {
      throw new Error('No se pudo abrir el artículo');
    }

    // Verificar Almacenes
    console.log('📑 Pestaña: Almacenes');
    await selectTab(page, 'Almacenes');
    await delay(2000);

    const almacenes = await getAlmacenesValues(page);
    console.log('\n   📊 Valores de Stock:');
    for (const [nombre, valores] of Object.entries(almacenes)) {
      console.log(`      ${nombre}:`);
      console.log(`         Stock Mínimo: ${valores.stockMin}`);
      console.log(`         Stock Óptimo: ${valores.stockOpt}`);
    }

    // Verificar Observaciones
    console.log('\n📑 Pestaña: Observaciones');
    await selectTab(page, 'Observaciones');
    await delay(2000);

    const observaciones = await getObservaciones(page);
    console.log(`\n   📝 Observaciones: ${observaciones || '(vacío)'}`);

    // Cerrar
    console.log('\n🔓 Liberando artículo...');
    await page.keyboard.press('Escape');
    await delay(1000);
    await page.goto('https://go.qvet.net/Home/Index', { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    await delay(2000);

    console.log('\n✅ Verificación completada');
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
