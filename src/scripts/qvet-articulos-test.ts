/**
 * QVET Articulos Test
 *
 * Script de prueba para leer y modificar artículos via API
 */

import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

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

function uuidv4(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

interface QVETSession {
  client: AxiosInstance;
  sessionId?: string;
  baseUrl?: string;
  idsr?: string;
  cookies: Map<string, string>;
}

function extractCookies(setCookieHeader: string | string[] | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!setCookieHeader) return cookies;

  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const header of headers) {
    const match = header.match(/^([^=]+)=([^;]*)/);
    if (match && match[1] && match[2]) {
      cookies[match[1]] = match[2];
    }
  }
  return cookies;
}

function buildCookieHeader(cookies: Map<string, string>): string {
  return Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function createSession(): Promise<QVETSession> {
  const cookies = new Map<string, string>();

  const client = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Accept-Language': 'es,en-US;q=0.9,en;q=0.8',
    },
    validateStatus: () => true,
    maxRedirects: 0,
  });

  // Interceptor para capturar cookies de las respuestas
  client.interceptors.response.use((response) => {
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const newCookies = extractCookies(setCookie);
      for (const [key, value] of Object.entries(newCookies)) {
        cookies.set(key, value);
      }
    }
    return response;
  });

  // Interceptor para enviar cookies en los requests
  client.interceptors.request.use((config) => {
    if (cookies.size > 0) {
      config.headers.Cookie = buildCookieHeader(cookies);
    }
    return config;
  });

  return { client, cookies };
}

async function login(session: QVETSession): Promise<boolean> {
  const { client } = session;

  try {
    console.log('🔐 Iniciando login...');

    // 1. Verificar SAML
    await client.post('https://go.qvet.net/Home/EsSAML', { clinica: QVET_AUTO }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    });

    // 2. Verificar usuario
    await client.post('https://go.qvet.net/Home/EsUserQvetAndSAML',
      { clinica: QVET_AUTO, user: QVET_USER },
      { headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }
    );

    // 3. DoLogin
    const loginResp = await client.post('https://go.qvet.net/Home/DoLogin', {
      NombreClinica: QVET_AUTO,
      UserName: QVET_USER,
      Pwd: QVET_PASS,
    }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    });

    if (loginResp.data?.Url || loginResp.data?.URL) {
      const redirectUrl = loginResp.data.Url || loginResp.data.URL;
      session.baseUrl = redirectUrl.startsWith('http') ? new URL(redirectUrl).origin : redirectUrl;
      console.log(`   ✅ Servidor: ${session.baseUrl}`);
    } else {
      console.log('   ❌ No se obtuvo URL');
      return false;
    }

    // 4. AutoLogin
    const equipoName = `Equipo_${Math.random().toString(36).substring(7)}`;
    const autoLoginParams = new URLSearchParams({
      NombreEquipo: equipoName,
      Clinica: QVET_AUTO,
      UserName: QVET_USER,
      Password: QVET_PASS,
      IdCentro: '',
      RedirectTo: '/',
    });

    await client.post(`${session.baseUrl}/Login/AutoLogin`, autoLoginParams.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    // 5. ComprobarUsuario (sin centro)
    session.idsr = uuidv4();
    const comprobarResp1 = await client.post(`${session.baseUrl}/Login/ComprobarUsuario`, {
      model: {
        NombreEquipo: equipoName,
        AutoLogin: 'True',
        Clinica: QVET_AUTO,
        UserName: QVET_USER,
        Password: QVET_PASS,
        IdCentro: '',
        RedirectTo: '/Home/Index',
      },
      NombreEquipo: '',
      QVetWS: false,
      TipoDispositivoWeb: 0,
    }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    });

    if (comprobarResp1.data?.SessionId) {
      const sessionId = comprobarResp1.data.SessionId as string;
      session.sessionId = sessionId;
      // Agregar el SessionId a las cookies para que se envíe automáticamente
      session.cookies.set('ASP.NET_SessionId', sessionId);
      console.log(`   ✅ Session ID obtenido`);
    }

    // 6. ComprobarUsuario (con centro 1)
    await client.post(`${session.baseUrl}/Login/ComprobarUsuario`, {
      model: {
        NombreEquipo: equipoName,
        AutoLogin: 'True',
        Clinica: QVET_AUTO,
        UserName: QVET_USER,
        Password: QVET_PASS,
        IdCentro: '1',
        RedirectTo: '/Home/Index',
      },
      NombreEquipo: '',
      QVetWS: false,
      TipoDispositivoWeb: 0,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    // 7. Asignar identificador conexión
    await client.post(`${session.baseUrl}/Asincrono/AsignarIdentificadorConexion`,
      `Id=${session.idsr}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'idsr': session.idsr,
        },
      }
    );

    console.log('   ✅ Login completado');
    return true;

  } catch (error: any) {
    console.error('❌ Error en login:', error.message);
    return false;
  }
}

async function navegarAlHome(session: QVETSession): Promise<boolean> {
  const { client, baseUrl } = session;

  console.log(`\n🏠 Navegando al Home/Index...`);

  const resp = await client.get(
    `${baseUrl}/Home/Index`,
    {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    }
  );

  console.log(`   Status: ${resp.status}`);

  if (resp.status === 200) {
    console.log(`   ✅ Home cargado correctamente`);
    return true;
  }

  return false;
}

async function navegarAArticulos(session: QVETSession): Promise<string | null> {
  const { client, baseUrl, idsr } = session;

  console.log(`\n📁 Navegando a vista de Artículos...`);

  const resp = await client.get(
    `${baseUrl}/Articulos/Articulos`,
    {
      params: { _: Date.now() },
      headers: {
        'Accept': 'text/html, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${baseUrl}/Home/Index`,
        'idSR': idsr,
        'currentview': 'null',
      },
    }
  );

  console.log(`   Status: ${resp.status}`);

  if (resp.status === 200 && resp.data) {
    // Extraer el currentview del HTML (buscar id="HASH")
    const html = resp.data;
    const match = html.match(/id="([a-f0-9]{32})"/);
    if (match) {
      console.log(`   ✅ currentview: ${match[1]}`);
      return match[1];
    }

    // Guardar HTML para debug
    const dataDir = path.join(process.cwd(), 'data', 'qvet');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'articulos-view.html'), html);
    console.log(`   💾 HTML guardado para debug`);
  }

  console.log(`   ⚠️  No se pudo obtener currentview`);
  return null;
}

