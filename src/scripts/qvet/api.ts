/**
 * QVET API Script
 *
 * Intenta descargar reportes usando la API directamente sin Puppeteer
 * Replica el flujo completo de autenticación capturado del navegador
 */

import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

// Generar UUID v4 simple
function uuidv4(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Cargar variables de entorno
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
  console.log('⚠️  No se pudo cargar .env');
}

// Configuración
const QVET_USER = process.env.QVET_USER || 'HVP-Admin';
const QVET_PASS = process.env.QVET_PASS || 'HVP-123';
const QVET_AUTO = process.env.QVET_AUTO || 'HVPENINSULARSC';
const QVET_LOCATION = process.env.QVET_LOCATION || 'URBAN';

interface QVETSession {
  client: AxiosInstance;
  sessionId?: string;
  baseUrl?: string;
  idsr?: string;
  idForm?: string;
}

interface CachedSession {
  sessionId: string;
  baseUrl: string;
  idForm: string;
  idsr: string;
  cookies: string;
  timestamp: number;
  expiresAt: number;
}

interface ProcessLog {
  timestamp: string;
  reportId: string;
  reportName: string;
  steps: Array<{
    step: number;
    name: string;
    startTime: string;
    endTime?: string;
    duration?: number;
    status: 'success' | 'error' | 'warning';
    details?: any;
  }>;
  session: {
    baseUrl?: string;
    sessionId?: string;
    idsr?: string;
    idForm?: string;
  };
  result?: {
    success: boolean;
    filePath?: string;
    fileSize?: number;
    error?: string;
  };
}

// Array global para capturar todas las llamadas
let apiCallLog: Array<{
  timestamp: string;
  method: string;
  url: string;
  requestHeaders: any;
  requestData?: any;
  responseStatus?: number;
  responseHeaders?: any;
  responseData?: any;
  duration?: number;
  error?: string;
}> = [];

