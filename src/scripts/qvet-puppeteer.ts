/**
 * QVET Puppeteer Script
 *
 * Automatiza la descarga de reportes desde QVET usando un navegador real
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Cargar variables de entorno si existe archivo .env
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && match[1] && match[2]) {
        const key = match[1];
        const value = match[2];
        process.env[key.trim()] = value.trim();
      }
    });
  }
} catch (err) {
  console.log('⚠️  No se pudo cargar .env, usando credenciales por defecto');
}

// Configuración
const QVET_USER = process.env.QVET_USER || 'JAVIERH';
const QVET_PASS = process.env.QVET_PASS || 'Victorhug0.-';
const QVET_AUTO = process.env.QVET_AUTO || 'HVPENINSULARSC';
const QVET_LOCATION = process.env.QVET_LOCATION || 'URBAN';

// Delay aleatorio para simular comportamiento humano
const randomDelay = (min: number, max: number) =>
  new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

async function downloadQVETReport(reportName: string = 'Proveedores', headless: boolean = true) {
  let browser: Browser | null = null;

  try {
    console.log('🚀 Iniciando navegador...');

    // Configurar carpeta de descargas
    const downloadPath = path.join(process.cwd(), 'data', 'temp');
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }

    browser = await puppeteer.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();

    // Array para capturar las peticiones de red relevantes
    const networkLog: Array<{
      method: string;
      url: string;
      headers: any;
      postData?: string;
      responseStatus?: number;
      responseHeaders?: any;
    }> = [];

    // Interceptar peticiones de red
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      const url = request.url();
      const method = request.method();

      // Capturar peticiones relevantes (especialmente POST y a /Listados/)
      if (
        method === 'POST' ||
        url.includes('/Listados/') ||
        url.includes('/Documentos/') ||
        url.includes('Exportar') ||
        url.includes('.xlsx')
      ) {
        const entry: any = {
          method,
          url,
          headers: request.headers(),
        };

        const postData = request.postData();
        if (postData) {
          entry.postData = postData;
        }

        networkLog.push(entry);
      }

      // Continuar con la petición
      request.continue();
    });

    page.on('response', async (response) => {
      const url = response.url();
      const status = response.status();

      // Capturar respuestas de peticiones relevantes
      if (
        url.includes('/Listados/') ||
        url.includes('/Documentos/') ||
        url.includes('Exportar') ||
        response.headers()['content-type']?.includes('excel') ||
        response.headers()['content-type']?.includes('spreadsheet')
      ) {
        // Buscar la petición correspondiente en el log
        const logEntry = networkLog.find(entry => entry.url === url && !entry.responseStatus);
        if (logEntry) {
          logEntry.responseStatus = status;
          logEntry.responseHeaders = response.headers();
        } else {
          // Si no existe, agregarla
          networkLog.push({
            method: 'GET',
            url,
            headers: {},
            responseStatus: status,
            responseHeaders: response.headers(),
          });
        }
      }
    });

    // Configurar descargas
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadPath,
    });

    // Configurar viewport
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('🔐 Paso 1: Login inicial en go.qvet.net...');
    await page.goto('https://go.qvet.net/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    await randomDelay(2000, 3000);

    // Llenar formulario de login usando IDs específicos
    console.log('   Llenando Clínica (AUTO)...');
    await page.type('#Clinica', QVET_AUTO, { delay: 100 });

    await randomDelay(300, 500);

    console.log('   Llenando Usuario...');
    await page.type('#UserName', QVET_USER, { delay: 100 });

    await randomDelay(300, 500);

    console.log('   Llenando Contraseña...');
    await page.type('#Password', QVET_PASS, { delay: 100 });

    await randomDelay(500, 1000);

    // Hacer clic en botón de login
    console.log('   Haciendo clic en "Iniciar sesión"...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click('#btnLogin'),
    ]);

    console.log('🔄 Paso 2: AutoLogin - Seleccionar sucursal...');
    await randomDelay(2000, 3000);

    const currentUrl = page.url();
    console.log(`   URL actual: ${currentUrl}`);

    // Verificar si estamos en la página de AutoLogin
    if (currentUrl.includes('AutoLogin')) {
      try {
        // Esperar a que aparezca el dropdown de sucursal (Kendo UI)
        await page.waitForSelector('#IdCentro', { timeout: 5000 });

        console.log(`   Seleccionando sucursal: ${QVET_LOCATION}...`);

        // Hacer clic en el dropdown para abrirlo (Kendo UI wrapper)
        await page.click('.k-dropdown-wrap');
        await randomDelay(500, 800);

        // Hacer clic en la opción deseada
        await page.evaluate((location) => {
          const items = Array.from(document.querySelectorAll('#IdCentro_listbox li'));
          const targetItem = items.find(item =>
            item.textContent?.trim().toUpperCase().includes(location.toUpperCase())
          );
          if (targetItem && targetItem instanceof HTMLElement) {
            targetItem.click();
          }
        }, QVET_LOCATION);

        await randomDelay(1000, 1500);

        // Hacer clic en "Iniciar sesión"
        console.log('   Haciendo clic en "Iniciar sesión"...');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          page.click('#btnLogin'),
        ]);

      } catch (err) {
        console.log('   ⚠️  Error en AutoLogin:', err);
      }
    } else {
      console.log('   ℹ️  No es necesario AutoLogin, continuando...');
    }

    console.log('📁 Paso 3: Navegando a Documentos > Reportes...');
    await randomDelay(2000, 3000);

    // Tomar screenshot antes de navegar
    const screenshotDir = path.join(process.cwd(), 'data', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    await page.screenshot({ path: path.join(screenshotDir, '1-before-documentos.png'), fullPage: true });

    // Hacer clic en "Documentos" usando el selector específico
    console.log('   Haciendo clic en "Documentos"...');
    const docClicked = await page.evaluate(() => {
      const docLink = Array.from(document.querySelectorAll('.main-menu a')).find(a => {
        const titleSpan = a.querySelector('span.title');
        return titleSpan?.textContent?.trim() === 'Documentos';
      });
      if (docLink && docLink instanceof HTMLElement) {
        docLink.click();
        return true;
      }
      return false;
    });

    if (!docClicked) {
      await page.screenshot({ path: path.join(screenshotDir, 'error-documentos-not-found.png'), fullPage: true });
      throw new Error('No se encontró el menú "Documentos"');
    }

    await randomDelay(2000, 3000);

    await page.screenshot({ path: path.join(screenshotDir, '2-after-documentos.png'), fullPage: true });

    // Hacer clic en "Reportes/Listados" dentro del submenú de Documentos
    console.log('   Haciendo clic en "Reportes/Listados"...');
    const reportClicked = await page.evaluate(() => {
      // Buscar de forma más flexible - puede decir "Reportes" o "Listados"
      const allLinks = Array.from(document.querySelectorAll('.main-menu a'));
      const reportLink = allLinks.find(a => {
        const titleSpan = a.querySelector('span.title');
        const text = titleSpan?.textContent?.trim() || '';
        // Buscar "Reportes" o "Listados" con los atributos correctos
        return (text === 'Reportes' || text === 'Listados') &&
               a.getAttribute('cont') === 'Listados' &&
               a.getAttribute('act') === 'Listados';
      });

      if (reportLink && reportLink instanceof HTMLElement) {
        console.log('Haciendo clic en:', reportLink.textContent?.trim());
        reportLink.click();
        return true;
      }
      return false;
    });

    if (!reportClicked) {
      await page.screenshot({ path: path.join(screenshotDir, 'error-reportes-not-found.png'), fullPage: true });
      console.log('⚠️  No se pudo hacer clic en Reportes/Listados con selectores específicos');
      console.log('   Intentando búsqueda más general...');

      // Intentar búsqueda más general - buscar cualquier elemento que diga "Reportes" o "Listados"
      const altClicked = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('a, span'));
        const reportEl = allElements.find(el => {
          const text = el.textContent?.trim() || '';
          return text === 'Reportes' || text === 'Listados';
        });
        if (reportEl && reportEl instanceof HTMLElement) {
          console.log('Haciendo clic (alt) en:', reportEl.textContent?.trim());
          reportEl.click();
          return true;
        }
        return false;
      });

      if (!altClicked) {
        throw new Error('No se pudo hacer clic en Reportes/Listados');
      }
    }

    console.log('⏳ Paso 4: Esperando a que carguen los listados (puede tardar)...');

    // Esperar más tiempo para que carguen los reportes
    await randomDelay(8000, 10000);

    // Intentar esperar a que aparezca algún contenido de reportes
    try {
      await page.waitForSelector('tr, li, .k-grid, table', { timeout: 15000 });
      console.log('   ✅ Contenido de reportes cargado');
    } catch (err) {
      console.log('   ⚠️  Timeout esperando contenido, continuando de todas formas...');
    }

    await randomDelay(2000, 3000);

    await page.screenshot({ path: path.join(screenshotDir, '3-reportes-page.png'), fullPage: true });

    // Verificar si Proveedores ya está seleccionado, si no, seleccionarlo
    console.log(`📊 Paso 5: Verificando si "${reportName}" está seleccionado...`);
    const needsClick = await page.evaluate((name) => {
      // Buscar en el TreeView si hay algún elemento seleccionado
      const selected = document.querySelector('.k-treeview .k-state-selected');
      if (selected && selected.textContent?.trim() === name) {
        console.log('Reporte ya seleccionado:', name);
        return false; // Ya está seleccionado
      }

      // Si no está seleccionado, buscarlo y hacer clic
      const treeItems = Array.from(document.querySelectorAll('.k-treeview .k-in'));
      for (const item of treeItems) {
        if (item.textContent?.trim() === name) {
          console.log('Seleccionando reporte:', name);
          if (item instanceof HTMLElement) {
            item.click();
            return true;
          }
        }
      }
      return false;
    }, reportName);

    if (needsClick) {
      console.log(`   Seleccionado "${reportName}", esperando a que carguen los botones...`);
      await randomDelay(3000, 4000);
    } else {
      console.log(`   "${reportName}" ya estaba seleccionado`);
    }

    await page.screenshot({ path: path.join(screenshotDir, '4-after-select-report.png'), fullPage: true });

    // Verificar si hay parámetros que llenar
    console.log('📝 Paso 6: Verificando parámetros del reporte...');

    const hasParameters = await page.evaluate(() => {
      // Buscar inputs de parámetros (campos de fecha, text, etc)
      const inputs = document.querySelectorAll('input[type="text"], input[type="date"]');
      return inputs.length > 0;
    });

    if (hasParameters) {
      console.log('   ⚠️  Este reporte requiere parámetros');
      console.log('   Los parámetros por defecto se usarán automáticamente');
      await randomDelay(1000, 1500);
    }

    // Esperar a que aparezca el botón "Descargar Listado"
    console.log('⬇️  Paso 7: Esperando botón "Descargar Listado"...');

    try {
      // Esperar a que aparezca un botón que contenga "Descargar Listado"
      await page.waitForFunction(
        () => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.some(btn =>
            btn.textContent?.toLowerCase().includes('descargar listado')
          );
        },
        { timeout: 10000 }
      );
      console.log('   ✅ Botón encontrado');
    } catch (err) {
      console.log('   ⚠️  Timeout esperando botón, intentando de todas formas...');
    }

    await randomDelay(1000, 1500);

    // Obtener archivos antes de la descarga
    const filesBefore = fs.existsSync(downloadPath) ? fs.readdirSync(downloadPath) : [];

    // Hacer clic en "Descargar Listado"
    const downloadClicked = await page.evaluate(() => {
      // Buscar específicamente botones con la clase k-button que contengan "Descargar Listado"
      const buttons = Array.from(document.querySelectorAll('button.k-button, button'));

      for (const btn of buttons) {
        const text = btn.textContent?.trim() || '';
        if (text.toLowerCase().includes('descargar listado')) {
          console.log('Haciendo clic en botón:', text);
          if (btn instanceof HTMLElement) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    });

    if (!downloadClicked) {
      await page.screenshot({ path: path.join(screenshotDir, 'error-no-download-button.png'), fullPage: true });
      console.log('⚠️  No se pudo hacer clic en el botón "Descargar Listado"');
      console.log('   Esperando de todas formas por si la descarga se inició...');
    }

    // Esperar a que se descargue el archivo
    console.log('⏳ Esperando descarga del archivo...');
    await randomDelay(5000, 7000);

    // Verificar si se descargó un archivo nuevo
    const filesAfter = fs.readdirSync(downloadPath);
    const newFiles = filesAfter.filter(f => !filesBefore.includes(f));

    if (newFiles.length === 0) {
      console.log('⚠️  No se detectó ningún archivo descargado. Esperando más tiempo...');
      await randomDelay(5000, 7000);
      const filesRetry = fs.readdirSync(downloadPath);
      const newFilesRetry = filesRetry.filter(f => !filesBefore.includes(f));

      if (newFilesRetry.length === 0) {
        throw new Error('No se pudo descargar el archivo');
      }

      // Usar el archivo del retry
      const downloadedFile = newFilesRetry[0]!;
      const sourcePath = path.join(downloadPath, downloadedFile);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const destPath = path.join(process.cwd(), 'data', `qvet-${reportName}-${timestamp}.xlsx`);

      fs.renameSync(sourcePath, destPath);
      console.log(`✅ Reporte descargado: ${destPath}`);
      console.log(`📊 Tamaño: ${(fs.statSync(destPath).size / 1024).toFixed(2)} KB`);

    } else {
      const downloadedFile = newFiles[0]!;
      const sourcePath = path.join(downloadPath, downloadedFile);

      // Mover a carpeta data con nombre descriptivo
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const destPath = path.join(process.cwd(), 'data', `qvet-${reportName}-${timestamp}.xlsx`);

      fs.renameSync(sourcePath, destPath);
      console.log(`✅ Reporte descargado exitosamente: ${destPath}`);
      console.log(`📊 Tamaño: ${(fs.statSync(destPath).size / 1024).toFixed(2)} KB`);
    }

    // Mostrar log de peticiones de red capturadas
    console.log('\n📡 Peticiones de red capturadas:');
    console.log('================================\n');

    if (networkLog.length === 0) {
      console.log('⚠️  No se capturaron peticiones relevantes');
    } else {
      networkLog.forEach((entry, index) => {
        console.log(`\n[${index + 1}] ${entry.method} ${entry.url}`);
        console.log(`    Status: ${entry.responseStatus || 'N/A'}`);

        if (entry.postData) {
          console.log(`    POST Data: ${entry.postData}`);
        }

        // Mostrar headers relevantes
        const relevantHeaders = ['content-type', 'content-disposition', 'content-length'];
        if (entry.responseHeaders) {
          relevantHeaders.forEach(header => {
            if (entry.responseHeaders[header]) {
              console.log(`    ${header}: ${entry.responseHeaders[header]}`);
            }
          });
        }
      });

      // Guardar el log completo en un archivo JSON
      const logPath = path.join(process.cwd(), 'data', 'network-log.json');
      fs.writeFileSync(logPath, JSON.stringify(networkLog, null, 2));
      console.log(`\n💾 Log completo guardado en: ${logPath}`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const headless = !args.includes('--no-headless');
  const reportName = args.find(arg => !arg.startsWith('--')) || 'Proveedores';

  console.log('🏥 QVET Report Downloader');
  console.log('========================\n');
  console.log(`📋 Reporte: ${reportName}`);
  console.log(`👤 Usuario: ${QVET_USER}`);
  console.log(`🏢 AUTO: ${QVET_AUTO}`);
  console.log(`📍 Ubicación: ${QVET_LOCATION}`);
  console.log(`🖥️  Modo: ${headless ? 'Headless' : 'Visible'}\n`);

  await downloadQVETReport(reportName, headless);
}

main().catch(console.error);
