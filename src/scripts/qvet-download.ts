import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Configuración
const BASE_URL = 'https://v116r25-20250424-mx-02.qvet.net';
const COOKIES = '_ga=GA1.1.1053721816.1747075587; __zlcmid=1Rcnbp7Y9LD1KxT; _ga_9Y5VVFQKZM=GS2.1.s1749346798$o3$g1$t1749346807$j51$l0$h0; ASP.NET_SessionId=j50dpfvv2ca55m102hxkmcht';

interface ReportRequest {
  IdListado: string;
  Parametros: string;
  IdForm: string;
  TipoListado: string;
  FechaIni: null | string;
  FechaFin: null | string;
  ParametrosLista: any[];
}

async function downloadReport(idListado: string = '508') {
  console.log(`📊 Descargando reporte ${idListado} de QVET...`);

  const requestData: ReportRequest = {
    IdListado: idListado,
    Parametros: '[]',
    IdForm: 'e2e5c601bb7dcab2365aeead3f1bf899',
    TipoListado: 'Listado',
    FechaIni: null,
    FechaFin: null,
    ParametrosLista: []
  };

  try {
    // Primero intentar SIN X-Requested-With para que el servidor devuelva el archivo directamente
    console.log('🔄 Intentando descarga directa (sin XHR header)...');
    const response = await axios.post(
      `${BASE_URL}/Listados/ExportarListado`,
      requestData,
      {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'es,en-US;q=0.9,en;q=0.8,it;q=0.7,fr;q=0.6',
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'Cookie': COOKIES,
          'Referer': `${BASE_URL}/Home/Index`,
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          'PostId': new Date().toISOString(),
          'currentview': 'e2e5c601bb7dcab2365aeead3f1bf899',
          'idSR': 'c94b36fb-3f1b-4ccf-a3f5-65bc63717ef7',
        },
        responseType: 'arraybuffer', // Para manejar archivos binarios
      }
    );

    // Verificar si es un archivo Excel o JSON
    const contentType = response.headers['content-type'];
    console.log('📝 Content-Type:', contentType);
    console.log('📏 Response size:', response.data.byteLength, 'bytes');

    // Intentar extraer el nombre del archivo del header Content-Disposition
    let filename = 'reporte.xlsx';
    const contentDisposition = response.headers['content-disposition'];
    if (contentDisposition) {
      const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
      if (matches && matches[1]) {
        filename = matches[1].replace(/['"]/g, '');
      }
    }

    // Si la respuesta es pequeña, podría ser JSON con el nombre del archivo
    if (response.data.byteLength < 1000) {
      const text = Buffer.from(response.data).toString('utf-8');
      console.log('📄 Response body:', text);

      // Si es solo el nombre del archivo, intentar descargarlo
      if (text.includes('.xlsx') || text.includes('.xls')) {
        const fileName = text.replace(/"/g, '').trim();
        console.log('📥 Intentando descargar archivo:', fileName);

        // Probar diferentes URLs comunes para descarga
        const downloadUrls = [
          `${BASE_URL}/Listados/DescargarArchivo?file=${fileName}`,
          `${BASE_URL}/Listados/Descargar?file=${fileName}`,
          `${BASE_URL}/Download/${fileName}`,
          `${BASE_URL}/Listados/${fileName}`,
          `${BASE_URL}/Files/${fileName}`,
          `${BASE_URL}/Temp/${fileName}`,
        ];

        for (const downloadUrl of downloadUrls) {
          try {
            console.log(`🔍 Probando: ${downloadUrl}`);
            const downloadResponse = await axios.get(downloadUrl, {
              headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'es,en-US;q=0.9,en;q=0.8,it;q=0.7,fr;q=0.6',
                'Cache-Control': 'no-cache',
                'Cookie': COOKIES,
                'Origin': BASE_URL,
                'Pragma': 'no-cache',
                'Referer': `${BASE_URL}/Home/Index`,
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest',
                'currentview': 'e2e5c601bb7dcab2365aeead3f1bf899',
                'idSR': 'c94b36fb-3f1b-4ccf-a3f5-65bc63717ef7',
              },
              responseType: 'arraybuffer',
              timeout: 10000,
            });

            console.log(`   Status: ${downloadResponse.status}`);
            console.log(`   Content-Type: ${downloadResponse.headers['content-type']}`);
            console.log(`   Size: ${downloadResponse.data.byteLength} bytes`);

            // Verificar si el archivo tiene contenido
            if (downloadResponse.data.byteLength === 0) {
              console.log(`   ⚠️  Archivo vacío, continuando...`);
              continue;
            }

            // Si llegamos aquí, la descarga funcionó
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) {
              fs.mkdirSync(dataDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filepath = path.join(dataDir, `qvet-reporte-${idListado}-${timestamp}.xlsx`);

            fs.writeFileSync(filepath, Buffer.from(downloadResponse.data));
            console.log(`✅ Reporte descargado exitosamente: ${filepath}`);
            console.log(`📊 Tamaño: ${(downloadResponse.data.byteLength / 1024).toFixed(2)} KB`);
            return;

          } catch (err: any) {
            // Continuar con la siguiente URL
            if (err.response?.status === 404) {
              console.log(`   ❌ 404 - No encontrado`);
            } else if (err.code === 'ECONNABORTED') {
              console.log(`   ⏱️  Timeout`);
            } else {
              console.log(`   ❌ Error: ${err.message}`);
            }
          }
        }

        console.log('\n⚠️  No se pudo encontrar la URL de descarga automática.');
        console.log('   Por favor captura la petición de descarga en el Network tab de Chrome.');
        return;
      }
    }

    // Guardar el archivo
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filepath = path.join(dataDir, `qvet-reporte-${idListado}-${timestamp}.xlsx`);

    fs.writeFileSync(filepath, Buffer.from(response.data));
    console.log(`✅ Reporte descargado exitosamente: ${filepath}`);
    console.log(`📊 Tamaño: ${(response.data.byteLength / 1024).toFixed(2)} KB`);

  } catch (error: any) {
    console.error('❌ Error al descargar reporte:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   StatusText:', error.response.statusText);
      console.error('   Headers:', error.response.headers);

      // Intentar mostrar el body si es pequeño
      if (error.response.data) {
        const text = Buffer.from(error.response.data).toString('utf-8').slice(0, 500);
        console.error('   Body preview:', text);
      }
    } else {
      console.error('   Message:', error.message);
    }
    throw error;
  }
}

// Main
async function main() {
  const idListado = process.argv[2] || '508'; // Default al que me pasaste
  await downloadReport(idListado);
}

main().catch(console.error);