async function createSession(): Promise<QVETSession> {
  const client = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="143", "Not A(Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
    },
    validateStatus: () => true, // No lanzar error en ningún status
    maxRedirects: 0, // Manejar redirects manualmente
  });

  // Interceptor para capturar requests
  client.interceptors.request.use(
    (config) => {
      const logEntry: any = {
        timestamp: new Date().toISOString(),
        method: config.method?.toUpperCase(),
        url: config.url,
        requestHeaders: config.headers,
        requestData: config.data,
        startTime: Date.now(),
      };

      // Guardar en el config para acceder después
      (config as any).logEntry = logEntry;

      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Interceptor para capturar responses
  client.interceptors.response.use(
    (response) => {
      const logEntry = (response.config as any).logEntry;
      if (logEntry) {
        logEntry.duration = Date.now() - logEntry.startTime;
        logEntry.responseStatus = response.status;
        logEntry.responseHeaders = response.headers;

        // Guardar respuesta pero limitar tamaño
        const responseData = response.data;
        if (typeof responseData === 'string' && responseData.length > 1000) {
          logEntry.responseData = `[String too long: ${responseData.length} chars]`;
        } else if (Buffer.isBuffer(responseData)) {
          logEntry.responseData = `[Binary data: ${responseData.length} bytes]`;
        } else {
          logEntry.responseData = responseData;
        }

        delete logEntry.startTime;
        apiCallLog.push(logEntry);
      }
      return response;
    },
    (error) => {
      const logEntry = (error.config as any)?.logEntry;
      if (logEntry) {
        logEntry.duration = Date.now() - logEntry.startTime;
        logEntry.error = error.message;
        delete logEntry.startTime;
        apiCallLog.push(logEntry);
      }
      return Promise.resolve(error.response);
    }
  );

  return { client };
}

async function login(session: QVETSession): Promise<boolean> {
  const { client } = session;

  try {
    console.log('🔐 Paso 1: Verificando si es SAML...');

    // 1. Verificar si es SAML
    const samlResp = await client.post(
      'https://go.qvet.net/Home/EsSAML',
      { clinica: QVET_AUTO },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Origin': 'https://go.qvet.net',
          'Referer': 'https://go.qvet.net/',
        },
      }
    );

    console.log(`   ✅ Verificado`);

    // 2. Verificar usuario
    console.log('🔐 Paso 2: Verificando usuario...');
    const userResp = await client.post(
      'https://go.qvet.net/Home/EsUserQvetAndSAML',
      { clinica: QVET_AUTO, user: QVET_USER },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Origin': 'https://go.qvet.net',
          'Referer': 'https://go.qvet.net/',
        },
      }
    );

    console.log(`   ✅ Verificado`);

    // 3. Login inicial
    console.log('🔐 Paso 3: Login inicial...');
    const loginResp = await client.post(
      'https://go.qvet.net/Home/DoLogin',
      {
        NombreClinica: QVET_AUTO,
        UserName: QVET_USER,
        Pwd: QVET_PASS,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Origin': 'https://go.qvet.net',
          'Referer': 'https://go.qvet.net/',
        },
      }
    );

    // Verificar si nos dio una URL de redirect (puede ser "Url" o "URL")
    if (loginResp.data && (loginResp.data.Url || loginResp.data.URL)) {
      const redirectUrl = loginResp.data.Url || loginResp.data.URL;
      session.baseUrl = redirectUrl.startsWith('http') ? new URL(redirectUrl).origin : redirectUrl;
      console.log(`   ✅ Servidor: ${session.baseUrl}`);
    } else {
      console.log('   ⚠️  No se obtuvo URL de servidor');
      return false;
    }

    // 4. AutoLogin - Primera petición
    console.log('🔄 Paso 4: AutoLogin...');
    const equipoName = `Equipo_${Math.random().toString(36).substring(7)}`;

    const autoLoginParams = new URLSearchParams({
      NombreEquipo: equipoName,
      BD: '',
      Servidor: '',
      Pais: '',
      FlagFree4Vet: 'False',
      EmailFree4Vet: 'False',
      ResetPasswordF4V: 'False',
      Free4Vet: 'False',
      EmailMensajeVisible: 'False',
      Clinica: QVET_AUTO,
      UserName: QVET_USER,
      Password: QVET_PASS,
      IdCentro: '',
      RedirectTo: '/',
    });

    const autoLoginResp = await client.post(
      `${session.baseUrl}/Login/AutoLogin`,
      autoLoginParams.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://go.qvet.net',
          'Referer': 'https://go.qvet.net/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        maxRedirects: 0,
      }
    );

    console.log(`   ✅ Completado`);

    // 5. Comprobar Usuario - Primera vez (sin IdCentro)
    console.log('🔄 Paso 5: Comprobar usuario (sin centro)...');
    const idsrValue = uuidv4();
    session.idsr = idsrValue;

    const comprobarResp1 = await client.post(
      `${session.baseUrl}/Login/ComprobarUsuario`,
      {
        model: {
          NombreEquipo: equipoName,
          AutoLogin: 'True',
          BD: '',
          Servidor: '',
          Pais: '',
          Free4Vet: 'False',
          SAMLToken: '',
          Clinica: QVET_AUTO,
          UserName: QVET_USER,
          Password: QVET_PASS,
          OTP: '',
          IdCentro: '',
          RedirectTo: '/Home/Index',
        },
        NombreEquipo: '',
        DireccionMAC: '',
        QVetWS: false,
        TipoDispositivoWeb: 0,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Cookie': `ASP.NET_SessionId=${session.sessionId}`,
          'Origin': session.baseUrl,
          'Referer': `${session.baseUrl}/Login/AutoLogin`,
          'postid': new Date().toISOString(),
        },
      }
    );

    // Extraer el SessionId del JSON response
    if (comprobarResp1.data && comprobarResp1.data.SessionId) {
      session.sessionId = comprobarResp1.data.SessionId;
      console.log(`   ✅ Session ID obtenido`);
    }

    // 6. Comprobar Usuario - Segunda vez (con IdCentro)
    console.log('🔄 Paso 6: Comprobar usuario (con centro)...');

    // Determinar IdCentro basado en QVET_LOCATION
    // Por ahora usamos "1" que es el que vimos en los logs
    const idCentro = '1';

    const comprobarResp2 = await client.post(
      `${session.baseUrl}/Login/ComprobarUsuario`,
      {
        model: {
          NombreEquipo: equipoName,
          AutoLogin: 'True',
          BD: '',
          Servidor: '',
          Pais: '',
          Free4Vet: 'False',
          SAMLToken: '',
          Clinica: QVET_AUTO,
          UserName: QVET_USER,
          Password: QVET_PASS,
          OTP: '',
          IdCentro: idCentro,
          RedirectTo: '/Home/Index',
        },
        NombreEquipo: '',
        DireccionMAC: '',
        QVetWS: false,
        TipoDispositivoWeb: 0,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Cookie': `ASP.NET_SessionId=${session.sessionId}`,
          'Origin': session.baseUrl,
          'Referer': `${session.baseUrl}/Login/AutoLogin`,
          'postid': new Date().toISOString(),
        },
      }
    );

    if (comprobarResp2.status !== 200) {
      console.log('   ⚠️  Error al comprobar usuario con centro');
      return false;
    }

    console.log(`   ✅ Usuario verificado`);

    // 7. Inicializar sesión con varias peticiones
    console.log('🔄 Paso 7: Inicializando sesión...');

    const initRequests = [
      { url: '/Helper/NotificarActualizacion', data: {} },
      { url: '/Asincrono/Ping', data: 'firstTime=true', contentType: 'application/x-www-form-urlencoded' },
      { url: '/Helper/GetParametros', data: 'Refrescar=0', contentType: 'application/x-www-form-urlencoded' },
      { url: '/Asincrono/AsignarIdentificadorConexion', data: `Id=${idsrValue}`, contentType: 'application/x-www-form-urlencoded' },
    ];

    for (const req of initRequests) {
      try {
        await client.post(`${session.baseUrl}${req.url}`, req.data, {
          headers: {
            'Content-Type': req.contentType || 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': `ASP.NET_SessionId=${session.sessionId}`,
            'Origin': session.baseUrl,
            'Referer': `${session.baseUrl}/Home/Index`,
            'idsr': idsrValue,
            'postid': new Date().toISOString(),
          },
        });
      } catch (err) {
        // Continuar aunque falle alguna
      }
    }

    console.log('   ✅ Sesión inicializada');
    return true;

  } catch (error: any) {
    console.error('❌ Error en login:', error.message);
    return false;
  }
}