async function leerArticulo(session: QVETSession, idArticulo: string, currentview: string): Promise<any> {
  const { client, baseUrl, idsr } = session;

  console.log(`\n📖 Leyendo artículo ID: ${idArticulo}...`);

  const resp = await client.post(
    `${baseUrl}/Articulos/LeerArticulos`,
    new URLSearchParams({
      'sort': 'Id-asc',
      'page': '1',
      'pageSize': '25',
      'group': '',
      'filter': '',
      'filtros.IdArticulo': idArticulo,
      'filtros.Activo': 'true',
      'filtros.TipoEscandallo': 'Todos',
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': '*/*',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': baseUrl,
        'Referer': `${baseUrl}/Home/Index`,
        'currentview': currentview,
        'idSR': idsr,
      },
    }
  );

  console.log(`   Status: ${resp.status}`);

  if (resp.status === 200 && resp.data) {
    const data = resp.data;
    if (data.Data && data.Data.length > 0) {
      console.log(`   ✅ Artículo encontrado`);
      return data.Data[0];
    } else {
      console.log(`   ⚠️  No se encontró el artículo`);
      console.log(`   Respuesta:`, JSON.stringify(data).substring(0, 500));
    }
  } else {
    console.log(`   ❌ Error en respuesta`);
    console.log(`   Respuesta:`, typeof resp.data === 'string' ? resp.data.substring(0, 500) : resp.data);
  }

  return null;
}

async function obtenerDetalleArticulo(session: QVETSession, idArticulo: string, currentview: string): Promise<{ html: string; formView: string } | null> {
  const { client, baseUrl, idsr } = session;

  console.log(`\n📋 Obteniendo ficha del artículo ID: ${idArticulo}...`);

  // El endpoint correcto es POST /Articulos/FichaArticulo?id=X
  const resp = await client.post(
    `${baseUrl}/Articulos/FichaArticulo`,
    null,
    {
      params: { id: idArticulo },
      headers: {
        'Accept': 'text/html, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${baseUrl}/Home/Index`,
        'idSR': idsr,
        'currentview': currentview,
      },
    }
  );

  console.log(`   Status: ${resp.status}`);

  if (resp.status === 200 && typeof resp.data === 'string' && resp.data.length > 100) {
    const html = resp.data;
    console.log(`   ✅ Ficha obtenida (${html.length} caracteres)`);

    // Extraer el nuevo currentview del formulario de detalle
    const match = html.match(/id="([a-f0-9]{32})"/);
    const formView = (match && match[1]) ? match[1] : currentview;
    console.log(`   📝 Form view: ${formView}`);

    // Guardar para inspección
    const dataDir = path.join(process.cwd(), 'data', 'qvet');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, `articulo-${idArticulo}-detalle.html`), html);
    console.log(`   💾 HTML guardado en data/qvet/articulo-${idArticulo}-detalle.html`);

    return { html, formView };
  }

  // Mostrar más info del error
  console.log(`   ❌ Error obteniendo detalle`);
  if (resp.data) {
    const dataDir = path.join(process.cwd(), 'data', 'qvet');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const errorContent = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data, null, 2);
    fs.writeFileSync(path.join(dataDir, `articulo-${idArticulo}-error.txt`), errorContent);
    console.log(`   💾 Error guardado en data/qvet/articulo-${idArticulo}-error.txt`);
    // Mostrar primeras líneas
    console.log(`   📝 Contenido del error: ${errorContent.substring(0, 300)}...`);
  }
  return null;
}

interface FormFieldsResult {
  single: Record<string, string>;
  multi: Record<string, string[]>;
}

// Fields that should NOT be sent to the server (internal JS configuration)
const EXCLUDED_FIELDS = new Set([
  'BloquearVisualizacionUPC',
  'GestionarGruposIVACentral',
  'listaCompletaIVAS',
  'listaCompletaRES',
  'ListaImpuestosArt',
  'editarConceptos',
  'AsignarSeries',
  'articuloEnCopia',
  'esMasEdicionProfesional',
  'esMasEdicionElite',
  'EsModoLectura',
  'PermitirCrearLotes',
  'ExisteFotoArticulo',
  'MostrarTabCentros',
  'MostrarTabPromociones',
  'IdClinicaCentral',
  'UploadImage',
  'ConsultarPersonal',
  'IdAssignacio_DiccionarioOjear',
  'promocion_tipo',
  'FacturarUnidadesEnteras',
  'Medicament.FormulaMagistral', // Not in browser payload
]);

function extractFormFields(html: string, viewPrefix: string): FormFieldsResult {
  const single: Record<string, string> = {};
  const multi: Record<string, string[]> = {};

  // Helper to strip view prefix from field names
  const stripPrefix = (name: string): string => {
    if (name.startsWith(viewPrefix + '_')) {
      return name.substring(viewPrefix.length + 1);
    }
    return name;
  };

  // Extract all inputs (handles various attribute orders)
  const inputRegex = /<input[^>]*>/gi;
  let match;
  while ((match = inputRegex.exec(html)) !== null) {
    const inputTag = match[0];

    // Extract name attribute
    const nameMatch = inputTag.match(/name="([^"]*)"/);
    if (!nameMatch || !nameMatch[1]) continue;
    const rawName = nameMatch[1];
    const name = stripPrefix(rawName);

    // Skip excluded fields (internal JS configuration)
    if (EXCLUDED_FIELDS.has(name)) continue;

    // Extract value attribute (handle both " and ')
    let value = '';
    const valueMatchDQ = inputTag.match(/value="([^"]*)"/);
    const valueMatchSQ = inputTag.match(/value='([^']*)'/);
    if (valueMatchDQ && valueMatchDQ[1]) {
      value = valueMatchDQ[1];
    } else if (valueMatchSQ && valueMatchSQ[1]) {
      value = valueMatchSQ[1];
    }

    // Skip values that look like JSON blobs (internal config)
    if (value.startsWith('"[{') || value.startsWith('"\\"')) continue;

    // Check if it's a checkbox
    const isCheckbox = /type=["']checkbox["']/i.test(inputTag);
    const isChecked = /checked/i.test(inputTag);

    if (isCheckbox) {
      // Only include checked checkboxes
      if (isChecked && value) {
        // Add to multi-value array
        if (!multi[name]) {
          multi[name] = [];
        }
        multi[name].push(value);
      }
    } else {
      // Regular input - skip if already captured
      if (single[name] === undefined) {
        single[name] = value;
      }
    }
  }

  // Extract textareas
  const textareaRegex = /<textarea[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/textarea>/gi;
  while ((match = textareaRegex.exec(html)) !== null) {
    const rawName = match[1] || '';
    const name = stripPrefix(rawName);
    const value = match[2] || '';

    // Skip excluded fields
    if (EXCLUDED_FIELDS.has(name)) continue;

    if (name && single[name] === undefined) {
      // Decode HTML entities in textarea content
      single[name] = value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    }
  }

  return { single, multi };
}

async function guardarArticuloTest(session: QVETSession, idArticulo: string, currentview: string, cambios: Record<string, string>): Promise<boolean> {
  const { client, baseUrl, idsr } = session;

  console.log(`\n💾 Guardando artículo ID: ${idArticulo}...`);
  console.log(`   Cambios a aplicar:`, cambios);

  // Primero necesitamos obtener todos los datos actuales del artículo
  const detalle = await obtenerDetalleArticulo(session, idArticulo, currentview);
  if (!detalle) {
    console.log(`   ❌ No se pudo obtener el detalle del artículo`);
    return false;
  }

  const html = detalle.html;

  // Extract the viewPrefix from the HTML (32-char hex ID)
  const viewPrefixMatch = html.match(/id="([a-f0-9]{32})"/);
  const viewPrefix = (viewPrefixMatch && viewPrefixMatch[1]) ? viewPrefixMatch[1] : '';

  // Extract all form fields properly
  const { single: formData, multi: multiFields } = extractFormFields(html, viewPrefix);

  console.log(`   📋 Campos extraídos: ${Object.keys(formData).length} simples, ${Object.keys(multiFields).length} múltiples`);
  console.log(`   📋 Campos múltiples:`, Object.keys(multiFields));

  // Log some key fields for debugging
  console.log(`   📝 Referencia actual: "${formData['Referencia'] || ''}"`);
  console.log(`   📝 Observacions actual: "${(formData['Observacions'] || '').substring(0, 50)}..."`);

  // Aplicar los cambios (append mode for specified fields)
  for (const [key, value] of Object.entries(cambios)) {
    const currentValue = formData[key] || '';
    // If current value exists and doesn't already contain our addition, append
    if (currentValue && !currentValue.includes(value)) {
      formData[key] = currentValue + ' ' + value;
    } else if (!currentValue) {
      formData[key] = value;
    }
    console.log(`   ✏️  ${key}: "${currentValue}" → "${formData[key]}"`);
  }

  // Asegurarnos de que Id esté presente
  formData['Id'] = idArticulo;

  // Build URLSearchParams manually to handle multi-value fields
  const params = new URLSearchParams();

  // Add single-value fields
  for (const [key, value] of Object.entries(formData)) {
    params.append(key, value);
  }

  // Add multi-value fields (each value added separately with same key)
  for (const [key, values] of Object.entries(multiFields)) {
    for (const value of values) {
      params.append(key, value);
    }
  }

  // Add required fields that JavaScript adds before submitting
  // These are added at the end of the form data by the browser
  params.append('ProgramacionPredeterminada', formData['ModelProgramacionPredeterminada'] || '');
  params.append('Medicament.EsFormulaMagistral', formData['EsFormulaMagistral'] || 'false');
  params.append('ListaImpuestos', 'undefined');
  params.append('IVA', 'undefined');
  params.append('IVACompra', 'undefined');
  params.append('RE', 'undefined');
  params.append('PMPC', formData['PMPC'] || '0'); // Duplicate PMPC
  params.append('Medicament.CargarDosisCantidad', formData['CargarDosisCantidad'] || 'true');
  params.append('Medicament.EsPiensoMedicamentoso', formData['EsPiensoMedicamentoso'] || 'false');
  params.append('Medicament.EsAntibiotico', formData['EsAntibiotico'] || 'false');
  params.append('Medicament.Humana', formData['Humana'] || 'false');
  params.append('Medicament.ImportadoCIMAVET', formData['ImportadoCIMAVET'] || 'false');
  params.append('Medicament.NombreCIMAVET', formData['Medicament.NombreCIMAVET'] || '');
  params.append('Medicament.NumeroRegistro', formData['Medicament.NumeroRegistro'] || '');
  params.append('Medicament.CodiNacional', formData['Medicament.CodiNacional'] || '');
  params.append('GuardarDosisCantidad', 'true'); // Critical field!

  // Guardar una copia del payload para debug
  const dataDir = path.join(process.cwd(), 'data', 'qvet');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, `articulo-${idArticulo}-payload.json`),
    JSON.stringify({ single: formData, multi: multiFields }, null, 2)
  );
  console.log(`   💾 Payload guardado para debug`);

  // Enviar el formulario
  const resp = await client.post(
    `${baseUrl}/Articulos/GuardarArticulo`,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': baseUrl,
        'Referer': `${baseUrl}/Home/Index`,
        'currentview': detalle.formView,
        'currentviewconfiguracion': 'null',
        'idSR': idsr,
      },
    }
  );

  console.log(`   Status: ${resp.status}`);

  if (resp.status === 200) {
    const respStr = typeof resp.data === 'object' ? JSON.stringify(resp.data) : String(resp.data);
    console.log(`   Respuesta: ${respStr.substring(0, 300)}`);

    // Check for success
    if (resp.data && !resp.data.Error && !resp.data.error && !resp.data.message) {
      console.log(`   ✅ Artículo guardado correctamente`);
      return true;
    } else if (resp.data?.message) {
      console.log(`   ❌ Error del servidor: ${resp.data.message}`);
    }
  }

  // Save error response for debugging
  fs.writeFileSync(
    path.join(dataDir, `articulo-${idArticulo}-error-response.json`),
    JSON.stringify(resp.data, null, 2)
  );

  console.log(`   ❌ Error guardando artículo`);
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const idArticulo = args.find(a => !a.startsWith('--')) || '2656';
  const testSave = args.includes('--save');

  console.log('🏥 QVET Articulos Test');
  console.log('======================\n');
  console.log(`🔍 Artículo a buscar: ${idArticulo}`);
  console.log(`👤 Usuario: ${QVET_USER}`);
  console.log(`🏢 AUTO: ${QVET_AUTO}`);
  console.log(`💾 Test guardar: ${testSave ? 'SÍ' : 'NO (usa --save para probar)'}\n`);

  if (!QVET_USER || !QVET_PASS || !QVET_AUTO) {
    console.log('❌ Faltan credenciales en .env');
    console.log('   Necesitas: QVET_USER, QVET_PASS, QVET_AUTO');
    process.exit(1);
  }

  const session = await createSession();
  const loginSuccess = await login(session);

  if (!loginSuccess) {
    console.log('❌ Login falló');
    process.exit(1);
  }

  // Paso 0: Navegar al Home para establecer sesión
  await navegarAlHome(session);

  // Paso 1: Intentar obtener currentview de la vista de Artículos
  let currentview = await navegarAArticulos(session);

  // Si falla, usar un valor hardcodeado (del curl del usuario)
  // Nota: Este valor puede expirar pero permite probar
  if (!currentview) {
    console.log('⚠️  Usando currentview del curl original');
    currentview = '76b5b8dc9fc4003f30d2b520daba128f';
  }

  // Paso 2: Leer artículo (grid)
  const articulo = await leerArticulo(session, idArticulo, currentview);
  if (articulo) {
    console.log('\n📊 Datos del artículo (grid):');
    console.log(JSON.stringify(articulo, null, 2));

    // Guardar para referencia
    const dataDir = path.join(process.cwd(), 'data', 'qvet');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, `articulo-${idArticulo}-grid.json`), JSON.stringify(articulo, null, 2));
  }

  // Paso 3: Obtener detalle (formulario completo)
  const detalle = await obtenerDetalleArticulo(session, idArticulo, currentview);

  // Paso 4: Probar guardar (si se indica --save)
  if (testSave && detalle) {
    console.log('\n⚠️  MODO PRUEBA: Agregando TEST a Referencia y Observaciones...');

    // Agregar TEST a los campos especificados (sin borrar contenido existente)
    const resultado = await guardarArticuloTest(session, idArticulo, currentview, {
      'Referencia': 'TEST',
      'Observacions': 'TEST',
    });

    if (resultado) {
      console.log('\n🎉 ¡La edición programática funciona!');
    } else {
      console.log('\n❌ La edición falló - revisar logs en data/qvet/');
    }
  }

  console.log('\n✅ Test completado');
  console.log('📁 Revisa los archivos en data/qvet/ para ver los datos obtenidos');
}

main().catch(console.error);
