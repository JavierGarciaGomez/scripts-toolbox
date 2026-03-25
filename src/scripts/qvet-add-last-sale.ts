import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';

const CLIENTES_PATH = path.resolve('tmp/listadoClientes.xlsx');
const VENTAS_CSV = path.resolve('tmp/ventas_all.csv');
const OUTPUT_PATH = path.resolve('tmp/listadoClientes_conUltimaVenta.xlsx');

const COLS_ORDER = [
  'CLIENTE', 'ACTIVO',
  'FECHA ALTA', 'ULTIMA VISITA', 'ULTIMA_VENTA', 'FECHA_MAS_RECIENTE',
  'CLÍNICA', 'TELÉFONO1', 'TELÉFONO2', 'TELÉFONO SMS', 'EMAIL', 'DNI',
  'DIRECCIÓN', 'POBLACIÓN', 'PROVINCIA', 'CÓDIGO POSTAL',
  'FECHA BAJA', 'CODIGO ALTERNATIVO', 'IDIOMA', 'MAILING', 'FORMA PAGO', 'WEB',
  'PERSONAL ALTA', 'ID PROPIETARIO', 'TIPO CLIENTE', 'OBSERVACIONES', 'otrosdatos',
  'AVISOS', 'PROCEDENCIA', 'NACIONALIDAD CLIENTE', 'PAIS CLIENTE', 'sexo',
  'FECHA NACIMIENTO', 'TIPO DOCUMENTO', 'PLANTILLA DESCUENTO', 'COMUNICACION_IDCLIENTE',
];

const DATE_COLS = new Set(['FECHA ALTA', 'ULTIMA VISITA', 'ULTIMA_VENTA', 'FECHA_MAS_RECIENTE', 'FECHA BAJA', 'FECHA NACIMIENTO']);

const FAKE_EMAILS = new Set([
  '123@hotmail.com', 'a@a.com', 'notiene@gmail.com', 'q@q.com',
  'no@gmail.com', 'sincorreo@gmail.com', 'notiene@hotmail.com',
  '1@hotmail.com', '123@gmail.com', 'quiensabe@gmail.com',
  'nopregunte@gmail.com', 'a.a@gmail.com', 'a.a@hotmail.com',
  '1.1@hotmail.com', 'notienecorreo@gmail.com', 'no@hotmail.com',
  '1@1.com', 'a@q.com', 'nopregunte@hotmail.com', 'notiene@gmail.cim',
  'q@a.com', 'notien@gmail.com', '123@hotmai.com', 'noemail@gmail.com',
  'nori@hotmail.com', 'noni@hotmail.com', 'nori@gmail.com', 'sd',
]);

function serialToDateStr(serial: unknown): string {
  if (!serial || typeof serial !== 'number' || isNaN(serial)) return '';
  return new Date((serial - 25569) * 86400 * 1000).toISOString().split('T')[0]!;
}

function normPhone(s: unknown): string {
  const digits = String(s || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-7) : '';
}

// Pre-index: for each client, store their phones and email
interface ClientIndex {
  id: number;
  year: string; // year of FECHA_MAS_RECIENTE, '' if none
  phones: string[];
  email: string;
}

function buildClientIndex(rows: Record<string, any>[]): ClientIndex[] {
  return rows.map(r => {
    const phones: string[] = [];
    for (const col of ['TELÉFONO1', 'TELÉFONO2', 'TELÉFONO SMS']) {
      const t = normPhone(r[col]);
      if (t && !phones.includes(t)) phones.push(t);
    }
    const rawEmail = String(r['EMAIL'] || '').trim().toLowerCase();
    const email = (rawEmail && rawEmail.includes('@') && !FAKE_EMAILS.has(rawEmail)) ? rawEmail : '';
    const masReciente = String(r['FECHA_MAS_RECIENTE'] || '');
    return {
      id: r['COMUNICACION_IDCLIENTE'] as number,
      year: masReciente ? masReciente.substring(0, 4) : '',
      phones,
      email,
    };
  });
}