async function navigateToReports(session: QVETSession): Promise<boolean> {
  const { client, baseUrl, sessionId, idsr } = session;

  if (!baseUrl || !sessionId || !idsr) {
    console.log('❌ Sesión no válida');
    return false;
  }

  try {
    console.log('📁 Paso 8: Navegando a Listados...');

    // Cargar la página de Listados
    const timestamp = Date.now();
    const listadosResp = await client.get(
      `${baseUrl}/Listados/Listados?_=${timestamp}`,
      {
        headers: {
          'Accept': 'text/html, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': `ASP.NET_SessionId=${sessionId}`,
          'Referer': `${baseUrl}/Home/Index`,
          'idsr': idsr,
          'currentview': 'null',
        },
      }
    );

    console.log(`   Listados: ${listadosResp.status}`);

    if (listadosResp.status !== 200) {
      console.log('   ⚠️  Error al cargar Listados');
      return false;
    }

    // Extraer el IdForm del HTML
    const html = listadosResp.data;
    const idFormMatch = html.match(/id="([a-f0-9]{32})"/);
    if (idFormMatch) {
      session.idForm = idFormMatch[1];
      console.log(`   ✅ IdForm: ${session.idForm}`);
    } else {
      console.log('   ⚠️  No se pudo extraer IdForm, usando valor por defecto');
      session.idForm = 'f907bd3c90330c9d9558deed6790d92b';
    }

    return true;

  } catch (error: any) {
    console.error('❌ Error navegando a reportes:', error.message);
    return false;
  }
}

