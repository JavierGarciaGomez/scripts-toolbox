/**
 * QVET Network Capture
 *
 * Abre el navegador para que navegues manualmente mientras captura las llamadas de red
 */

import puppeteer, { Browser } from 'puppeteer';
import fs from 'fs';
import path from 'path';

interface NetworkCall {
  timestamp: string;
  method: string;
  url: string;
  postData?: string | undefined;
  status?: number | undefined;
}

async function main() {
  console.log('🏥 QVET Network Capture');
  console.log('=======================\n');
  console.log('Este script abre el navegador para que navegues MANUALMENTE');
  console.log('Todas las llamadas de red se guardarán automáticamente.\n');

  const networkLog: NetworkCall[] = [];
  let browser: Browser | null = null;

  // Crear carpeta de logs
  const logsDir = path.join(process.cwd(), 'data', 'qvet', 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
      defaultViewport: null, // Usar el viewport completo
    });

    const page = await browser.newPage();

    // Interceptar requests
    await page.setRequestInterception(true);

    page.on('request', request => {
      const url = request.url();
      const method = request.method();

      // Capturar todas las peticiones POST y las de Articulos
      if (method === 'POST' || url.includes('/Articulos/') || url.includes('qvet.net')) {
        networkLog.push({
          timestamp: new Date().toISOString(),
          method,
          url,
          postData: request.postData(),
        });

        // Mostrar en consola las relevantes
        if (url.includes('/Articulos/')) {
          console.log(`📡 ${method} ${url.split('?')[0]}`);
          if (request.postData()) {
            console.log(`   📦 ${request.postData()?.substring(0, 200)}...`);
          }
        }
      }

      request.continue();
    });

    page.on('response', async response => {
      const url = response.url();
      const status = response.status();

      // Actualizar el status en el log
      const entry = networkLog.find(e => e.url === url && !e.status);
      if (entry) {
        entry.status = status;
      }
    });

    // Ir a la página de login
    console.log('🌐 Abriendo go.qvet.net...\n');
    await page.goto('https://go.qvet.net/', { waitUntil: 'networkidle2' });

    console.log('✅ Navegador abierto!');
    console.log('');
    console.log('📋 INSTRUCCIONES:');
    console.log('   1. Haz login manualmente');
    console.log('   2. Navega a Inicio > Artículos / Conceptos');
    console.log('   3. Busca un artículo por código');
    console.log('   4. Ábrelo y edítalo');
    console.log('   5. Guárdalo');
    console.log('');
    console.log('🔴 Cuando termines, CIERRA EL NAVEGADOR para guardar los logs');
    console.log('');

    // Esperar a que se cierre el navegador
    await new Promise<void>((resolve) => {
      browser!.on('disconnected', () => {
        resolve();
      });
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }

  // Guardar logs
  const logPath = path.join(logsDir, `capture-${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify(networkLog, null, 2));
  console.log(`\n💾 Network log guardado: ${logPath}`);
  console.log(`   Total llamadas capturadas: ${networkLog.length}`);

  // Filtrar solo las de Articulos
  const articulosLog = networkLog.filter(e => e.url.includes('/Articulos/'));
  if (articulosLog.length > 0) {
    const artLogPath = path.join(logsDir, `articulos-${Date.now()}.json`);
    fs.writeFileSync(artLogPath, JSON.stringify(articulosLog, null, 2));
    console.log(`   Llamadas a /Articulos/: ${articulosLog.length}`);
    console.log(`   Log filtrado: ${artLogPath}`);
  }
}

main().catch(console.error);