function countDuplicatesAfterCutoff(index: ClientIndex[], cutoffYear: string): number {
  // Clients that survive: year > cutoffYear
  const surviving = index.filter(c => c.year > cutoffYear);

  const byPhone = new Map<string, number[]>(); // phone -> client indices in surviving
  const byEmail = new Map<string, number[]>();

  for (let i = 0; i < surviving.length; i++) {
    const c = surviving[i]!;
    for (const tel of c.phones) {
      if (!byPhone.has(tel)) byPhone.set(tel, []);
      byPhone.get(tel)!.push(i);
    }
    if (c.email) {
      if (!byEmail.has(c.email)) byEmail.set(c.email, []);
      byEmail.get(c.email)!.push(i);
    }
  }

  const dupIndices = new Set<number>();
  for (const [_, indices] of byPhone) {
    if (indices.length >= 2 && indices.length <= 30) {
      for (const idx of indices) dupIndices.add(idx);
    }
  }
  for (const [_, indices] of byEmail) {
    if (indices.length >= 2 && indices.length <= 30) {
      for (const idx of indices) dupIndices.add(idx);
    }
  }

  return dupIndices.size;
}

function maxDateStr(...dates: string[]): string {
  return dates.filter(Boolean).sort().pop() || '';
}

async function readVentasFromCSV(): Promise<Map<number, number>> {
  const ultimaVenta = new Map<number, number>();
  const rl = readline.createInterface({ input: fs.createReadStream(VENTAS_CSV), crlfDelay: Infinity });

  // Columns are fixed positions (from header): FECHA=2(0-based), COMUNICACION_IDCLIENTE=52
  let isHeader = true;
  let count = 0;

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    // Split from the end to get COMUNICACION_IDCLIENTE (col 52) reliably
    const cols = line.split(',');
    const idStr = cols[52];
    const fechaStr = cols[2];
    if (!idStr || !fechaStr) continue;
    const id = Number(idStr);
    if (!id) continue;
    // Parse date like "3/16/21 8:24" or "12/5/2023 10:30"
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) continue;
    const ts = d.getTime();
    const cur = ultimaVenta.get(id);
    if (!cur || ts > cur) ultimaVenta.set(id, ts);
    count++;
  }

  console.log(`  ${count} filas procesadas, ${ultimaVenta.size} clientes con ventas`);
  return ultimaVenta;
}