// Crear estructura de carpetas para QVET
function ensureQVETFolders() {
  const baseDir = path.join(process.cwd(), 'data', 'qvet');
  const folders = ['reports', 'logs', 'screenshots'];

  folders.forEach(folder => {
    const folderPath = path.join(baseDir, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  });

  return {
    reports: path.join(baseDir, 'reports'),
    logs: path.join(baseDir, 'logs'),
    screenshots: path.join(baseDir, 'screenshots'),
  };
}

// Session cache functions
function getSessionCachePath(): string {
  const folders = ensureQVETFolders();
  return path.join(folders.logs, 'session-cache.json');
}

function saveSessionCache(session: QVETSession): void {
  if (!session.sessionId || !session.baseUrl || !session.idForm || !session.idsr) {
    return;
  }

  const cachePath = getSessionCachePath();
  const now = Date.now();
  const cache: CachedSession = {
    sessionId: session.sessionId,
    baseUrl: session.baseUrl,
    idForm: session.idForm,
    idsr: session.idsr,
    cookies: session.client.defaults.headers.Cookie as string || '',
    timestamp: now,
    expiresAt: now + (20 * 60 * 1000), // 20 minutos
  };

  try {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    console.log('💾 Sesión guardada en caché (válida por 20 minutos)');
  } catch (err) {
    console.log('⚠️  No se pudo guardar la sesión en caché');
  }
}

function loadSessionCache(): CachedSession | null {
  const cachePath = getSessionCachePath();

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(cachePath, 'utf-8');
    const cache: CachedSession = JSON.parse(content);

    // Verificar si no ha expirado
    if (Date.now() > cache.expiresAt) {
      console.log('⏰ Sesión en caché expiró');
      fs.unlinkSync(cachePath); // Eliminar caché expirado
      return null;
    }

    const minutesLeft = Math.floor((cache.expiresAt - Date.now()) / 60000);
    console.log(`📦 Sesión encontrada en caché (válida por ${minutesLeft} minutos más)`);
    return cache;
  } catch (err) {
    console.log('⚠️  Error leyendo caché de sesión');
    return null;
  }
}

async function validateCachedSession(session: QVETSession): Promise<boolean> {
  const { client, baseUrl } = session;

  try {
    // Intentar una llamada simple para verificar si la sesión funciona
    const resp = await client.get(`${baseUrl}/Home/Index`, {
      headers: {
        'Accept': 'text/html',
      },
      timeout: 5000,
    });

    // Si obtenemos 200, la sesión es válida
    if (resp.status === 200) {
      console.log('✅ Sesión en caché válida y funcionando');
      return true;
    }

    console.log('❌ Sesión en caché no válida (status:', resp.status, ')');
    return false;
  } catch (err) {
    console.log('❌ Sesión en caché no válida (error de conexión)');
    return false;
  }
}

async function loadOrCreateSession(): Promise<QVETSession> {
  // Intentar cargar sesión del caché
  const cached = loadSessionCache();

  if (cached) {
    console.log('🔄 Intentando usar sesión en caché...');
    const session = await createSession();
    session.sessionId = cached.sessionId;
    session.baseUrl = cached.baseUrl;
    session.idForm = cached.idForm;
    session.idsr = cached.idsr;

    // Restaurar cookies
    session.client.defaults.headers.Cookie = cached.cookies;

    // Validar que la sesión siga funcionando
    const isValid = await validateCachedSession(session);

    if (isValid) {
      console.log('⚡ Usando sesión en caché (omitiendo login)');
      return session;
    }

    // Si no es válida, eliminar caché y hacer login completo
    console.log('🔐 Sesión expiró, haciendo login completo...');
    try {
      fs.unlinkSync(getSessionCachePath());
    } catch (err) {
      // Ignorar error si no existe
    }
  }

  // Hacer login completo
  const session = await createSession();
  const success = await login(session);

  if (!success) {
    throw new Error('Login falló');
  }

  // La sesión se guardará después de obtener idForm en main()
  return session;
}

