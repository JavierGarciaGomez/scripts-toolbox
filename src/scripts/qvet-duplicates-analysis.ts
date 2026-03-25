import * as XLSX from 'xlsx';
import * as path from 'path';
import * as stringSimilarity from 'string-similarity';

const INPUT_PATH = path.resolve('tmp/listadoClientes.xlsx');
const OUTPUT_PATH = path.resolve('tmp/clientes_duplicados.xlsx');

// Emails falsos conocidos
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

interface Cliente {
  rowIdx: number;
  nombre: string;
  nombreNorm: string;
  telefonos: string[]; // últimos 7 dígitos de cada teléfono
  email: string;
  clinica: string;
  activo: boolean;
  fechaMasReciente: string;
  fechaAlta: string;
  comunicacionId: number;
  direccion: string;
}

interface Match {
  clienteA: Cliente;
  clienteB: Cliente;
  razones: string[];
  score: number;
}

function normalize(s: unknown): string {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function normPhone(s: unknown): string {
  const digits = String(s || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-7) : '';
}

function serialToDateStr(serial: unknown): string {
  if (!serial || typeof serial !== 'number' || isNaN(serial)) return '';
  return new Date((serial - 25569) * 86400 * 1000).toISOString().split('T')[0]!;
}

function isValidEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false;
  return !FAKE_EMAILS.has(email);
}

