/**
 * Download QVET client list via Puppeteer login + API call
 * Output: tmp/listadoClientes.xlsx (overwrites)
 */
import fs from 'fs';
import path from 'path';
import { loadEnv, delay, launchBrowser, loginQVET, log } from './qvet/common';

const OUTPUT_PATH = path.resolve('tmp/listadoClientes.xlsx');

async function main() {
  const credentials = loadEnv();
  const browser = await launchBrowser();
  const page = await browser.newPage();

  const loginOk = await loginQVET(page, credentials, log);
  if (!loginOk) { await browser.close(); throw new Error('Login falló'); }

  const baseUrl = new URL(page.url()).origin;
  log(`Server: ${baseUrl}`);

  // Get cookies and idSR from page
  const cookies = await page.cookies();
  const sessionCookie = cookies.find(c => c.name === 'ASP.NET_SessionId')?.value || '';
  const idsr = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="idSR"]') as HTMLMetaElement;
    return meta?.content || '';
  }) || '';

  // If no idsr from meta, try from page scripts
  const idsrFallback = idsr || await page.evaluate(() => {
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const match = s.textContent?.match(/idSR['":\s]+['"]([^'"]+)['"]/);
      if (match) return match[1];
    }
    return '';
  }) || '';

  log(`Session: ${sessionCookie.substring(0, 10)}... | idSR: ${idsrFallback.substring(0, 10)}...`);

  // Get currentview from the page
  const currentview = await page.evaluate(() => {
    const input = document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement;
    // Try to find the form ID
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const match = s.textContent?.match(/SetCurrentView\("([^"]+)"\)/);
      if (match) return match[1];
    }
    return '';
  }) || '';

  // Navigate to Listados to get the form context
  log('Navegando a Listados...');
  await page.goto(`${baseUrl}/Home/Index`, { waitUntil: 'networkidle2' });
  await delay(2000);

  // Use page.evaluate to make the fetch request with proper session
  log('Descargando listado de clientes (esto tarda ~2 min)...');

  const body = {
    IdListado: "1",
    Parametros: JSON.stringify([
      { Id: 67, Codigo: "@CLIENTEACTIVO", Nombre: "ACTIVOS", Tipo: 2, Valor: null, Orden: 0 },
      { Id: 148, Codigo: "@CLIENTEEMAIL", Nombre: "EMAIL", Tipo: 2, Valor: null, Orden: 1 },
      { Id: 1255, Codigo: "@TIPOENVIO", Nombre: "TIPO ENVIO", Tipo: 12, Valor: null, Orden: 2 },
      { Id: 6451, Codigo: "@Tipo", Nombre: "TIPO CLIENTE", Tipo: 12, Valor: null, Orden: 3 },
      { Id: 1, Codigo: "@POBLACION", Nombre: "POBLACIÓN", Tipo: 22, Valor: null, Orden: 4 },
      { Id: 6452, Codigo: "@procedencia", Nombre: "PROCEDENCIA", Tipo: 12, Valor: null, Orden: 5 },
      { Id: 792, Codigo: "@IDIOMA", Nombre: "IDIOMA", Tipo: 12, Valor: null, Orden: 6 },
      { Id: 392, Codigo: "@CENTRO", Nombre: "CLÍNICA", Tipo: 12, Valor: " ", Orden: 7 },
      { Id: 5994, Codigo: "@RGPD_AUTORIZA", Nombre: "AUTORIZA RGPD", Tipo: 2, Valor: null, Orden: 8 },
      { Id: 2661, Codigo: "@RGPD_DERECHO", Nombre: "DERECHO DE IMÁGENES", Tipo: 2, Valor: null, Orden: 9 },
      { Id: 2660, Codigo: "@RGPD_EVALUACION", Nombre: "EVALUACIÓN SATISFACCIÓN", Tipo: 2, Valor: null, Orden: 10 },
      { Id: 2659, Codigo: "@RGPD_MARKETING", Nombre: "MARKETING", Tipo: 2, Valor: null, Orden: 11 },
      { Id: 2658, Codigo: "@RGPD_PRESTACION", Nombre: "PRESTACIÓN SERVICIO", Tipo: 2, Valor: null, Orden: 12 },
    ]),
    TipoListado: "Listado",
    FechaIni: null,
    FechaFin: null,
    ParametrosLista: [
      { Id: 67, Codigo: "@CLIENTEACTIVO", Nombre: "ACTIVOS", Tipo: 2, Valor: null, Orden: 0 },
      { Id: 148, Codigo: "@CLIENTEEMAIL", Nombre: "EMAIL", Tipo: 2, Valor: null, Orden: 1 },
      { Id: 1255, Codigo: "@TIPOENVIO", Nombre: "TIPO ENVIO", Tipo: 12, Valor: null, Orden: 2 },
      { Id: 6451, Codigo: "@Tipo", Nombre: "TIPO CLIENTE", Tipo: 12, Valor: null, Orden: 3 },
      { Id: 1, Codigo: "@POBLACION", Nombre: "POBLACIÓN", Tipo: 22, Valor: null, Orden: 4 },
      { Id: 6452, Codigo: "@procedencia", Nombre: "PROCEDENCIA", Tipo: 12, Valor: null, Orden: 5 },
      { Id: 792, Codigo: "@IDIOMA", Nombre: "IDIOMA", Tipo: 12, Valor: null, Orden: 6 },
      { Id: 392, Codigo: "@CENTRO", Nombre: "CLÍNICA", Tipo: 12, Valor: " ", Orden: 7 },
      { Id: 5994, Codigo: "@RGPD_AUTORIZA", Nombre: "AUTORIZA RGPD", Tipo: 2, Valor: null, Orden: 8 },
      { Id: 2661, Codigo: "@RGPD_DERECHO", Nombre: "DERECHO DE IMÁGENES", Tipo: 2, Valor: null, Orden: 9 },
      { Id: 2660, Codigo: "@RGPD_EVALUACION", Nombre: "EVALUACIÓN SATISFACCIÓN", Tipo: 2, Valor: null, Orden: 10 },
      { Id: 2659, Codigo: "@RGPD_MARKETING", Nombre: "MARKETING", Tipo: 2, Valor: null, Orden: 11 },
      { Id: 2658, Codigo: "@RGPD_PRESTACION", Nombre: "PRESTACIÓN SERVICIO", Tipo: 2, Valor: null, Orden: 12 },
    ],
  };

  // Use page context to make the request (already has session cookies)
  const result = await page.evaluate(async (bodyStr, base) => {
    try {
      const resp = await fetch(`${base}/Listados/ExportarListado`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'PostId': new Date().toISOString(),
        },
        body: bodyStr,
      });
      const data = await resp.json();
      return { ok: true, data };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }, JSON.stringify(body), baseUrl);

  if (!result.ok) {
    log(`❌ Error: ${result.error}`);
    await browser.close();
    return;
  }

  log(`Respuesta: ${JSON.stringify(result.data).substring(0, 200)}`);

  // The response should contain a filename - download the Excel
  const fileName = result.data?.NombreFichero || result.data?.FileName || result.data;
  log(`Archivo: ${fileName}`);

  if (typeof fileName === 'string' && fileName) {
    // Download the generated Excel
    const downloadUrl = `${baseUrl}/Listados/ObtenerExcelExportado?NombreListado=${encodeURIComponent(fileName)}`;

    const client = (await import('axios')).default;
    const downloadResp = await client.get(downloadUrl, {
      headers: {
        'Cookie': `ASP.NET_SessionId=${sessionCookie}`,
        'Referer': `${baseUrl}/Home/Index`,
      },
      responseType: 'arraybuffer',
    });

    fs.writeFileSync(OUTPUT_PATH, downloadResp.data);
    log(`✅ Guardado: ${OUTPUT_PATH} (${(downloadResp.data.length / 1024 / 1024).toFixed(1)}MB)`);
  } else {
    log(`❌ No se recibió nombre de archivo. Respuesta: ${JSON.stringify(result.data)}`);
  }

  await browser.close();

  // Cleanup chrome
  try {
    const { execSync } = require('child_process');
    execSync('kill -9 $(ps aux | grep chrome | grep -i "remote-debugging\\|no-first-run" | grep -v grep | awk \'{print $2}\') 2>/dev/null');
  } catch {}
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
