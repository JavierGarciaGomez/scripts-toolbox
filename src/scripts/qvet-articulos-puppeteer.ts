/**
 * QVET Articulos Puppeteer
 *
 * Automatiza la navegación a artículos y captura las llamadas de red
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
const QVET_LOCATION = process.env.QVET_LOCATION || 'URBAN';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface NetworkCall {
  method: string;
  url: string;
  postData?: string | undefined;
  responseStatus?: number | undefined;
  responseBody?: string | undefined;
  timestamp: number;
}

async function main() {
  const args = process.argv.slice(2);
  const codigoArticulo = args.find(a => !a.startsWith('--')) || '2656';
  const headless = !args.includes('--visible');

  console.log('🏥 QVET Articulos - Puppeteer Explorer');
  console.log('======================================\n');
  console.log(`🔍 Código artículo: ${codigoArticulo}`);
  console.log(`👤 Usuario: ${QVET_USER}`);
  console.log(`🏢 AUTO: ${QVET_AUTO}`);
  console.log(`🖥️  Modo: ${headless ? 'Headless' : 'Visible'}\n`);

  const networkLog: NetworkCall[] = [];
  let browser: Browser | null = null;

  try {
    // Crear carpetas
    const screenshotDir = path.join(process.cwd(), 'data', 'qvet', 'screenshots');
    const logsDir = path.join(process.cwd(), 'data', 'qvet', 'logs');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

    browser = await puppeteer.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1920, height: 1080 },
    });

    const page = await browser.newPage();

    // Interceptar requests
    await page.setRequestInterception(true);

    page.on('request', request => {
      const url = request.url();
      const method = request.method();

      // Capturar peticiones relevantes (Articulos, POST, etc)
      if (url.includes('/Articulos/') || url.includes('/Home/') || method === 'POST') {
        const entry: NetworkCall = {
          method,
          url,
          postData: request.postData(),
          timestamp: Date.now(),
        };
        networkLog.push(entry);
      }

      request.continue();
    });

    page.on('response', async response => {
      const url = response.url();
      if (url.includes('/Articulos/')) {
        const entry = networkLog.find(e => e.url === url && !e.responseStatus);
        if (entry) {
          entry.responseStatus = response.status();
          try {
            const text = await response.text();
            entry.responseBody = text.substring(0, 2000); // Solo primeros 2000 chars
          } catch (e) {
            // Ignorar errores de body
          }
        }
      }
    });

    // 1. Login
    console.log('🔐 Paso 1: Login en go.qvet.net...');
    await page.goto('https://go.qvet.net/', { waitUntil: 'networkidle2' });
    await delay(1000);

    await page.type('#Clinica', QVET_AUTO, { delay: 50 });
    await page.type('#UserName', QVET_USER, { delay: 50 });
    await page.type('#Password', QVET_PASS, { delay: 50 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click('#btnLogin'),
    ]);
    console.log('   ✅ Login inicial completado');
    await page.screenshot({ path: path.join(screenshotDir, 'art-00-after-login.png') });

    // Esperar más para que cargue
    await delay(3000);
    await page.screenshot({ path: path.join(screenshotDir, 'art-00b-wait.png') });

    // 2. Seleccionar sucursal si es necesario
    const currentUrl = page.url();
    console.log(`   URL actual: ${currentUrl}`);
    if (currentUrl.includes('AutoLogin')) {
      console.log('🔄 Paso 2: Seleccionando sucursal...');
      try {
        await page.waitForSelector('#IdCentro', { timeout: 5000 });
        await page.click('.k-dropdown-wrap');
        await delay(500);

        await page.evaluate((location) => {
          const items = Array.from(document.querySelectorAll('#IdCentro_listbox li'));
          const target = items.find(item =>
            item.textContent?.trim().toUpperCase().includes(location.toUpperCase())
          );
          if (target instanceof HTMLElement) target.click();
        }, QVET_LOCATION);

        await delay(1000);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          page.click('#btnLogin'),
        ]);
        console.log('   ✅ Sucursal seleccionada');
      } catch (err) {
        console.log('   ⚠️  No requirió selección de sucursal');
      }
    }

    // Esperar a que cargue completamente el home
    console.log('   Esperando que cargue el Home...');
    await delay(5000);
    await page.screenshot({ path: path.join(screenshotDir, 'art-01-home.png') });

    // Intentar esperar a que aparezca el menú
    try {
      await page.waitForSelector('.main-menu, .menu, nav, [class*="sidebar"]', { timeout: 10000 });
      console.log('   ✅ Menú detectado');
    } catch (e) {
      console.log('   ⚠️  No se detectó menú, continuando...');
    }

    await delay(2000);
    await page.screenshot({ path: path.join(screenshotDir, 'art-01b-home-loaded.png') });

    // 3. Navegar a Artículos
    console.log('📦 Paso 3: Navegando a Artículos...');
    console.log('   Buscando menú "Inicio" o "Artículos"...');

    // Tomar screenshot del estado actual del menú
    await page.screenshot({ path: path.join(screenshotDir, 'art-02-menu-before.png') });

    // Listar todos los elementos del menú para debug
    const menuItems = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.main-menu a, .menu a, nav a, [class*="menu"] a'));
      return items.map(a => ({
        text: a.textContent?.trim(),
        href: a.getAttribute('href'),
        cont: a.getAttribute('cont'),
        act: a.getAttribute('act'),
      }));
    });
    console.log('   Elementos de menú encontrados:');
    menuItems.slice(0, 20).forEach(item => {
      if (item.text) console.log(`     - "${item.text}" (cont: ${item.cont}, act: ${item.act})`);
    });

    // Ahora dime qué debo picar...
    console.log('\n⏸️  PAUSA - Revisa los screenshots y dime qué picar');
    console.log(`   Screenshots en: ${screenshotDir}`);
    console.log('   Elementos de menú listados arriba');

    // Guardar log de red hasta ahora
    fs.writeFileSync(
      path.join(logsDir, 'network-articulos.json'),
      JSON.stringify(networkLog, null, 2)
    );
    console.log(`   Network log: ${path.join(logsDir, 'network-articulos.json')}`);

    // Mantener el navegador abierto si es visible
    if (!headless) {
      console.log('\n🖥️  Navegador abierto - navega manualmente y presiona Ctrl+C cuando termines');
      console.log('   Las llamadas de red se guardarán al cerrar');

      // Esperar indefinidamente
      await new Promise(() => {});
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    // Guardar logs finales
    const logsDir = path.join(process.cwd(), 'data', 'qvet', 'logs');
    fs.writeFileSync(
      path.join(logsDir, 'network-articulos-final.json'),
      JSON.stringify(networkLog, null, 2)
    );
    console.log(`\n💾 Network log guardado: ${path.join(logsDir, 'network-articulos-final.json')}`);

    if (browser) {
      await browser.close();
    }
  }
}

main().catch(console.error);
