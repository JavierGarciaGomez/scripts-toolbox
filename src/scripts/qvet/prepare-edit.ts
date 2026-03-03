/**
 * QVET Prepare Edit
 *
 * Downloads the article list from QVET and generates an Excel template
 * for editing with update-articles.ts.
 *
 * Output: Excel with base data + extra empty columns for editable fields.
 * When used with update-articles.ts in single-sheet mode, only filled cells are applied.
 *
 * Usage:
 *   npx ts-node src/scripts/qvet/prepare-edit.ts [--activo=S]
 */

import axios, { AxiosInstance } from 'axios';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

// =============================================================================
// Utilities
// =============================================================================

function uuidv4(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

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
  console.log('Warning: could not load .env');
}

// =============================================================================
// Configuration
// =============================================================================

const QVET_USER = process.env.QVET_USER || '';
const QVET_PASS = process.env.QVET_PASS || '';
const QVET_AUTO = process.env.QVET_AUTO || '';

const REPORT_ID = '25';
const REPORT_NAME = 'Listado-Conceptos';

// Extra columns for editable fields (these get added as empty columns)
const EXTRA_COLUMNS = [
  'Descripcion_2',
  'Seccion', 'Familia', 'Subfamilia', 'Marca',
  'Activo', 'Visible_Ventas', 'Visible_Compras', 'Solo_Escandallo',
  'P_Minimo', 'Upc_Bi', 'Imp_Ventas', 'Imp_Compras',
  'Tarifa_Ord_PVP', 'Tarifa_Ord_MargenC', 'Tarifa_Ord_MargenV',
  'Tarifa_Min_PVP', 'Tarifa_Min_MargenC', 'Tarifa_Min_MargenV',
  'Stock_Min_Harbor', 'Stock_Opt_Harbor', 'Compra_Min_Harbor',
  'Stock_Min_Montejo', 'Stock_Opt_Montejo', 'Compra_Min_Montejo',
  'Stock_Min_Urban', 'Stock_Opt_Urban', 'Compra_Min_Urban',
  'Observaciones',
];

interface QVETSession {
  client: AxiosInstance;
  sessionId?: string;
  baseUrl?: string;
  idsr?: string;
  idForm?: string;
}

// =============================================================================
// Session & Login (based on qvet-api.ts)
// =============================================================================

function ensureDataFolder(): string {
  const dataDir = path.join(process.cwd(), 'data', 'qvet');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

async function createSession(): Promise<QVETSession> {
  const client = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    validateStatus: () => true,
    maxRedirects: 0,
  });

  return { client };
}

async function login(session: QVETSession): Promise<boolean> {
  const { client } = session;

  try {
    console.log('🔐 Iniciando login...');

    await client.post('https://go.qvet.net/Home/EsSAML', { clinica: QVET_AUTO }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json', 'Origin': 'https://go.qvet.net', 'Referer': 'https://go.qvet.net/' },
    });

    await client.post('https://go.qvet.net/Home/EsUserQvetAndSAML', { clinica: QVET_AUTO, user: QVET_USER }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json', 'Origin': 'https://go.qvet.net', 'Referer': 'https://go.qvet.net/' },
    });

    const loginResp = await client.post('https://go.qvet.net/Home/DoLogin', {
      NombreClinica: QVET_AUTO, UserName: QVET_USER, Pwd: QVET_PASS,
    }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json', 'Origin': 'https://go.qvet.net', 'Referer': 'https://go.qvet.net/' },
    });

    if (loginResp.data && (loginResp.data.Url || loginResp.data.URL)) {
      const redirectUrl = loginResp.data.Url || loginResp.data.URL;
      session.baseUrl = redirectUrl.startsWith('http') ? new URL(redirectUrl).origin : redirectUrl;
    } else {
      return false;
    }

    const equipoName = `Equipo_${Math.random().toString(36).substring(7)}`;
    const autoLoginParams = new URLSearchParams({
      NombreEquipo: equipoName, Clinica: QVET_AUTO, UserName: QVET_USER,
      Password: QVET_PASS, IdCentro: '', RedirectTo: '/',
    });

    await client.post(`${session.baseUrl}/Login/AutoLogin`, autoLoginParams.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://go.qvet.net', 'Referer': 'https://go.qvet.net/' },
    });

    const idsrValue = uuidv4();
    session.idsr = idsrValue;

    const comprobarResp1 = await client.post(`${session.baseUrl}/Login/ComprobarUsuario`, {
      model: { NombreEquipo: equipoName, AutoLogin: 'True', Clinica: QVET_AUTO, UserName: QVET_USER, Password: QVET_PASS, IdCentro: '', RedirectTo: '/Home/Index' },
      NombreEquipo: '', DireccionMAC: '', QVetWS: false, TipoDispositivoWeb: 0,
    }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json', 'Origin': session.baseUrl, 'Referer': `${session.baseUrl}/Login/AutoLogin` },
    });

    if (comprobarResp1.data && comprobarResp1.data.SessionId) {
      session.sessionId = comprobarResp1.data.SessionId;
    }

    await client.post(`${session.baseUrl}/Login/ComprobarUsuario`, {
      model: { NombreEquipo: equipoName, AutoLogin: 'True', Clinica: QVET_AUTO, UserName: QVET_USER, Password: QVET_PASS, IdCentro: '1', RedirectTo: '/Home/Index' },
      NombreEquipo: '', DireccionMAC: '', QVetWS: false, TipoDispositivoWeb: 0,
    }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json', 'Cookie': `ASP.NET_SessionId=${session.sessionId}`, 'Origin': session.baseUrl, 'Referer': `${session.baseUrl}/Login/AutoLogin` },
    });

    const initRequests = [
      { url: '/Helper/NotificarActualizacion', data: {} },
      { url: '/Asincrono/Ping', data: 'firstTime=true', contentType: 'application/x-www-form-urlencoded' },
      { url: '/Helper/GetParametros', data: 'Refrescar=0', contentType: 'application/x-www-form-urlencoded' },
      { url: '/Asincrono/AsignarIdentificadorConexion', data: `Id=${idsrValue}`, contentType: 'application/x-www-form-urlencoded' },
    ];

    for (const req of initRequests) {
      try {
        await client.post(`${session.baseUrl}${req.url}`, req.data, {
          headers: { 'Content-Type': req.contentType || 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': `ASP.NET_SessionId=${session.sessionId}`, 'Origin': session.baseUrl, 'Referer': `${session.baseUrl}/Home/Index`, 'idsr': idsrValue },
        });
      } catch { /* continue */ }
    }

    console.log('   ✅ Login exitoso\n');
    return true;
  } catch (error: any) {
    console.error('   ❌ Error en login:', error.message);
    return false;
  }
}