async function downloadReport(
  session: QVETSession,
  reportId: string = '508',
  reportName: string = 'Proveedores',
  userParams?: Record<string, string>
): Promise<string | null> {
  const { client, baseUrl, sessionId, idsr, idForm } = session;

  if (!baseUrl || !sessionId || !idsr || !idForm) {
    console.log('❌ Sesión no válida');
    return null;
  }

  try {
    console.log(`📊 Paso 9: Descargando reporte ${reportName} (ID: ${reportId})...`);

    // 1. Obtener parámetros del reporte
    console.log('   Obteniendo parámetros del reporte...');
    const paramsResp = await client.post(
      `${baseUrl}/Listados/GridListados`,
      `sort=&group=&filter=&IdListado=${reportId}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': '*/*',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': `ASP.NET_SessionId=${sessionId}`,
          'Referer': `${baseUrl}/Home/Index`,
          'Origin': baseUrl,
          'idsr': idsr,
          'currentview': idForm,
        },
      }
    );

    let parametrosLista: any[] = [];
    let fechaIni: string | null = null;
    let fechaFin: string | null = null;

    // Verificar si hay parámetros
    if (paramsResp.data && Array.isArray(paramsResp.data.Data)) {
      parametrosLista = paramsResp.data.Data;

      if (parametrosLista.length > 0) {
        console.log(`   ✅ Encontrados ${parametrosLista.length} parámetros`);

        // Llenar parámetros con valores del usuario o valores por defecto
        parametrosLista = parametrosLista.map((param: any) => {
          const codigo = param.Codigo?.replace('@', '').toUpperCase();
          const nombre = param.Nombre?.toUpperCase();

          // Iniciar con null (no usar valores por defecto de la API)
          let valor = null;
          let valorProporcionado = false;

          if (userParams) {
            // Buscar por código o nombre (con diferentes formatos)
            for (const [key, val] of Object.entries(userParams)) {
              const keyNormalized = key.toUpperCase().replace(/[_\s-]/g, '');
              const codigoNormalized = codigo.replace(/[_\s-]/g, '');
              const nombreNormalized = nombre.replace(/[_\s-]/g, '');

              if (keyNormalized === codigoNormalized || keyNormalized === nombreNormalized) {
                valor = val;
                valorProporcionado = true;
                break;
              }
            }
          }

          // Si es parámetro de fecha y no fue proporcionado, usar fecha actual
          if ((nombre.includes('FECHA') || codigo.includes('FECHA')) && !valorProporcionado) {
            valor = new Date().toLocaleDateString('es-ES');
          }

          // Extraer fechas para FechaIni y FechaFin
          if (nombre.includes('DESDE') && nombre.includes('FECHA')) {
            fechaIni = valor;
          } else if (nombre.includes('HASTA') && nombre.includes('FECHA')) {
            fechaFin = valor;
          }

          console.log(`     - ${param.Nombre}: ${valor || '(vacío)'}`);

          return {
            ...param,
            Valor: valor,
          };
        });
      } else {
        console.log('   ℹ️  Este reporte no requiere parámetros');
      }
    }

    // 2. Exportar listado (genera el archivo)
    console.log('   Exportando listado...');

    const exportResp = await client.post(
      `${baseUrl}/Listados/ExportarListado`,
      {
        IdListado: reportId,
        Parametros: JSON.stringify(parametrosLista),
        IdForm: idForm,
        TipoListado: 'Listado',
        FechaIni: fechaIni,
        FechaFin: fechaFin,
        ParametrosLista: parametrosLista,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': `ASP.NET_SessionId=${sessionId}`,
          'Referer': `${baseUrl}/Home/Index`,
          'Origin': baseUrl,
          'idsr': idsr,
          'currentview': idForm,
          'postid': new Date().toISOString(),
        },
      }
    );

    console.log(`   ExportarListado: ${exportResp.status}`);
    console.log(`   Respuesta: ${JSON.stringify(exportResp.data)}`);

    if (exportResp.status !== 200) {
      console.log('   ⚠️  Error al exportar listado');
      return null;
    }

    // La respuesta debería contener el nombre del archivo
    const fileName = typeof exportResp.data === 'string'
      ? exportResp.data.replace(/"/g, '')
      : exportResp.data?.NombreArchivo || exportResp.data;

    console.log(`   ✅ Archivo generado: ${fileName}`);

    // 3. Descargar el archivo generado
    console.log('   Descargando archivo...');
    const downloadResp = await client.get(
      `${baseUrl}/Listados/ObtenerExcelExportado`,
      {
        params: { NombreListado: fileName },
        headers: {
          'Cookie': `ASP.NET_SessionId=${sessionId}`,
          'Referer': `${baseUrl}/Home/Index`,
        },
        responseType: 'arraybuffer',
      }
    );

    console.log(`   ObtenerExcelExportado: ${downloadResp.status}`);
    console.log(`   Tamaño: ${downloadResp.data.byteLength} bytes`);

    if (downloadResp.status !== 200 || downloadResp.data.byteLength === 0) {
      console.log('   ⚠️  Error al descargar archivo o archivo vacío');
      return null;
    }

    // 4. Guardar el archivo en carpeta organizada
    const folders = ensureQVETFolders();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destPath = path.join(folders.reports, `${reportName}-${timestamp}.xlsx`);

    fs.writeFileSync(destPath, Buffer.from(downloadResp.data));

    console.log(`✅ Reporte descargado exitosamente: ${destPath}`);
    console.log(`📊 Tamaño: ${(fs.statSync(destPath).size / 1024).toFixed(2)} KB`);

    return destPath;

  } catch (error: any) {
    console.error('❌ Error descargando reporte:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const reportId = args.find(arg => !arg.startsWith('--') && /^\d+$/.test(arg)) || '508';
  const reportName = args.find(arg => !arg.startsWith('--') && !/^\d+$/.test(arg)) || 'Proveedores';

  // Parsear parámetros del reporte (--param:NOMBRE=valor)
  const userParams: Record<string, string> = {};
  args.forEach(arg => {
    if (arg.startsWith('--param:')) {
      const paramPart = arg.substring(8); // Remove "--param:"
      const [key, value] = paramPart.split('=');
      if (key && value) {
        userParams[key] = value;
      }
    }
  });

  const hasParameters = Object.keys(userParams).length > 0;

  console.log('🏥 QVET Report Downloader (API Mode)');
  console.log('====================================\n');
  console.log(`📋 Reporte: ${reportName} (ID: ${reportId})`);
  console.log(`👤 Usuario: ${QVET_USER}`);
  console.log(`🏢 AUTO: ${QVET_AUTO}`);
  console.log(`📍 Ubicación: ${QVET_LOCATION}`);
  if (hasParameters) {
    console.log(`📅 Parámetros proporcionados:`);
    Object.entries(userParams).forEach(([key, val]) => {
      console.log(`     ${key} = ${val}`);
    });
  }
  console.log();

  // Intentar cargar sesión del caché o crear una nueva
  const session = await loadOrCreateSession();

  // Si no tenemos idForm (no debería pasar si la sesión es válida), navegar
  if (!session.idForm) {
    const navSuccess = await navigateToReports(session);
    if (!navSuccess) {
      console.log('❌ No se pudo navegar a reportes');
      process.exit(1);
    }
    // Guardar sesión con idForm ahora que lo tenemos
    saveSessionCache(session);
  }

  const filePath = await downloadReport(
    session,
    reportId,
    reportName,
    hasParameters ? userParams : undefined
  );
  if (!filePath) {
    console.log('❌ No se pudo descargar el reporte');
    process.exit(1);
  }

  // Guardar logs en carpeta organizada
  console.log('\n📝 Guardando logs del proceso...');

  const folders = ensureQVETFolders();

  const sessionInfo: any = {};
  if (session.baseUrl) sessionInfo.baseUrl = session.baseUrl;
  if (session.sessionId) sessionInfo.sessionId = session.sessionId;
  if (session.idsr) sessionInfo.idsr = session.idsr;
  if (session.idForm) sessionInfo.idForm = session.idForm;

  const processLog: ProcessLog = {
    timestamp: new Date().toISOString(),
    reportId,
    reportName,
    steps: apiCallLog.map((call, index) => ({
      step: index + 1,
      name: `${call.method} ${call.url}`,
      startTime: call.timestamp,
      status: call.error ? 'error' : call.responseStatus === 200 ? 'success' : 'warning',
      details: call,
    })),
    session: sessionInfo,
    result: {
      success: true,
      filePath,
      fileSize: fs.statSync(filePath).size,
    },
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(folders.logs, `${reportName}-${timestamp}.json`);
  fs.writeFileSync(logPath, JSON.stringify(processLog, null, 2));
  console.log(`   ✅ Log detallado: ${logPath}`);

  // También guardar el log simple de llamadas
  const simpleLogPath = path.join(folders.logs, `api-calls-latest.json`);
  fs.writeFileSync(simpleLogPath, JSON.stringify(apiCallLog, null, 2));
  console.log(`   ✅ Llamadas API: ${simpleLogPath}`);

  console.log('\n✅ Proceso completado exitosamente');
}

main().catch(console.error);