async function main() {
  console.log('Leyendo ventas (CSV)...');
  const ultimaVenta = await readVentasFromCSV();

  console.log('Leyendo clientes...');
  const clientesWb = XLSX.readFile(CLIENTES_PATH);
  const clientes: Record<string, any>[] = XLSX.utils.sheet_to_json(clientesWb.Sheets[clientesWb.SheetNames[0]!]!);
  console.log(`  ${clientes.length} clientes`);

  const rows: Record<string, any>[] = [];
  let conVenta = 0;

  for (const c of clientes) {
    const fechaAlta = serialToDateStr(c['FECHA ALTA']);
    const ultVisita = serialToDateStr(c['ULTIMA VISITA']);
    const id = c['COMUNICACION_IDCLIENTE'] as number | undefined;
    const ventaTs = id ? ultimaVenta.get(id) : undefined;
    const ultVenta = ventaTs ? new Date(ventaTs).toISOString().split('T')[0]! : '';
    if (ultVenta) conVenta++;

    const row: Record<string, any> = {};
    for (const col of COLS_ORDER) {
      if (col === 'ULTIMA_VENTA') row[col] = ultVenta;
      else if (col === 'FECHA_MAS_RECIENTE') row[col] = maxDateStr(fechaAlta, ultVisita, ultVenta);
      else if (DATE_COLS.has(col)) row[col] = serialToDateStr(c[col]);
      else row[col] = c[col] ?? '';
    }
    rows.push(row);
  }

  // --- Stats por año de última actividad ---
  console.log('Calculando estadísticas...');
  type YearStats = { total: number; activos: number; inactivos: number; sinEmail: number; sinTelefono: number; nuevos: number };
  const newStats = (): YearStats => ({ total: 0, activos: 0, inactivos: 0, sinEmail: 0, sinTelefono: 0, nuevos: 0 });
  const statsByYear = new Map<string, YearStats>();
  const sinActividad = newStats();

  for (const row of rows) {
    const masReciente = row['FECHA_MAS_RECIENTE'] as string;
    const year = masReciente ? masReciente.substring(0, 4) : '';
    const activo = row['ACTIVO'] === 1 || row['ACTIVO'] === '1';
    const tieneEmail = !!row['EMAIL'];
    const tieneTel = !!row['TELÉFONO1'];
    const altaYear = (row['FECHA ALTA'] as string)?.substring(0, 4) || '';

    // Contar nuevos por año de alta
    if (altaYear) {
      if (!statsByYear.has(altaYear)) statsByYear.set(altaYear, newStats());
      statsByYear.get(altaYear)!.nuevos++;
    }

    if (!year) {
      sinActividad.total++;
      if (activo) sinActividad.activos++; else sinActividad.inactivos++;
      if (!tieneEmail) sinActividad.sinEmail++;
      if (!tieneTel) sinActividad.sinTelefono++;
      continue;
    }

    if (!statsByYear.has(year)) statsByYear.set(year, newStats());
    const s = statsByYear.get(year)!;
    s.total++;
    if (activo) s.activos++; else s.inactivos++;
    if (!tieneEmail) s.sinEmail++;
    if (!tieneTel) s.sinTelefono++;
  }

  // Pre-build index for duplicate counting
  console.log('Calculando duplicados por corte...');
  const clientIndex = buildClientIndex(rows);

  const years = [...statsByYear.keys()].sort();
  const statsRows: Record<string, any>[] = [];
  let acumuladoBorrables = 0;

  for (const year of years) {
    const s = statsByYear.get(year)!;
    acumuladoBorrables += s.total;
    const dupsAfter = countDuplicatesAfterCutoff(clientIndex, year);
    const survivingCount = rows.length - acumuladoBorrables;
    statsRows.push({
      'AÑO ULTIMA ACTIVIDAD': year,
      'CLIENTES': s.total,
      'NUEVOS (alta ese año)': s.nuevos,
      'ACTIVOS': s.activos,
      'INACTIVOS (ACTIVO=0)': s.inactivos,
      'SIN EMAIL': s.sinEmail,
      'SIN TELEFONO': s.sinTelefono,
      'ACUMULADO (desactivables si cortas aquí)': acumuladoBorrables,
      'QUEDARÍAN': survivingCount,
      'DUPLICADOS QUE QUEDARÍAN': dupsAfter,
    });
  }
  // Sin actividad
  acumuladoBorrables += sinActividad.total;
  statsRows.push({
    'AÑO ULTIMA ACTIVIDAD': 'SIN ACTIVIDAD',
    'CLIENTES': sinActividad.total,
    'NUEVOS (alta ese año)': '',
    'ACTIVOS': sinActividad.activos,
    'INACTIVOS (ACTIVO=0)': sinActividad.inactivos,
    'SIN EMAIL': sinActividad.sinEmail,
    'SIN TELEFONO': sinActividad.sinTelefono,
    'ACUMULADO (desactivables si cortas aquí)': acumuladoBorrables,
    'QUEDARÍAN': '',
    'DUPLICADOS QUE QUEDARÍAN': '',
  });
  // Total
  const totalDups = countDuplicatesAfterCutoff(clientIndex, '0000');
  statsRows.push({
    'AÑO ULTIMA ACTIVIDAD': 'TOTAL',
    'CLIENTES': rows.length,
    'NUEVOS (alta ese año)': '',
    'ACTIVOS': rows.filter(r => r['ACTIVO'] === 1 || r['ACTIVO'] === '1').length,
    'INACTIVOS (ACTIVO=0)': rows.filter(r => r['ACTIVO'] !== 1 && r['ACTIVO'] !== '1').length,
    'SIN EMAIL': rows.filter(r => !r['EMAIL']).length,
    'SIN TELEFONO': rows.filter(r => !r['TELÉFONO1']).length,
    'ACUMULADO (desactivables si cortas aquí)': '',
    'QUEDARÍAN': rows.length,
    'DUPLICADOS QUE QUEDARÍAN': totalDups,
  });

  // --- Write Excel ---
  console.log('Escribiendo Excel...');
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = COLS_ORDER.map(col => ({ wch: col === 'CLIENTE' ? 35 : DATE_COLS.has(col) ? 14 : 16 }));
  ws['!autofilter'] = { ref: ws['!ref']! };

  const wsStats = XLSX.utils.json_to_sheet(statsRows);
  wsStats['!cols'] = [
    { wch: 22 }, { wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 38 }, { wch: 12 }, { wch: 26 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsStats, 'Estadísticas');
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  XLSX.writeFile(wb, OUTPUT_PATH);

  console.log(`  ${conVenta} clientes con venta`);
  console.log(`Guardado: ${OUTPUT_PATH}`);
}

main();