async function navigateToReports(session: QVETSession): Promise<boolean> {
  const { client, baseUrl, sessionId, idsr } = session;
  if (!baseUrl || !sessionId || !idsr) return false;

  try {
    const listadosResp = await client.get(`${baseUrl}/Listados/Listados?_=${Date.now()}`, {
      headers: { 'Accept': 'text/html, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': `ASP.NET_SessionId=${sessionId}`, 'Referer': `${baseUrl}/Home/Index`, 'idsr': idsr },
    });

    if (listadosResp.status !== 200) return false;

    const html = listadosResp.data;
    const idFormMatch = html.match(/id="([a-f0-9]{32})"/);
    session.idForm = idFormMatch ? idFormMatch[1] : 'f907bd3c90330c9d9558deed6790d92b';

    return true;
  } catch (error: any) {
    console.error('❌ Error navegando a reportes:', error.message);
    return false;
  }
}

// =============================================================================
// Report Download
// =============================================================================

async function downloadArticleList(session: QVETSession, params?: Record<string, string>): Promise<Buffer | null> {
  const { client, baseUrl, sessionId, idsr, idForm } = session;
  if (!baseUrl || !sessionId || !idsr || !idForm) return null;

  try {
    console.log(`📊 Descargando ${REPORT_NAME}...`);

    const paramsResp = await client.post(`${baseUrl}/Listados/GridListados`, `sort=&group=&filter=&IdListado=${REPORT_ID}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': '*/*', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': `ASP.NET_SessionId=${sessionId}`, 'Referer': `${baseUrl}/Home/Index`, 'Origin': baseUrl, 'idsr': idsr, 'currentview': idForm },
    });

    let parametrosLista: any[] = [];

    if (paramsResp.data && Array.isArray(paramsResp.data.Data)) {
      parametrosLista = paramsResp.data.Data;

      if (parametrosLista.length > 0) {
        console.log(`   📋 Parámetros del reporte:`);
        parametrosLista = parametrosLista.map((param: any) => {
          const codigo = param.Codigo?.replace('@', '').toUpperCase();
          let valor = null;

          if (params) {
            for (const [key, val] of Object.entries(params)) {
              const keyNorm = key.toUpperCase().replace(/[_\s-]/g, '');
              const codNorm = codigo.replace(/[_\s-]/g, '');
              if (keyNorm === codNorm) { valor = val; break; }
            }
          }

          if (codigo === 'ACTIVO' && !valor) valor = 'S';

          console.log(`      - ${param.Nombre}: ${valor || '(vacío)'}`);
          return { ...param, Valor: valor };
        });
      }
    }

    console.log('   📥 Exportando listado...');

    const exportResp = await client.post(`${baseUrl}/Listados/ExportarListado`, {
      IdListado: REPORT_ID, Parametros: JSON.stringify(parametrosLista), IdForm: idForm,
      TipoListado: 'Listado', FechaIni: null, FechaFin: null, ParametrosLista: parametrosLista,
    }, {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': `ASP.NET_SessionId=${sessionId}`, 'Referer': `${baseUrl}/Home/Index`, 'Origin': baseUrl, 'idsr': idsr, 'currentview': idForm },
    });

    if (exportResp.status !== 200) return null;

    const fileName = typeof exportResp.data === 'string'
      ? exportResp.data.replace(/"/g, '')
      : exportResp.data?.NombreArchivo || exportResp.data;

    console.log(`   📄 Archivo: ${fileName}`);

    const downloadResp = await client.get(`${baseUrl}/Listados/ObtenerExcelExportado`, {
      params: { NombreListado: fileName },
      headers: { 'Cookie': `ASP.NET_SessionId=${sessionId}`, 'Referer': `${baseUrl}/Home/Index` },
      responseType: 'arraybuffer',
    });

    if (downloadResp.status !== 200 || downloadResp.data.byteLength === 0) return null;

    console.log(`   ✅ Descargado: ${(downloadResp.data.byteLength / 1024).toFixed(2)} KB\n`);
    return Buffer.from(downloadResp.data);
  } catch (error: any) {
    console.error('❌ Error descargando reporte:', error.message);
    return null;
  }
}

// =============================================================================
// Excel Processing
// =============================================================================

function processExcelForEditing(excelBuffer: Buffer, outputPath: string): void {
  console.log('📊 Procesando Excel...');

  const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('No se encontró ninguna hoja en el Excel');

  const originalSheet = workbook.Sheets[sheetName]!;
  const data: any[] = XLSX.utils.sheet_to_json(originalSheet, { header: 1 });
  if (data.length === 0) throw new Error('Excel vacío');

  const headers = data[0] as string[];
  console.log(`   📋 Columnas base: ${headers.length}`);
  console.log(`   📝 Filas: ${data.length - 1}`);

  // Build single sheet: base data + extra empty columns
  const editHeaders = [...headers, ...EXTRA_COLUMNS];
  const editData = [editHeaders];

  for (let i = 1; i < data.length; i++) {
    const row = data[i] as any[];
    const editRow = [...row];
    for (let j = 0; j < EXTRA_COLUMNS.length; j++) {
      editRow.push('');
    }
    editData.push(editRow);
  }

  const newWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(newWorkbook, XLSX.utils.aoa_to_sheet(editData), 'Datos');
  console.log(`   ✅ Hoja creada con ${EXTRA_COLUMNS.length} columnas editables`);

  XLSX.writeFile(newWorkbook, outputPath);
  console.log(`   💾 Guardado: ${outputPath}\n`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  const params: Record<string, string> = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      if (key && value) params[key.toUpperCase()] = value;
    }
  });

  console.log('🏥 QVET Prepare Edit');
  console.log('====================\n');
  console.log(`👤 Usuario: ${QVET_USER}`);
  console.log(`🏢 Clínica: ${QVET_AUTO}`);
  console.log(`📊 Reporte: ${REPORT_NAME} (ID: ${REPORT_ID})`);
  if (Object.keys(params).length > 0) {
    console.log('📋 Parámetros:');
    Object.entries(params).forEach(([k, v]) => console.log(`   - ${k}: ${v}`));
  }
  console.log();

  if (!QVET_USER || !QVET_PASS || !QVET_AUTO) {
    console.log('❌ Faltan credenciales en .env (QVET_USER, QVET_PASS, QVET_AUTO)');
    process.exit(1);
  }

  const session = await createSession();
  if (!await login(session)) { console.log('❌ Login falló'); process.exit(1); }
  if (!await navigateToReports(session)) { console.log('❌ No se pudo navegar a reportes'); process.exit(1); }

  const excelBuffer = await downloadArticleList(session, params);
  if (!excelBuffer) { console.log('❌ No se pudo descargar el reporte'); process.exit(1); }

  const dataDir = ensureDataFolder();
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  const outputPath = path.join(dataDir, `articulos-${timestamp}.xlsx`);

  processExcelForEditing(excelBuffer, outputPath);

  console.log('✅ Proceso completado');
  console.log('\n📋 Instrucciones:');
  console.log(`   1. Abre: ${outputPath}`);
  console.log('   2. Llena las celdas que quieras cambiar (deja vacías las que no)');
  console.log('   3. Guarda el archivo');
  console.log(`   4. Ejecuta: npx ts-node src/scripts/qvet/update-articles.ts ${outputPath}`);
}

main().catch(console.error);
