/**
 * QVET List Reports
 *
 * Muestra todos los reportes disponibles en QVET con sus IDs
 */

import axios from 'axios';
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

const QVET_USER = process.env.QVET_USER || 'JAVIERH';
const QVET_PASS = process.env.QVET_PASS || 'Victorhug0.-';
const QVET_AUTO = process.env.QVET_AUTO || 'HVPENINSULARSC';

async function listReports() {
  const client = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    validateStatus: () => true,
    maxRedirects: 0,
  });

  try {
    console.log('🔐 Autenticando...');

    // Login flow simplificado
    await client.post('https://go.qvet.net/Home/EsSAML', { clinica: QVET_AUTO }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Origin': 'https://go.qvet.net', 'Referer': 'https://go.qvet.net/' },
    });

    await client.post('https://go.qvet.net/Home/EsUserQvetAndSAML', { clinica: QVET_AUTO, user: QVET_USER }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Origin': 'https://go.qvet.net', 'Referer': 'https://go.qvet.net/' },
    });

    const loginResp = await client.post('https://go.qvet.net/Home/DoLogin', { NombreClinica: QVET_AUTO, UserName: QVET_USER, Pwd: QVET_PASS }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Origin': 'https://go.qvet.net', 'Referer': 'https://go.qvet.net/' },
    });

    const baseUrl = loginResp.data.Url || loginResp.data.URL;
    if (!baseUrl) {
      console.log('❌ Error en login');
      return;
    }

    const equipoName = `Equipo_${Math.random().toString(36).substring(7)}`;
    const autoLoginParams = new URLSearchParams({
      NombreEquipo: equipoName, BD: '', Servidor: '', Pais: '', FlagFree4Vet: 'False', EmailFree4Vet: 'False',
      ResetPasswordF4V: 'False', Free4Vet: 'False', EmailMensajeVisible: 'False', Clinica: QVET_AUTO,
      UserName: QVET_USER, Password: QVET_PASS, IdCentro: '', RedirectTo: '/',
    });

    await client.post(`${baseUrl}/Login/AutoLogin`, autoLoginParams.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://go.qvet.net', 'Referer': 'https://go.qvet.net/' },
    });

    const idsrValue = uuidv4();
    const comprobarResp = await client.post(`${baseUrl}/Login/ComprobarUsuario`, {
      model: { NombreEquipo: equipoName, AutoLogin: 'True', BD: '', Servidor: '', Pais: '', Free4Vet: 'False',
        SAMLToken: '', Clinica: QVET_AUTO, UserName: QVET_USER, Password: QVET_PASS, OTP: '', IdCentro: '', RedirectTo: '/Home/Index' },
      NombreEquipo: '', DireccionMAC: '', QVetWS: false, TipoDispositivoWeb: 0,
    }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Origin': baseUrl,
        'Referer': `${baseUrl}/Login/AutoLogin`, 'postid': new Date().toISOString() },
    });

    const sessionId = comprobarResp.data?.SessionId;
    if (!sessionId) {
      console.log('❌ No se obtuvo SessionId');
      return;
    }

    await client.post(`${baseUrl}/Login/ComprobarUsuario`, {
      model: { NombreEquipo: equipoName, AutoLogin: 'True', BD: '', Servidor: '', Pais: '', Free4Vet: 'False',
        SAMLToken: '', Clinica: QVET_AUTO, UserName: QVET_USER, Password: QVET_PASS, OTP: '', IdCentro: '1', RedirectTo: '/Home/Index' },
      NombreEquipo: '', DireccionMAC: '', QVetWS: false, TipoDispositivoWeb: 0,
    }, {
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': `ASP.NET_SessionId=${sessionId}`,
        'Origin': baseUrl, 'Referer': `${baseUrl}/Login/AutoLogin`, 'postid': new Date().toISOString() },
    });

    // Inicializar sesión
    await client.post(`${baseUrl}/Asincrono/AsignarIdentificadorConexion`, `Id=${idsrValue}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest',
        'Cookie': `ASP.NET_SessionId=${sessionId}`, 'Origin': baseUrl, 'Referer': `${baseUrl}/Home/Index`, 'idsr': idsrValue },
    });

    console.log('📋 Obteniendo lista de reportes...\n');

    // Obtener lista de reportes
    const reportsResp = await client.post(`${baseUrl}/Listados/GridListados`, 'sort=&group=&filter=&IdListado=', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest',
        'Cookie': `ASP.NET_SessionId=${sessionId}`, 'Origin': baseUrl, 'Referer': `${baseUrl}/Home/Index`, 'idsr': idsrValue },
    });

    if (reportsResp.status === 200 && reportsResp.data) {
      const reports = reportsResp.data;

      console.log('📊 Reportes disponibles:');
      console.log('========================\n');

      if (Array.isArray(reports)) {
        reports.forEach((report: any) => {
          console.log(`ID: ${report.Id || report.IdListado || '?'}`);
          console.log(`Nombre: ${report.Nombre || report.Name || '?'}`);
          console.log(`Descripción: ${report.Descripcion || report.Description || '-'}`);
          console.log('---');
        });

        // Guardar en archivo
        const outputPath = path.join(process.cwd(), 'data', 'qvet-reportes-disponibles.json');
        fs.writeFileSync(outputPath, JSON.stringify(reports, null, 2));
        console.log(`\n💾 Lista completa guardada en: ${outputPath}`);
      } else {
        console.log('Respuesta:', JSON.stringify(reports, null, 2));
      }
    } else {
      console.log('⚠️  Error al obtener reportes:', reportsResp.status);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

listReports().catch(console.error);