function main() {
  console.log('Leyendo clientes...');
  const wb = XLSX.readFile(INPUT_PATH);
  const data: Record<string, any>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]!]!);
  console.log(`  ${data.length} clientes`);

  const clientes: Cliente[] = data.map((r, i) => {
    const tels: string[] = [];
    for (const col of ['TELÉFONO1', 'TELÉFONO2', 'TELÉFONO SMS']) {
      const t = normPhone(r[col]);
      if (t && !tels.includes(t)) tels.push(t);
    }
    return {
      rowIdx: i,
      nombre: String(r['CLIENTE'] || '').trim(),
      nombreNorm: normalize(r['CLIENTE']),
      telefonos: tels,
      email: String(r['EMAIL'] || '').trim().toLowerCase(),
      clinica: normalize(r['CLÍNICA']),
      activo: r['ACTIVO'] === 1 || r['ACTIVO'] === '1',
      fechaMasReciente: serialToDateStr(r['ULTIMA VISITA']) || serialToDateStr(r['FECHA ALTA']),
      fechaAlta: serialToDateStr(r['FECHA ALTA']),
      comunicacionId: Number(r['COMUNICACION_IDCLIENTE']) || 0,
      direccion: normalize(r['DIRECCIÓN']),
    };
  });

  // Índices
  const byPhone = new Map<string, Cliente[]>();
  const byEmail = new Map<string, Cliente[]>();

  for (const c of clientes) {
    for (const tel of c.telefonos) {
      if (!byPhone.has(tel)) byPhone.set(tel, []);
      byPhone.get(tel)!.push(c);
    }
    if (isValidEmail(c.email)) {
      if (!byEmail.has(c.email)) byEmail.set(c.email, []);
      byEmail.get(c.email)!.push(c);
    }
  }

  console.log(`  ${byPhone.size} teléfonos únicos (7 dígitos)`);
  console.log(`  ${byEmail.size} emails únicos válidos`);

  // Buscar duplicados
  console.log('Buscando duplicados...');
  const matchMap = new Map<string, Match>();

  function getKey(a: Cliente, b: Cliente): string {
    return [Math.min(a.rowIdx, b.rowIdx), Math.max(a.rowIdx, b.rowIdx)].join('-');
  }

  function addMatch(a: Cliente, b: Cliente, razon: string, score: number) {
    const key = getKey(a, b);
    const existing = matchMap.get(key);
    if (existing) {
      if (!existing.razones.includes(razon)) existing.razones.push(razon);
      existing.score = Math.max(existing.score, score);
    } else {
      matchMap.set(key, { clienteA: a, clienteB: b, razones: [razon], score });
    }
  }

  // 1. Mismo teléfono (7 dígitos)
  console.log('  Teléfonos...');
  for (const [tel, group] of byPhone) {
    if (group.length < 2 || group.length > 30) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        addMatch(group[i]!, group[j]!, 'MISMO TELEFONO', 60);
      }
    }
  }

  // 2. Mismo email (no falso)
  console.log('  Emails...');
  for (const [_, group] of byEmail) {
    if (group.length < 2 || group.length > 30) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        addMatch(group[i]!, group[j]!, 'MISMO EMAIL', 60);
      }
    }
  }

  // 3. Enriquecer matches con similitud de nombre
  console.log('  Enriqueciendo con nombres...');
  for (const m of matchMap.values()) {
    const a = m.clienteA;
    const b = m.clienteB;

    if (a.nombreNorm === b.nombreNorm) {
      m.razones.push('NOMBRE EXACTO');
      m.score += 30;
    } else if (a.nombreNorm.includes(b.nombreNorm) || b.nombreNorm.includes(a.nombreNorm)) {
      m.razones.push('NOMBRE CONTENIDO');
      m.score += 25;
    } else if (a.nombreNorm.length >= 5 && b.nombreNorm.length >= 5) {
      const sim = stringSimilarity.compareTwoStrings(a.nombreNorm, b.nombreNorm);
      if (sim >= 0.5) {
        m.razones.push(`NOMBRE SIMILAR (${Math.round(sim * 100)}%)`);
        m.score += Math.round(sim * 25);
      }
    }

    // Misma clínica = ligero boost
    if (a.clinica && b.clinica && a.clinica === b.clinica) {
      m.score += 5;
    }
  }

  // 4. Nombre exacto sin otro dato en común (baja confianza)
  console.log('  Nombres exactos sin dato en común...');
  const byNombre = new Map<string, Cliente[]>();
  for (const c of clientes) {
    if (c.nombreNorm.length < 5) continue;
    if (!byNombre.has(c.nombreNorm)) byNombre.set(c.nombreNorm, []);
    byNombre.get(c.nombreNorm)!.push(c);
  }
  for (const [_, group] of byNombre) {
    if (group.length < 2 || group.length > 10) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const key = getKey(group[i]!, group[j]!);
        if (!matchMap.has(key)) {
          addMatch(group[i]!, group[j]!, 'NOMBRE EXACTO (sin dato en común)', 40);
        }
      }
    }
  }

  const matches = [...matchMap.values()].sort((a, b) => b.score - a.score);
  console.log(`  ${matches.length} pares encontrados`);

  // Clasificar
  const alta = matches.filter(m => m.score >= 80);
  const media = matches.filter(m => m.score >= 60 && m.score < 80);
  const baja = matches.filter(m => m.score < 60);

  // Stats
  const stats: Record<string, any>[] = [
    { 'METRICA': 'Total pares duplicados', 'VALOR': matches.length },
    { 'METRICA': '  Alta confianza (>=80)', 'VALOR': alta.length },
    { 'METRICA': '  Media confianza (60-79)', 'VALOR': media.length },
    { 'METRICA': '  Baja confianza (<60)', 'VALOR': baja.length },
    { 'METRICA': '', 'VALOR': '' },
    { 'METRICA': 'Por mismo teléfono', 'VALOR': matches.filter(m => m.razones.some(r => r.includes('TELEFONO'))).length },
    { 'METRICA': 'Por mismo email', 'VALOR': matches.filter(m => m.razones.some(r => r.includes('EMAIL'))).length },
    { 'METRICA': 'Por nombre exacto', 'VALOR': matches.filter(m => m.razones.some(r => r.includes('EXACTO'))).length },
    { 'METRICA': 'Por nombre similar/contenido', 'VALOR': matches.filter(m => m.razones.some(r => r.includes('SIMILAR') || r.includes('CONTENIDO'))).length },
    { 'METRICA': '', 'VALOR': '' },
    { 'METRICA': 'Clientes únicos involucrados', 'VALOR': new Set(matches.flatMap(m => [m.clienteA.rowIdx, m.clienteB.rowIdx])).size },
  ];

  // Output
  const outputRows = matches.map(m => ({
    'SCORE': m.score,
    'CONFIANZA': m.score >= 80 ? 'ALTA' : m.score >= 60 ? 'MEDIA' : 'BAJA',
    'RAZONES': m.razones.join(' + '),
    'NOMBRE_A': m.clienteA.nombre,
    'CLINICA_A': m.clienteA.clinica,
    'ACTIVO_A': m.clienteA.activo ? 'SI' : 'NO',
    'ULT_ACTIVIDAD_A': m.clienteA.fechaMasReciente,
    'TEL_A': m.clienteA.telefonos.join(', '),
    'EMAIL_A': m.clienteA.email,
    'ID_A': m.clienteA.comunicacionId,
    'NOMBRE_B': m.clienteB.nombre,
    'CLINICA_B': m.clienteB.clinica,
    'ACTIVO_B': m.clienteB.activo ? 'SI' : 'NO',
    'ULT_ACTIVIDAD_B': m.clienteB.fechaMasReciente,
    'TEL_B': m.clienteB.telefonos.join(', '),
    'EMAIL_B': m.clienteB.email,
    'ID_B': m.clienteB.comunicacionId,
  }));

  console.log('Escribiendo Excel...');
  const wbOut = XLSX.utils.book_new();

  const wsStats = XLSX.utils.json_to_sheet(stats);
  wsStats['!cols'] = [{ wch: 32 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wbOut, wsStats, 'Resumen');

  const wsMatches = XLSX.utils.json_to_sheet(outputRows);
  wsMatches['!cols'] = [
    { wch: 6 }, { wch: 10 }, { wch: 40 },
    { wch: 30 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 25 }, { wch: 10 },
    { wch: 30 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 25 }, { wch: 10 },
  ];
  wsMatches['!autofilter'] = { ref: wsMatches['!ref']! };
  XLSX.utils.book_append_sheet(wbOut, wsMatches, 'Duplicados');

  XLSX.writeFile(wbOut, OUTPUT_PATH);
  console.log(`Guardado: ${OUTPUT_PATH}`);
}

main();
