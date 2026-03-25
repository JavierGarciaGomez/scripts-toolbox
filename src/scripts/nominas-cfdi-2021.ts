/**
 * nominas-cfdi-2021.ts
 *
 * Lee los RegistroNomina.xlsm de cada quincena (hoja CF) y genera:
 *   - Nominas2021_CFDI_Completo.xlsx
 *       - Hoja "Resumen": totales por colaborador
 *       - Una hoja por colaborador: desglose por quincena con conceptos SAT
 *
 * Uso:
 *   npx ts-node src/scripts/nominas-cfdi-2021.ts [carpeta-2021] [ruta-output]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

// ─── Rutas ────────────────────────────────────────────────────────────────────

const BASE_DIR =
  process.argv[2] ||
  '/home/javier/Dropbox/HOSPITAL PETCO (ARCHIVO)/Recursos humanos/Nominas quincenales/2021';

const CONSOLIDADO_PATH =
  path.join(BASE_DIR, 'Nominas2021_Consolidado.xlsx');

const OUTPUT_PATH =
  process.argv[3] ||
  path.join(BASE_DIR, 'Nominas2021_CFDI_Regenerado.xlsx');

// ─── Quincenas ────────────────────────────────────────────────────────────────

interface Quincena {
  folder: string;
  label: string;
  inicio: string;
  fin: string;
  pago: string;
}

export const QUINCENAS: Quincena[] = [
  // Q1: último día del mes anterior → día 14  (pago = día 14)
  // Q2: día 15 → penúltimo día del mes        (pago = penúltimo)
  { folder: '01EneroQ1',       label: 'Ene Q1', inicio: '31/12/2020', fin: '14/01/2021', pago: '14/01/2021' },
  { folder: '01EneroQ2',       label: 'Ene Q2', inicio: '15/01/2021', fin: '30/01/2021', pago: '30/01/2021' },
  { folder: '02FebreroQ1',     label: 'Feb Q1', inicio: '31/01/2021', fin: '14/02/2021', pago: '14/02/2021' },
  { folder: '02FebreroQ2',     label: 'Feb Q2', inicio: '15/02/2021', fin: '27/02/2021', pago: '27/02/2021' },
  { folder: '03MarzoQ1',       label: 'Mar Q1', inicio: '28/02/2021', fin: '14/03/2021', pago: '14/03/2021' },
  { folder: '03MarzoQ2',       label: 'Mar Q2', inicio: '15/03/2021', fin: '30/03/2021', pago: '30/03/2021' },
  { folder: '04AbrilQ1',       label: 'Abr Q1', inicio: '31/03/2021', fin: '14/04/2021', pago: '14/04/2021' },
  { folder: '04AbrilQ2',       label: 'Abr Q2', inicio: '15/04/2021', fin: '29/04/2021', pago: '29/04/2021' },
  { folder: '05MayoQ1',        label: 'May Q1', inicio: '30/04/2021', fin: '14/05/2021', pago: '14/05/2021' },
  { folder: '05MayoQ2',        label: 'May Q2', inicio: '15/05/2021', fin: '30/05/2021', pago: '30/05/2021' },
  { folder: '06JunioQ1',       label: 'Jun Q1', inicio: '31/05/2021', fin: '14/06/2021', pago: '14/06/2021' },
  { folder: '06JunioQ2',       label: 'Jun Q2', inicio: '15/06/2021', fin: '29/06/2021', pago: '29/06/2021' },
  { folder: '07JulioQ1',       label: 'Jul Q1', inicio: '30/06/2021', fin: '14/07/2021', pago: '14/07/2021' },
  { folder: '07JulioQ2',       label: 'Jul Q2', inicio: '15/07/2021', fin: '30/07/2021', pago: '30/07/2021' },
  { folder: '08AgostoQ1',      label: 'Ago Q1', inicio: '31/07/2021', fin: '14/08/2021', pago: '14/08/2021' },
  { folder: '08AgostoQ2',      label: 'Ago Q2', inicio: '15/08/2021', fin: '30/08/2021', pago: '30/08/2021' },
  { folder: '09Septiembre Q1', label: 'Sep Q1', inicio: '31/08/2021', fin: '14/09/2021', pago: '14/09/2021' },
  { folder: '09SeptiembreQ2',  label: 'Sep Q2', inicio: '15/09/2021', fin: '29/09/2021', pago: '29/09/2021' },
  { folder: '10OctubreQ1',     label: 'Oct Q1', inicio: '30/09/2021', fin: '14/10/2021', pago: '14/10/2021' },
  { folder: '10OctubreQ2',     label: 'Oct Q2', inicio: '15/10/2021', fin: '30/10/2021', pago: '30/10/2021' },
  { folder: '11NoviembreQ1',   label: 'Nov Q1', inicio: '31/10/2021', fin: '14/11/2021', pago: '14/11/2021' },
  { folder: '11NoviembreQ2',   label: 'Nov Q2', inicio: '15/11/2021', fin: '29/11/2021', pago: '29/11/2021' },
  { folder: '12DiciembreQ1',   label: 'Dic Q1', inicio: '30/11/2021', fin: '14/12/2021', pago: '14/12/2021' },
  { folder: '12DiciembreQ2',   label: 'Dic Q2', inicio: '15/12/2021', fin: '30/12/2021', pago: '30/12/2021' },
];

// ─── Constantes SAT 2021 ──────────────────────────────────────────────────────

const SMG_2021 = 141.70;
const AGUINALDO_EXENTO  = 30 * SMG_2021;  // 4251
const PRIMA_VAC_EXENTO  = 15 * SMG_2021;  // 2125.50

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Concepto {
  importe: number;
  gravado: number;
  exento: number;
}


export interface ColaboradorInfo {
  codigo:  string;
  nombre:  string;
  puesto:  string;
  rfc:     string;
  jornada: number;
  salario: number;
  forma:   string;
  sh:      number; // Salario por Hora (Catalogo c17)
  curp:    string; // col[11]
  imss:    string; // col[12] — puede ser inválido, validar antes de usar
  sbc:     number; // Salario Base de Cotización col[7]
  sd:      number; // Salario Diario col[16]
}

export interface ColaboradorData {
  info:      ColaboradorInfo;
  quincenas: (QuincenaData | null)[];
}

export interface QuincenaData {
  salario:         Concepto;
  comisiones:      Concepto;
  bonoPuntualidad: Concepto;
  otrosIngresos:   Concepto;
  valesDespensa:   Concepto;
  primaDominical:  Concepto;
  diasDescanso:    Concepto;
  horasExtras:     Concepto;
  primaVacacional: Concepto;
  aguinaldo:       Concepto;
  isr:      number;
  imss:     number;
  infonavit:number;
  subsidio: number;
  sh:            number;
  rawHe:         number;
  totalDesglose: number;
  /** Quincena con datos estimados (promedio 3 meses prev). Se timbra pero se marca en Excel. */
  estimated?: boolean;
  /** Quincena excluida explícitamente. No se timbra ni se cuenta en totales. */
  excluded?:  boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function concepto(importe: number, gravado: number): Concepto {
  return { importe, gravado, exento: importe - gravado };
}

// ─── Leer Desglose sheet de un RegistroNomina.xlsm ───────────────────────────

/**
 * Lee el sheet "Desglose" de un RegistroNomina.xlsm y devuelve los datos CFDI
 * de cada colaborador para esa quincena.
 *
 * diasPeriodo: días calendario del periodo (para el cap de HE+DiasDescanso)
 *   Cap exento = min(combined/2, 5*SMG*(diasPeriodo/7)/2)  [Desglose R195]
 *
 * Concept IDs:
 *   1=Salario, 2=Comisiones, 3=BonoPuntualidad
 *   4=CompMontejo(gravado), 5=CompVacaciones(exento), 6=CompFaltas(exento),
 *   7=CompExtra(exento), 8=CompAlimentos(vales/exento), 9=CompIngresoMin(exento)
 *   10=PrimaDominical(exento), 11=DiasDescanso(max0,50/50 con cap), 12=HorasExtras(50/50 con cap)
 *   13=PrimaVacacional(partial exento), 14=Aguinaldo(partial exento)
 *   15=Subsidio, 21=ISR, 22=IMSS
 */
function leerDesglose(ws: XLSX.WorkSheet, diasPeriodo: number): Map<string, QuincenaData> {
  if (!ws) return new Map();

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  // Row 1 has employee codes starting at col 2
  const headerRow = rows[1] as unknown[];
  if (!headerRow) return new Map();

  // colMap: employee code → column index
  const colMap: Record<string, number> = {};
  for (let i = 2; i < (headerRow as unknown[]).length; i++) {
    const code = String((headerRow as unknown[])[i] || '').trim();
    if (code && code.length >= 2 && code.length <= 6 && /^[A-Z]+$/.test(code)) {
      colMap[code] = i;
    }
  }

  // Accumulate raw values per employee
  interface RawData {
    salario?: number; comisiones?: number; bonoPuntualidad?: number;
    compMontejo?: number; compVacaciones?: number; compFaltas?: number;
    compExtra?: number; valesDespensa?: number; compIngresoMin?: number;
    primaDominical?: number; diasDescanso?: number; horasExtras?: number;
    primaVacacional?: number; aguinaldo?: number; subsidio?: number;
    isr?: number; imss?: number; infonavit?: number;
    htd?: number;          // Horas trabajadas en domingo — para PrimaDom exento cap
    totalDesglose?: number; // Fila TOTAL de Desglose — para "Neto original"
  }
  const raw: Record<string, RawData> = {};
  for (const code of Object.keys(colMap)) {
    raw[code] = {};
  }

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const id = (row as unknown[])[0];
    const label = String((row as unknown[])[1] || '');

    // Row 116 (HTD): identificada por etiqueta string, no por ID numérico
    if (id === 'HTD') {
      for (const [code, colIdx] of Object.entries(colMap)) {
        raw[code]!.htd = num((row as unknown[])[colIdx]);
      }
      continue;
    }

    // Fila TOTAL de Desglose
    if (id == null && label === 'TOTAL') {
      for (const [code, colIdx] of Object.entries(colMap)) {
        raw[code]!.totalDesglose = num((row as unknown[])[colIdx]);
      }
      continue;
    }

    if (typeof id !== 'number') continue;

    for (const [code, colIdx] of Object.entries(colMap)) {
      const val = num((row as unknown[])[colIdx]);
      if (val === 0) continue;
      const p = raw[code]!;
      switch (id) {
        case  1: p.salario        = (p.salario        || 0) + val; break;
        case  2: p.comisiones     = (p.comisiones     || 0) + val; break;
        case  3: p.bonoPuntualidad= (p.bonoPuntualidad|| 0) + val; break;
        case  4: p.compMontejo    = (p.compMontejo    || 0) + val; break; // gravado
        case  5: p.compVacaciones = (p.compVacaciones || 0) + val; break; // exento
        case  6: p.compFaltas     = (p.compFaltas     || 0) + val; break; // exento
        case  7: p.compExtra      = (p.compExtra      || 0) + val; break; // exento
        case  8: p.valesDespensa  = (p.valesDespensa  || 0) + val; break; // exento
        case  9: p.compIngresoMin = (p.compIngresoMin || 0) + val; break; // exento
        case 10: p.primaDominical = (p.primaDominical || 0) + val; break; // exento cap SMG*HTD
        case 11: p.diasDescanso   = (p.diasDescanso   || 0) + val; break; // 50/50 con cap, puede ser negativo
        case 12: p.horasExtras    = (p.horasExtras    || 0) + val; break; // 50/50
        case 13: p.primaVacacional= (p.primaVacacional|| 0) + val; break;
        case 14: p.aguinaldo      = (p.aguinaldo      || 0) + val; break;
        case 15: p.subsidio       = (p.subsidio       || 0) + val; break;
        case 21: p.isr            = (p.isr            || 0) + val; break;
        case 22: p.imss           = (p.imss           || 0) + val; break;
        case 23: p.infonavit     = (p.infonavit      || 0) + val; break;
      }
    }
  }

  // Convert to QuincenaData
  const result = new Map<string, QuincenaData>();

  for (const [code, p] of Object.entries(raw)) {
    // CompMontejo is gravado; all other "otros" compensations are exento
    const compMontejoAmt  = p.compMontejo    || 0;
    const compExentoAmt   = (p.compVacaciones || 0) + (p.compFaltas    || 0)
                          + (p.compExtra      || 0) + (p.compIngresoMin || 0);
    const otrosImp        = compMontejoAmt + compExentoAmt;

    const pvImporte  = p.primaVacacional || 0;
    const aguImporte = p.aguinaldo       || 0;
    // PrimaDominical: exento cap = SMG * HTD [Desglose R194: IF(pd > SM*HTD, pd - SM*HTD, 0)]
    const pdImporte  = p.primaDominical  || 0;
    const htd        = p.htd             || 0;
    const pdGravado  = Math.max(0, pdImporte - SMG_2021 * htd);
    // Concept 11 puede ser negativo (descuento por horas inhábiles).
    // Si rawCombined (DiasDescanso + HorasExtras) ≤ 0, ambos se reportan como 0.
    // Solo cuando rawCombined > 0 se clampea desImporte y se aplica el cap [Desglose R195].
    const rawDes     = p.diasDescanso || 0;
    const rawHe      = p.horasExtras  || 0;
    const rawCombined = rawDes + rawHe;

    const pvExento   = Math.min(pvImporte,  PRIMA_VAC_EXENTO);
    const aguExento  = Math.min(aguImporte, AGUINALDO_EXENTO);

    // Cap exento combinado DiasDescanso+HorasExtras [Desglose R195]:
    // IF(combined > 5*SMG*(dias/7)): exento = 5*SMG*(dias/7)*0.5, excess gravado
    // ELSE: exento = combined*0.5
    // Luego se reparte proporcionalmente entre los dos conceptos.
    let desImporte = 0;
    let heImporte  = 0;
    let desGravado = 0;
    let heGravado  = 0;
    if (rawCombined > 0) {
      desImporte = Math.max(0, rawDes);
      heImporte  = rawHe;
      const combined = desImporte + heImporte;
      if (combined > 0) {
        const cap = 5 * SMG_2021 * (diasPeriodo / 7);
        const exentoCombined = combined > cap ? cap * 0.5 : combined * 0.5;
        const desExento = exentoCombined * (desImporte / combined);
        const heExento  = exentoCombined * (heImporte  / combined);
        desGravado = desImporte - desExento;
        heGravado  = heImporte  - heExento;
      }
    }

    // Skip employees with no data at all
    const qd: QuincenaData = {
      salario:         concepto(p.salario         || 0, p.salario         || 0),
      comisiones:      concepto(p.comisiones       || 0, p.comisiones      || 0),
      bonoPuntualidad: concepto(p.bonoPuntualidad  || 0, p.bonoPuntualidad || 0),
      otrosIngresos:   concepto(otrosImp, compMontejoAmt),  // exento = compExentoAmt
      valesDespensa:   concepto(p.valesDespensa    || 0, 0),           // 100% exento
      primaDominical:  concepto(pdImporte, pdGravado),  // exento cap = SMG*HTD [Desglose R194]
      diasDescanso:    concepto(desImporte, desGravado),
      horasExtras:     concepto(heImporte,  heGravado),
      primaVacacional: concepto(pvImporte,  pvImporte  - pvExento),
      aguinaldo:       concepto(aguImporte, aguImporte - aguExento),
      isr:      p.isr      || 0,
      imss:     p.imss     || 0,
      infonavit: p.infonavit || 0,
      subsidio: p.subsidio || 0,
      sh:            0,    // se actualiza en leerTodo desde el Catalogo
      rawHe:         rawHe,
      totalDesglose: p.totalDesglose ?? 0,
    };

    const hasPercepcion = [qd.salario, qd.comisiones, qd.bonoPuntualidad, qd.otrosIngresos,
      qd.valesDespensa, qd.primaDominical, qd.diasDescanso, qd.horasExtras,
      qd.primaVacacional, qd.aguinaldo].some(c => c.importe !== 0);
    if (!hasPercepcion && !qd.isr && !qd.imss && !qd.subsidio) continue;

    result.set(code, qd);
  }

  return result;
}

// ─── Leer Catálogo (datos maestros de colaboradores) ─────────────────────────

/**
 * Lee el sheet "Catalogo" del RegistroNomina.xlsm para obtener nombre, RFC, etc.
 */
function leerCatalogo(ws: XLSX.WorkSheet): Map<string, Omit<ColaboradorInfo, 'codigo'>> {
  if (!ws) return new Map();

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const result = new Map<string, Omit<ColaboradorInfo, 'codigo'>>();

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    // Buscar fila con código en col[0] o col[1] (varía por archivo)
    // Estructura típica: col1=código, col2=nombre, col3=puesto, col4=jornada, col5=salario, col9=forma, col13=rfc
    const codigo = String(row[1] || '').trim();
    if (!codigo || codigo === 'Código' || codigo.length > 6) continue;

    result.set(codigo, {
      nombre:  String(row[2] || '').trim(),
      puesto:  String(row[3] || '').trim(),
      jornada: num(row[4]),
      salario: num(row[5]),
      sbc:     num(row[7]),
      forma:   String(row[9] || '').trim(),
      curp:    String(row[11] || '').trim().replace(/^CURP_/, ''),
      imss:    String(Math.round(num(row[12])) || '').replace(/^0$/, ''),
      rfc:     String(row[13] || '').trim(),
      sd:      num(row[16]),
      sh:      Math.max(num(row[16]) / 8, SMG_2021 / 8),  // max(SD/8, SMG/8)
    });
  }

  return result;
}

// ─── Leer todos los RegistroNomina ────────────────────────────────────────────

/** Devuelve el set de códigos de empleados presentes en el Desglose (fila 2). */
function getDesEmployees(ws: XLSX.WorkSheet | undefined): Set<string> {
  const result = new Set<string>();
  if (!ws) return result;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const hdr = rows[1] as unknown[] | undefined;
  if (!hdr) return result;
  for (let i = 2; i < hdr.length; i++) {
    const code = String(hdr[i] || '').trim();
    if (code && /^[A-Z]{2,6}$/.test(code)) result.add(code);
  }
  return result;
}

export function leerTodo(baseDir?: string): Map<string, ColaboradorData> {
  const colaboradoresMap = new Map<string, ColaboradorData>();

  // Resolve base dir: explicit arg > argv[2] (only if not a flag) > hardcoded default
  const resolvedBase = baseDir
    ?? (process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null)
    ?? '/home/javier/Dropbox/HOSPITAL PETCO (ARCHIVO)/Recursos humanos/Nominas quincenales/2021';
  const consolidadoPath = path.join(resolvedBase, 'Nominas2021_Consolidado.xlsx');

  console.log('Cargando Nominas2021_Consolidado.xlsx...');
  const consolidadoWb = XLSX.readFile(consolidadoPath);
  console.log('OK\n');

  // Seguimiento para detectar empleados que regresan después de una ausencia.
  // everSeen: empleados vistos en alguna quincena anterior.
  // prevDesEmps: empleados presentes en el Desglose de la quincena anterior.
  const everSeen    = new Set<string>();
  let prevDesEmps   = new Set<string>();

  for (let qi = 0; qi < QUINCENAS.length; qi++) {
    const q = QUINCENAS[qi]!;
    const desSheet = consolidadoWb.Sheets[`${q.folder}_Des`] as XLSX.WorkSheet | undefined;
    const catSheet = consolidadoWb.Sheets[`${q.folder}_Cat`] as XLSX.WorkSheet | undefined;

    if (!desSheet) {
      console.warn(`  ${q.label}: sheet _Des no encontrado en consolidado`);
      prevDesEmps = new Set<string>();
      continue;
    }

    // Calcular días del periodo (inicio y fin inclusive)
    const parseDate = (s: string) => { const parts = s.split('/').map(Number); return new Date(parts[2]!, parts[1]! - 1, parts[0]!); };
    const diasPeriodo = Math.round((parseDate(q.fin).getTime() - parseDate(q.inicio).getTime()) / 86400000) + 1;

    const currDesEmps = getDesEmployees(desSheet);
    const cfData      = leerDesglose(desSheet, diasPeriodo);
    const catalog     = leerCatalogo(catSheet as XLSX.WorkSheet);

    let count = 0;
    for (const [codigo, qData] of cfData) {
      // Si el empleado estaba ausente en la quincena anterior PERO ya había
      // aparecido antes, es un regreso: se omite esta primera quincena de retorno.
      if (!prevDesEmps.has(codigo) && everSeen.has(codigo)) continue;

      // Solo incluir Formal y Garantizado
      const cat = catalog.get(codigo);
      const forma = cat?.forma || '';
      if (forma !== 'Formal' && forma !== 'Garantizado') continue;

      // Registrar colaborador si no existe
      if (!colaboradoresMap.has(codigo)) {
        colaboradoresMap.set(codigo, {
          info: {
            codigo,
            nombre:  cat?.nombre  || codigo,
            puesto:  cat?.puesto  || '',
            rfc:     cat?.rfc     || '',
            jornada: cat?.jornada || 0,
            salario: cat?.salario || 0,
            forma:   cat?.forma   || '',
            sh:      cat?.sh      || 0,
            curp:    cat?.curp    || '',
            imss:    cat?.imss    || '',
            sbc:     cat?.sbc     || 0,
            sd:      cat?.sd      || 0,
          },
          quincenas: new Array(QUINCENAS.length).fill(null),
        });
      }

      // Actualizar SH (salario por hora) desde el Catalogo de esta quincena
      if (cat?.sh) qData.sh = cat.sh;

      colaboradoresMap.get(codigo)!.quincenas[qi] = qData;
      count++;
    }

    console.log(`  ${q.label}: ${count} colaboradores`);

    // Actualizar estado para la siguiente quincena
    currDesEmps.forEach(c => everSeen.add(c));
    prevDesEmps = currDesEmps;
  }

  return colaboradoresMap;
}

// ─── Generar hoja Cobertura ───────────────────────────────────────────────────

function crearCoberturaSheet(cols: Map<string, ColaboradorData>): (string | number | null)[][] {
  const sorted = Array.from(cols.entries()).sort(([a], [b]) => a.localeCompare(b));
  const rows: (string | number | null)[][] = [];

  // Header
  rows.push(['Cobertura de Quincenas 2021 — Hospital Veterinario Peninsular']);
  rows.push(['Leyenda: F=Formal  G=Garantizado  E=Estimada (promedio)  X=Excluida (no se timbra)']);
  rows.push(['Código', 'Nombre', 'Tipo', 'Total', 'Estim.', ...QUINCENAS.map(q => q.label)]);

  for (const [, data] of sorted) {
    const { info, quincenas } = data;
    const realMarker = info.forma === 'Garantizado' ? 'G' : 'F';
    // Total = real + estimated (lo que se timbrará); excluidas no cuentan
    const totalReal  = quincenas.filter(q => q !== null && !q.excluded && !q.estimated).length;
    const totalEstim = quincenas.filter(q => q !== null && q.estimated).length;
    rows.push([
      info.codigo,
      info.nombre,
      info.forma,
      totalReal,
      totalEstim || null,
      ...quincenas.map(q => {
        if (!q) return null;
        if (q.excluded)  return 'X';
        if (q.estimated) return 'E';
        return realMarker;
      }),
    ]);
  }

  return rows;
}

// ─── Generar hoja Resumen ─────────────────────────────────────────────────────

function crearResumenSheet(cols: Map<string, ColaboradorData>): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];

  rows.push(['Resumen Nóminas 2021 — Hospital Veterinario Peninsular']);
  rows.push([]);
  rows.push(['RESUMEN POR COLABORADOR']);
  rows.push([null, null, null, null, null, 'PERCEPCIONES', null, null, 'DEDUCCIONES', null, null, 'OTROS PAGOS', '']);
  rows.push(['Código', 'Nombre', 'RFC', 'Puesto', 'A timbrar',
             'Importe', 'Gravado', 'Exento', 'ISR', 'IMSS', 'INFONAVIT', 'Subsidio empleo', 'Neto']);

  const sorted = Array.from(cols.entries()).sort(([a], [b]) => a.localeCompare(b));

  let gImporte = 0, gGravado = 0, gExento = 0, gISR = 0, gIMSS = 0, gInfonavit = 0, gSubsidio = 0, gNeto = 0, gQActivas = 0;

  for (const [, data] of sorted) {
    const { info, quincenas } = data;
    let importe = 0, gravado = 0, exento = 0, isr = 0, imss = 0, infonavit = 0, subsidio = 0, qActivas = 0;

    for (const q of quincenas) {
      if (!q || q.excluded) continue;
      // "A timbrar" = toda quincena no excluida (real o estimada)
      qActivas++;
      const cs = [q.salario, q.comisiones, q.bonoPuntualidad, q.otrosIngresos,
                  q.valesDespensa, q.primaDominical, q.diasDescanso, q.horasExtras,
                  q.primaVacacional, q.aguinaldo];
      for (const c of cs) { importe += c.importe; gravado += c.gravado; exento += c.exento; }
      isr += q.isr; imss += q.imss; infonavit += q.infonavit; subsidio += q.subsidio;
    }

    const neto = importe - isr - imss + subsidio; // INFONAVIT se muestra por separado, no afecta neto
    rows.push([info.codigo, info.nombre, info.rfc, info.puesto, qActivas,
               importe, gravado, exento, isr, imss, infonavit, subsidio, neto]);
    gImporte += importe; gGravado += gravado; gExento += exento;
    gISR += isr; gIMSS += imss; gInfonavit += infonavit; gSubsidio += subsidio; gNeto += neto;
    gQActivas += qActivas;
  }

  // TOTAL row: c3="TOTAL", c4=total Q.Activas (igual que original)
  rows.push([null, null, null, 'TOTAL', gQActivas,
             gImporte, gGravado, gExento, gISR, gIMSS, gInfonavit, gSubsidio, gNeto]);

  rows.push([]);
  rows.push([]);

  // RESUMEN POR QUINCENA
  rows.push(['RESUMEN POR QUINCENA']);
  rows.push([null, null, null, null, null, null, 'PERCEPCIONES', null, null, 'DEDUCCIONES', null, null, 'OTROS PAGOS', '']);
  rows.push(['#', 'Quincena', 'Fecha Inicio', 'Fecha Fin', 'Fecha Pago', 'A timbrar',
             'Importe', 'Gravado', 'Exento', 'ISR', 'IMSS', 'INFONAVIT', 'Subsidio empleo', 'Neto']);

  let tqImporte = 0, tqGravado = 0, tqExento = 0, tqISR = 0, tqIMSS = 0, tqInfonavit = 0, tqSubsidio = 0, tqNeto = 0;

  for (let qi = 0; qi < QUINCENAS.length; qi++) {
    const q = QUINCENAS[qi]!;
    let empleados = 0, imp = 0, grav = 0, exen = 0, qisr = 0, qimss = 0, qinav = 0, qsub = 0;
    for (const [, data] of cols) {
      const qd = data.quincenas[qi];
      if (!qd || qd.excluded) continue;
      // "A timbrar" = toda quincena no excluida (real o estimada)
      empleados++;
      const cs = [qd.salario, qd.comisiones, qd.bonoPuntualidad, qd.otrosIngresos,
                  qd.valesDespensa, qd.primaDominical, qd.diasDescanso, qd.horasExtras,
                  qd.primaVacacional, qd.aguinaldo];
      for (const c of cs) { imp += c.importe; grav += c.gravado; exen += c.exento; }
      qisr += qd.isr; qimss += qd.imss; qinav += qd.infonavit; qsub += qd.subsidio;
    }
    const qneto = imp - qisr - qimss + qsub; // INFONAVIT no afecta neto
    rows.push([qi + 1, q.label, q.inicio, q.fin, q.pago, empleados,
               imp, grav, exen, qisr, qimss, qinav, qsub, qneto]);
    tqImporte += imp; tqGravado += grav; tqExento += exen;
    tqISR += qisr; tqIMSS += qimss; tqInfonavit += qinav; tqSubsidio += qsub; tqNeto += qneto;
  }

  rows.push([null, null, null, null, 'TOTAL',
             null, tqImporte, tqGravado, tqExento, tqISR, tqIMSS, tqInfonavit, tqSubsidio, tqNeto]);

  return rows;
}

// ─── Generar hoja por colaborador ────────────────────────────────────────────

function crearPersonaSheet(data: ColaboradorData): (string | number | null)[][] {
  const { info, quincenas } = data;
  const rows: (string | number | null)[][] = [];

  rows.push([info.nombre]);
  rows.push([`Código: ${info.codigo}  |  Puesto: ${info.puesto}  |  RFC: ${info.rfc}`]);
  rows.push([`Salario: $${info.salario.toFixed(2)}  |  Forma: ${info.forma}  |  Jornada: ${info.jornada}h`]);
  rows.push([]);

  // Encabezados de quincenas (4 cols por quincena: Importe, Gravado, Exento, sep)
  const hLabel:   (string | null)[] = ['Concepto', 'SAT'];
  const hPeriodo: (string | null)[] = ['', ''];
  const hPago:    (string | null)[] = ['', ''];
  const hCols:    (string | null)[] = ['', ''];

  for (const q of QUINCENAS) {
    hLabel.push(q.label, null, null, '');
    hPeriodo.push(`${q.inicio} - ${q.fin}`, null, null, '');
    hPago.push(`Pago: ${q.pago}`, null, null, '');
    hCols.push('Importe', 'Gravado', 'Exento', '');
  }
  rows.push(hLabel, hPeriodo, hPago, hCols);

  function cRow(nombre: string, sat: string, get: (q: QuincenaData) => Concepto): (string | number | null)[] {
    const row: (string | number | null)[] = [nombre, sat];
    for (let i = 0; i < QUINCENAS.length; i++) {
      const q = quincenas[i];
      const c = q ? get(q) : { importe: 0, gravado: 0, exento: 0 };
      row.push(c.importe, c.gravado, c.exento, '');
    }
    return row;
  }

  function dRow(nombre: string, sat: string, get: (q: QuincenaData) => number): (string | number | null)[] {
    const row: (string | number | null)[] = [nombre, sat];
    for (let i = 0; i < QUINCENAS.length; i++) {
      const q = quincenas[i];
      row.push(q ? get(q) : 0, '', '', '');
    }
    return row;
  }

  // PERCEPCIONES
  rows.push(['PERCEPCIONES']);
  rows.push(cRow('Sueldos y salarios',         '001', q => q.salario));
  rows.push(cRow('Comisiones',                 '028', q => q.comisiones));
  rows.push(cRow('Premios por puntualidad',    '010', q => q.bonoPuntualidad));
  rows.push(cRow('Otros ingresos por salarios','038', q => q.otrosIngresos));
  rows.push(cRow('Vales de despensa',          '029', q => q.valesDespensa));
  rows.push(cRow('Prima dominical',            '020', q => q.primaDominical));
  rows.push(cRow('Días de descanso laborados', '055', q => q.diasDescanso));
  rows.push(cRow('Horas extras',               '019', q => q.horasExtras));
  rows.push(cRow('Prima vacacional',           '021', q => q.primaVacacional));
  rows.push(cRow('Aguinaldo',                  '002', q => q.aguinaldo));

  // Subtotal percepciones
  const stPerc: (string | number | null)[] = ['SUBTOTAL PERCEPCIONES', ''];
  for (let i = 0; i < QUINCENAS.length; i++) {
    const q = quincenas[i];
    let totImp = 0, totGrav = 0, totExen = 0;
    if (q) for (const c of [q.salario, q.comisiones, q.bonoPuntualidad, q.otrosIngresos,
                             q.valesDespensa, q.primaDominical, q.diasDescanso, q.horasExtras,
                             q.primaVacacional, q.aguinaldo]) {
      totImp  += c.importe;
      totGrav += c.gravado;
      totExen += c.exento;
    }
    stPerc.push(totImp, totGrav, totExen, '');
  }
  rows.push(stPerc);
  rows.push([]);

  // DEDUCCIONES
  rows.push(['DEDUCCIONES']);
  rows.push(dRow('ISR (Retención)',     '002', q => q.isr));
  rows.push(dRow('Cuotas IMSS',         '001', q => q.imss));
  rows.push(dRow('Retención INFONAVIT', '010', q => q.infonavit));

  const stDed: (string | number | null)[] = ['SUBTOTAL DEDUCCIONES', ''];
  for (let i = 0; i < QUINCENAS.length; i++) {
    const q = quincenas[i];
    stDed.push(q ? q.isr + q.imss : 0, null, null, ''); // INFONAVIT va aparte, no en subtotal
  }
  rows.push(stDed);
  rows.push([]);

  // OTROS PAGOS
  rows.push(['OTROS PAGOS']);
  rows.push(dRow('Subsidio al empleo', '002', q => q.subsidio));
  rows.push([]);

  // NETO
  const netoValues: number[] = [];
  const netoRow: (string | number | null)[] = ['NETO A PAGAR', ''];
  for (let i = 0; i < QUINCENAS.length; i++) {
    const q = quincenas[i];
    let neto = 0;
    if (q) {
      for (const c of [q.salario, q.comisiones, q.bonoPuntualidad, q.otrosIngresos,
                       q.valesDespensa, q.primaDominical, q.diasDescanso, q.horasExtras,
                       q.primaVacacional, q.aguinaldo]) neto += c.importe;
      neto = neto - q.isr - q.imss + q.subsidio; // INFONAVIT se muestra por separado, no afecta neto
    }
    netoValues.push(neto);
    netoRow.push(neto, null, null, '');
  }
  rows.push(netoRow);
  rows.push([]);

  // DETALLE HORAS EXTRAS
  rows.push(['DETALLE HORAS EXTRAS']);
  const tarifaRow: (string | number)[] = ['Tarifa por hora', ''];
  const horasRow:  (string | number)[] = ['Horas extras trabajadas', ''];
  const diasRow:   (string | number)[] = ['Días con hora extra', ''];
  for (let i = 0; i < QUINCENAS.length; i++) {
    const q = quincenas[i];
    const sh    = q?.sh    ?? 0;
    const rawHe = q?.rawHe ?? 0;
    tarifaRow.push(rawHe > 0 && sh > 0 ? sh : '', '', '', '');
    horasRow.push(rawHe > 0 && sh > 0 ? Math.round(rawHe / (2 * sh) * 100) / 100 : '', '', '', '');
    const horasExact = rawHe > 0 && sh > 0 ? rawHe / (2 * sh) : 0;
    const horasRound = Math.round(horasExact * 100) / 100; // 2dp para evitar ceil flotante
    diasRow.push(horasRound > 0 ? Math.ceil(horasRound / 2) : '', '', '', '');
  }
  rows.push(tarifaRow);
  rows.push(horasRow);
  rows.push(diasRow);
  rows.push([]);

  // VALIDACIÓN
  rows.push(['VALIDACIÓN']);
  const netoOrigRow: (string | number)[] = ['Neto original', ''];
  const netoCalcRow: (string | number)[] = ['Neto calculado', ''];
  const difRow:      (string | number)[] = ['Diferencia', ''];
  for (let i = 0; i < QUINCENAS.length; i++) {
    const q    = quincenas[i];
    const neto = netoValues[i] ?? 0;
    const netoOrig = q ? q.totalDesglose : 0;
    netoOrigRow.push(netoOrig, '', '', '');
    netoCalcRow.push(neto,     '', '', '');
    difRow.push(neto - netoOrig, '', '', '');
  }
  rows.push(netoOrigRow);
  rows.push(netoCalcRow);
  rows.push(difRow);

  return rows;
}

// ─── Reglas de negocio: exclusiones y estimaciones ────────────────────────────

/** Normaliza nombre para comparación (mayúsculas, sin acentos). */
function normalizeForSearch(s: string): string {
  return s.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ñÑ]/g, 'N')
    .toUpperCase();
}

/** Busca colaborador cuyo nombre contenga TODOS los términos. */
function findByName(cols: Map<string, ColaboradorData>, ...terms: string[]): ColaboradorData | undefined {
  const normalizedTerms = terms.map(normalizeForSearch);
  for (const data of Array.from(cols.values())) {
    const n = normalizeForSearch(data.info.nombre);
    if (normalizedTerms.every(t => n.includes(t))) return data;
  }
  return undefined;
}

/** Días reales de una quincena: Q1=15, Q2=endD-14. */
function diasQuincena(qi: number): number {
  const q = QUINCENAS[qi]!;
  const [endD] = q.fin.split('/').map(Number);
  return qi % 2 === 0 ? 15 : (endD! - 14);
}

// ─── Tabla ISR quincenal 2021 (Art. 96 LISR) ────────────────────────────────

const ISR_TABLE_2021_Q = [
  { limInf:      0.01, limSup:    308.44, cuota:    0.00, pct: 0.0192 },
  { limInf:    308.45, limSup:  2617.24, cuota:    5.92, pct: 0.0640 },
  { limInf:   2617.25, limSup:  4600.40, cuota:  147.74, pct: 0.1088 },
  { limInf:   4600.41, limSup:  5348.48, cuota:  363.48, pct: 0.1600 },
  { limInf:   5348.49, limSup:  6405.66, cuota:  483.12, pct: 0.1792 },
  { limInf:   6405.67, limSup: 12917.40, cuota:  672.62, pct: 0.2136 },
  { limInf:  12917.41, limSup: 20370.48, cuota: 2063.94, pct: 0.2352 },
  { limInf:  20370.49, limSup: 38862.84, cuota: 3817.26, pct: 0.3000 },
  { limInf:  38862.85, limSup: 51817.08, cuota: 9364.98, pct: 0.3200 },
  { limInf:  51817.09, limSup:155451.18, cuota:13510.32, pct: 0.3400 },
  { limInf: 155451.19, limSup: Infinity, cuota:48745.92, pct: 0.3500 },
];

const SUBSIDIO_TABLE_2021_Q = [
  { hasta:   872.86, subsidio: 200.85 },
  { hasta:  1309.20, subsidio: 200.70 },
  { hasta:  1713.60, subsidio: 200.70 },
  { hasta:  1745.70, subsidio: 193.80 },
  { hasta:  2193.75, subsidio: 188.70 },
  { hasta:  2327.55, subsidio: 174.75 },
  { hasta:  2632.65, subsidio: 160.35 },
  { hasta:  3071.40, subsidio: 145.35 },
  { hasta:  3510.15, subsidio: 125.10 },
  { hasta:  3642.60, subsidio: 107.40 },
  { hasta:  Infinity, subsidio:   0.00 },
];

function calcIsrQuincenal(gravado: number): { isr: number; subsidio: number } {
  // ISR bruto
  const bracket = ISR_TABLE_2021_Q.find(b => gravado >= b.limInf && gravado <= b.limSup);
  const isrBruto = bracket
    ? Math.round((bracket.cuota + (gravado - bracket.limInf) * bracket.pct) * 100) / 100
    : 0;

  // Subsidio al empleo
  const sub = SUBSIDIO_TABLE_2021_Q.find(s => gravado <= s.hasta);
  const subsidio = sub ? sub.subsidio : 0;

  // ISR a retener = max(isrBruto - subsidio, 0)
  const isrNeto = Math.max(Math.round((isrBruto - subsidio) * 100) / 100, 0);
  // Subsidio a entregar = max(subsidio - isrBruto, 0)
  const subsidioNeto = Math.max(Math.round((subsidio - isrBruto) * 100) / 100, 0);

  return { isr: isrNeto, subsidio: subsidioNeto };
}

/** Crea una QuincenaData estimada con salario, ISR calculado y IMSS de la última quincena real. */
function makeEstimatedQd(tarifaDiaria: number, qi: number, lastImss: number): QuincenaData {
  const amt  = Math.round(tarifaDiaria * diasQuincena(qi) * 100) / 100;
  const { isr, subsidio } = calcIsrQuincenal(amt);
  const zero = { importe: 0, gravado: 0, exento: 0 };
  return {
    salario: { importe: amt, gravado: amt, exento: 0 },
    comisiones: zero, bonoPuntualidad: zero, otrosIngresos: zero,
    valesDespensa: zero, primaDominical: zero, diasDescanso: zero,
    horasExtras: zero, primaVacacional: zero, aguinaldo: zero,
    isr, imss: lastImss, infonavit: 0, subsidio,
    sh: 0, rawHe: 0, totalDesglose: 0,
    estimated: true,
  };
}

/** IMSS de la última quincena real (no excluida, no estimada). */
function getLastRealImss(quincenas: (QuincenaData | null)[]): number {
  for (let qi = QUINCENAS.length - 1; qi >= 0; qi--) {
    const qd = quincenas[qi];
    if (qd && !qd.excluded && !qd.estimated && qd.imss > 0) return qd.imss;
  }
  return 0;
}

// Quincenas de Marzo y Abril (índices 4-7)
const MAR_ABR_QI = [4, 5, 6, 7];

/**
 * Aplica reglas de exclusión y estimación sobre los datos cargados.
 *
 * Exclusiones:
 *  - LETICIA ANAHI: todas sus quincenas (no timbrar, no contar)
 *  - ANDRES NAH: quincenas de Marzo y Abril
 *
 * Estimaciones (salario = promedio 3 meses previos, solo concepto 001):
 *  - FELIPE DAVALOS: quincenas que están a null
 *  - ATZIRI CAMAL: desde la última quincena real hasta fin de año
 *  - ANDRES NAH: desde su última quincena real (después de las excluidas) hasta fin de año
 */
export function applyRules(cols: Map<string, ColaboradorData>): void {
  console.log('\nAplicando reglas de exclusión y estimación...');

  // ── 1. LETICIA ANAHI: excluir todas las quincenas ────────────────────────
  const leticia = findByName(cols, 'LETICIA', 'ANAHI');
  if (leticia) {
    let cnt = 0;
    for (let qi = 0; qi < QUINCENAS.length; qi++) {
      if (leticia.quincenas[qi]) { leticia.quincenas[qi]!.excluded = true; cnt++; }
    }
    console.log(`  Excluida: ${leticia.info.nombre} (${cnt} quincenas)`);
  } else {
    console.warn('  AVISO: No encontrado LETICIA ANAHI');
  }

  // ── 2. ANA CECILIA: solo Enero Q1, todo lo demás excluido ────────────────
  const anaCecilia = findByName(cols, 'ANA', 'CECILIA');
  if (anaCecilia) {
    let cnt = 0;
    for (let qi = 1; qi < QUINCENAS.length; qi++) {
      if (anaCecilia.quincenas[qi]) { anaCecilia.quincenas[qi]!.excluded = true; cnt++; }
    }
    console.log(`  ANA CECILIA: Ene Q1 conservada, ${cnt} quincenas excluidas`);
  } else {
    console.warn('  AVISO: No encontrado ANA CECILIA');
  }

  // ── 3. ANDRES NAH: excluir Marzo/Abril + llenar estimados ────────────────
  const andres = findByName(cols, 'ANDRES', 'NAH');
  if (andres) {
    // Excluir Marzo y Abril
    let excl = 0;
    for (const qi of MAR_ABR_QI) {
      if (andres.quincenas[qi]) { andres.quincenas[qi]!.excluded = true; excl++; }
    }
    // Última quincena real (no excluida, no estimada)
    let lastReal = -1;
    for (let qi = 0; qi < QUINCENAS.length; qi++) {
      const qd = andres.quincenas[qi];
      if (qd && !qd.excluded && !qd.estimated) lastReal = qi;
    }
    // Llenar desde (lastReal+1) hasta fin de año, saltando excluidas y Mar/Abr
    const TARIFA_ANDRES = 258.74;
    const imssAndres = getLastRealImss(andres.quincenas);
    let est = 0;
    for (let qi = lastReal + 1; qi < QUINCENAS.length; qi++) {
      if (andres.quincenas[qi]?.excluded) continue;
      if (MAR_ABR_QI.includes(qi)) continue; // Mar/Abr excluidas aunque no tengan dato
      if (!andres.quincenas[qi]) {
        andres.quincenas[qi] = makeEstimatedQd(TARIFA_ANDRES, qi, imssAndres);
        est++;
      }
    }
    console.log(`  ANDRES NAH: ${excl} excluidas (Mar/Abr), ${est} estimadas desde qi=${lastReal + 1} @ $${TARIFA_ANDRES}/día`);
  } else {
    console.warn('  AVISO: No encontrado ANDRES NAH');
  }

  // ── 3. FELIPE DAVALOS: llenar quincenas nulas ────────────────────────────
  const TARIFA_FELIPE = 164.18;
  const felipe = findByName(cols, 'FELIPE', 'DAVALOS');
  if (felipe) {
    const imssFelipe = getLastRealImss(felipe.quincenas);
    let est = 0;
    for (let qi = 0; qi < QUINCENAS.length; qi++) {
      if (!felipe.quincenas[qi]) {
        felipe.quincenas[qi] = makeEstimatedQd(TARIFA_FELIPE, qi, imssFelipe);
        est++;
      }
    }
    console.log(`  FELIPE DAVALOS: ${est} quincenas estimadas @ $${TARIFA_FELIPE}/día`);
  } else {
    console.warn('  AVISO: No encontrado FELIPE DAVALOS');
  }

  // ── 4. ATZIRI CAMAL: llenar desde última quincena real hasta fin de año ──
  const TARIFA_ATZIRI = 148.10;
  const atziri = findByName(cols, 'ATZIRI', 'CAAMAL');
  if (atziri) {
    let lastReal = -1;
    for (let qi = 0; qi < QUINCENAS.length; qi++) {
      const qd = atziri.quincenas[qi];
      if (qd && !qd.estimated && !qd.excluded) lastReal = qi;
    }
    const imssAtziri = getLastRealImss(atziri.quincenas);
    let est = 0;
    for (let qi = lastReal + 1; qi < QUINCENAS.length; qi++) {
      if (!atziri.quincenas[qi]) {
        atziri.quincenas[qi] = makeEstimatedQd(TARIFA_ATZIRI, qi, imssAtziri);
        est++;
      }
    }
    console.log(`  ATZIRI CAMAL: ${est} quincenas estimadas desde qi=${lastReal + 1} @ $${TARIFA_ATZIRI}/día`);
  } else {
    console.warn('  AVISO: No encontrado ATZIRI CAMAL');
  }
}

// ─── ExcelJS Formatting ────────────────────────────────────────────────────────

import * as ExcelJS from 'exceljs';

const NQ   = QUINCENAS.length;                 // 24
const LCOL = 2 + 4 * NQ;                       // last col persona sheet = 98

// Colores (ARGB)
const FG = {
  darkNavy:       'FF1F4E79',
  medBlue:        'FF2E75B6',
  midDarkBlue:    'FF2E5E8E',
  lightBlueGray:  'FFD9E2F3',
  lighterBlue:    'FFD6E4F0',
  lightOrange:    'FFFCE4D6',
  lightLavender:  'FFE8D5F5',
  veryLightLav:   'FFF3EBF9',
  lightGreen:     'FFC6EFCE',
  lightGreenGray: 'FFE2EFDA',
  white:          'FFFFFFFF',
  darkGray:       'FF333333',
  brown:          'FF8B4513',
  purple:         'FF6A0DAD',
  darkGreen:      'FF1F6F30',
  // Exclusiones y estimaciones
  lightRed:       'FFFFC7CE',  // X = excluida
  darkRed:        'FF9C0006',
  lightAmber:     'FFFFEB9C',  // E = estimada
  darkAmber:      'FF9C5700',
} as const;

function sfill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } } as ExcelJS.Fill;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THIN4 = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} } as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sc(cell: ExcelJS.Cell, o: Record<string, any>) {
  if (o.bold !== undefined || o.size || o.fc) {
    cell.font = { bold: o.bold ?? false, size: o.size ?? 11,
      ...(o.fc ? { color: { argb: o.fc } } : {}) };
  }
  if (o.bg)  cell.fill = sfill(o.bg);
  if (o.b)   cell.border = THIN4;
  if (o.ha)  cell.alignment = { horizontal: o.ha, vertical: 'middle' };
  if (o.fmt) cell.numFmt = o.fmt;
}

// Aplica estilos a todos los cols de contenido de una fila (A, B, data cols por quincena)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function styleRow(ws: ExcelJS.Worksheet, rn: number, opts: Record<string, any>) {
  const row = ws.getRow(rn);
  const labelBg = opts.labelBg ?? opts.bg;
  const dataBg  = opts.dataBg  ?? opts.bg;
  sc(row.getCell(1), { bold: opts.bold, size: opts.size, fc: opts.fc, bg: labelBg, b: true, fmt: opts.fmt });
  sc(row.getCell(2), { bold: opts.bold, size: opts.size, fc: opts.fc, bg: labelBg, b: true, fmt: opts.fmt });
  for (let q = 1; q <= NQ; q++) {
    const ds = 3 + 4 * (q - 1);
    for (let c = ds; c <= ds + 2; c++) {
      sc(row.getCell(c), { bold: opts.bold, size: opts.size, fc: opts.fc,
        bg: dataBg, b: true, fmt: opts.fmt ?? '$#,##0.00' });
    }
  }
}

// Separator col (dark navy) para filas de datos
function sepCols(ws: ExcelJS.Worksheet, fromRow: number, toRow: number) {
  for (let q = 1; q <= NQ; q++) {
    const sepCol = 2 + 4 * q; // sep Q1=6, Q2=10, ..., Q24=98
    for (let r = fromRow; r <= toRow; r++) {
      const cell = ws.getRow(r).getCell(sepCol);
      cell.fill = sfill(FG.darkNavy);
      cell.border = THIN4;
    }
  }
}

function applyPersonaFormat(ws: ExcelJS.Worksheet): void {
  // ── Anchos de columnas ────────────────────────────────────────────────────
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 8;
  for (let q = 1; q <= NQ; q++) {
    const ds = 3 + 4 * (q - 1);
    ws.getColumn(ds).width     = 14;
    ws.getColumn(ds + 1).width = 14;
    ws.getColumn(ds + 2).width = 14;
    ws.getColumn(ds + 3).width = 1.5; // separator
  }

  // ── Freeze ────────────────────────────────────────────────────────────────
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 8, topLeftCell: 'C9' }];

  // ── Filas 1-3: info empleado (merged full width) ──────────────────────────
  ws.mergeCells(1, 1, 1, LCOL);
  ws.mergeCells(2, 1, 2, LCOL);
  ws.mergeCells(3, 1, 3, LCOL);
  sc(ws.getRow(1).getCell(1), { bold: true, size: 14, fc: FG.darkNavy });
  sc(ws.getRow(2).getCell(1), { size: 10,  fc: FG.darkGray });
  sc(ws.getRow(3).getCell(1), { size: 10,  fc: FG.darkGray });

  // ── Fila 5-7: encabezados de quincenas ────────────────────────────────────
  // A5 "Concepto", B5 "SAT"
  sc(ws.getRow(5).getCell(1), { bold: true, size: 11, fc: FG.white, bg: FG.darkNavy, b: true, ha: 'center' });
  sc(ws.getRow(5).getCell(2), { bold: true, size: 11, fc: FG.white, bg: FG.darkNavy, b: true });
  sc(ws.getRow(6).getCell(1), { bg: FG.darkNavy, b: true });
  sc(ws.getRow(6).getCell(2), { bg: FG.darkNavy, b: true });
  sc(ws.getRow(7).getCell(1), { bg: FG.darkNavy, b: true });
  sc(ws.getRow(7).getCell(2), { bg: FG.darkNavy, b: true });

  for (let q = 1; q <= NQ; q++) {
    const ds = 3 + 4 * (q - 1);
    ws.mergeCells(5, ds, 5, ds + 2);
    ws.mergeCells(6, ds, 6, ds + 2);
    ws.mergeCells(7, ds, 7, ds + 2);
    sc(ws.getRow(5).getCell(ds), { bold: true, size: 11, fc: FG.white, bg: FG.darkNavy, b: true, ha: 'center' });
    sc(ws.getRow(6).getCell(ds), { size: 9,   fc: FG.white, bg: FG.midDarkBlue, b: true, ha: 'center' });
    sc(ws.getRow(7).getCell(ds), { size: 9,   fc: FG.white, bg: FG.midDarkBlue, b: true, ha: 'center' });
  }

  // ── Fila 8: Importe/Gravado/Exento ───────────────────────────────────────
  sc(ws.getRow(8).getCell(1), { bold: true, size: 10, bg: FG.lighterBlue, b: true, ha: 'center' });
  sc(ws.getRow(8).getCell(2), { bold: true, size: 10, bg: FG.lighterBlue, b: true });
  for (let q = 1; q <= NQ; q++) {
    const ds = 3 + 4 * (q - 1);
    for (let c = ds; c <= ds + 2; c++)
      sc(ws.getRow(8).getCell(c), { bold: true, size: 10, bg: FG.lighterBlue, b: true, ha: 'center' });
  }

  // ── Filas de datos ────────────────────────────────────────────────────────
  // R9: PERCEPCIONES header
  styleRow(ws,  9, { bold: true, size: 10, bg: FG.lightBlueGray });
  // R10-19: conceptos de percepciones
  for (let r = 10; r <= 19; r++) styleRow(ws, r, { size: 10 });
  // R20: SUBTOTAL PERCEPCIONES
  styleRow(ws, 20, { bold: true, bg: FG.lightGreenGray });
  // R22: DEDUCCIONES header
  styleRow(ws, 22, { bold: true, size: 10, bg: FG.lightOrange });
  // R23-25: deducciones
  for (let r = 23; r <= 25; r++) styleRow(ws, r, { size: 10 });
  // R26: SUBTOTAL DEDUCCIONES
  styleRow(ws, 26, { bold: true, bg: FG.lightOrange });
  // R28: OTROS PAGOS header
  styleRow(ws, 28, { bold: true, size: 10, bg: FG.lightLavender });
  // R29: Subsidio
  styleRow(ws, 29, { size: 10, dataBg: FG.veryLightLav });
  // R31: NETO A PAGAR
  styleRow(ws, 31, { bold: true, size: 12, bg: FG.lightGreen });
  // R33: DETALLE HORAS EXTRAS header
  styleRow(ws, 33, { bold: true, size: 10, bg: FG.lightLavender });
  // R34-36: detalle horas extras
  for (let r = 34; r <= 36; r++) styleRow(ws, r, { size: 11, bg: FG.veryLightLav });
  // R38: VALIDACIÓN header (azul medio, texto blanco)
  styleRow(ws, 38, { bold: true, size: 10, fc: FG.white, bg: FG.medBlue });
  // R39-41: validación
  for (let r = 39; r <= 41; r++) styleRow(ws, r, { size: 10, dataBg: FG.lightGreen });

  // ── Separator cols (dark navy) en filas de datos ──────────────────────────
  sepCols(ws, 5, 41);
}

// ─── Formato Resumen ──────────────────────────────────────────────────────────

function applyResumenFormat(ws: ExcelJS.Worksheet, numEmpleados: number): void {
  const RES_COLS = 14; // A-N

  // Anchos
  [8, 28, 16, 22, 12, 16, 16, 16, 14, 14, 14, 16, 16, 2].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // Freeze top 5 rows
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 5, topLeftCell: 'A6' }];

  // R1: título (merged, navy bold)
  ws.mergeCells(1, 1, 1, RES_COLS);
  sc(ws.getRow(1).getCell(1), { bold: true, size: 16, fc: FG.darkNavy });

  // R3: RESUMEN POR COLABORADOR (merged, white on medBlue)
  ws.mergeCells(3, 1, 3, RES_COLS);
  sc(ws.getRow(3).getCell(1), { bold: true, size: 13, fc: FG.white, bg: FG.medBlue, b: true });

  // R4: group sub-headers
  ws.mergeCells(4, 1, 4, 5);  // A-E: dark navy
  ws.mergeCells(4, 6, 4, 8);  // F-H: PERCEPCIONES
  ws.mergeCells(4, 9, 4, 11); // I-K: DEDUCCIONES
  // L4, M4 single
  const r4 = ws.getRow(4);
  sc(r4.getCell(1),  { bold: true, size: 10, fc: FG.white,   bg: FG.darkNavy,      b: true, ha: 'center' });
  sc(r4.getCell(6),  { bold: true, size: 10, fc: FG.darkNavy, bg: FG.lightBlueGray, b: true, ha: 'center' });
  sc(r4.getCell(9),  { bold: true, size: 10, fc: FG.brown,    bg: FG.lightOrange,   b: true, ha: 'center' });
  sc(r4.getCell(12), { bold: true, size: 10, fc: FG.purple,   bg: FG.lightLavender, b: true, ha: 'center' });
  sc(r4.getCell(13), { bold: true, size: 10, fc: FG.darkGreen, bg: FG.lightGreen,   b: true, ha: 'center' });

  // R5: column headers (all white on darkNavy)
  const r5 = ws.getRow(5);
  for (let c = 1; c <= 13; c++) {
    sc(r5.getCell(c), { bold: true, size: 10, fc: FG.white, bg: FG.darkNavy, b: true,
      ha: c <= 4 ? 'left' : 'center' });
  }

  // R6..numEmpleados+5: data rows
  const MFMT = '$#,##0.00';
  for (let r = 6; r <= 5 + numEmpleados; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 13; c++) {
      sc(row.getCell(c), { size: 10, b: true, fmt: c >= 6 ? MFMT : undefined,
        ha: c === 5 ? 'center' : undefined });
    }
  }

  // TOTAL row (just after last employee)
  const totRow = 6 + numEmpleados;
  const rowT = ws.getRow(totRow);
  for (let c = 1; c <= 13; c++) {
    sc(rowT.getCell(c), { bold: true, size: 11, bg: FG.lightBlueGray, b: true,
      fmt: c >= 6 ? MFMT : undefined, ha: c === 5 ? 'center' : undefined });
  }

  // R(totRow+3): RESUMEN POR QUINCENA section header (merged, white on medBlue)
  const secRow = totRow + 3;
  ws.mergeCells(secRow, 1, secRow, RES_COLS);
  sc(ws.getRow(secRow).getCell(1), { bold: true, size: 13, fc: FG.white, bg: FG.medBlue, b: true });

  // Group sub-headers for quincena section
  const grpRow = secRow + 1;
  ws.mergeCells(grpRow, 1, grpRow, 6);   // A-F: dark navy
  ws.mergeCells(grpRow, 7, grpRow, 9);   // G-I: PERCEPCIONES
  ws.mergeCells(grpRow, 10, grpRow, 12); // J-L: DEDUCCIONES
  const rGrp = ws.getRow(grpRow);
  sc(rGrp.getCell(1),  { bold: true, size: 10, fc: FG.white,   bg: FG.darkNavy,      b: true, ha: 'center' });
  sc(rGrp.getCell(7),  { bold: true, size: 10, fc: FG.darkNavy, bg: FG.lightBlueGray, b: true, ha: 'center' });
  sc(rGrp.getCell(10), { bold: true, size: 10, fc: FG.brown,    bg: FG.lightOrange,   b: true, ha: 'center' });
  sc(rGrp.getCell(13), { bold: true, size: 10, fc: FG.purple,   bg: FG.lightLavender, b: true, ha: 'center' });
  sc(rGrp.getCell(14), { bold: true, size: 10, fc: FG.darkGreen, bg: FG.lightGreen,   b: true, ha: 'center' });

  // Column headers for quincena section
  const hdrRow = grpRow + 1;
  const rHdr = ws.getRow(hdrRow);
  for (let c = 1; c <= 14; c++) {
    sc(rHdr.getCell(c), { bold: true, size: 10, fc: FG.white, bg: FG.darkNavy, b: true,
      ha: c <= 5 ? 'left' : 'center' });
  }

  // 24 quincena data rows
  for (let r = hdrRow + 1; r <= hdrRow + NQ; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 14; c++) {
      sc(row.getCell(c), { size: 10, b: true,
        ha: c === 1 || c === 6 ? 'center' : undefined,
        fmt: c >= 7 ? MFMT : undefined });
    }
  }

  // TOTAL row for quincenas
  const totQRow = hdrRow + NQ + 1;
  const rTotQ = ws.getRow(totQRow);
  for (let c = 1; c <= 14; c++) {
    sc(rTotQ.getCell(c), { bold: true, size: 11, bg: FG.lightBlueGray, b: true,
      fmt: c >= 7 ? MFMT : undefined });
  }
}

/**
 * Colorea las columnas de quincenas estimadas/excluidas en la hoja persona.
 * Se llama DESPUÉS de applyPersonaFormat para sobrescribir los colores de cabecera.
 */
function applyQuincenaMarkers(ws: ExcelJS.Worksheet, quincenas: (QuincenaData | null)[]): void {
  for (let qi = 0; qi < QUINCENAS.length; qi++) {
    const qd = quincenas[qi];
    if (!qd || (!qd.estimated && !qd.excluded)) continue;

    const bg    = qd.excluded ? FG.lightRed   : FG.lightAmber;
    const fc    = qd.excluded ? FG.darkRed    : FG.darkAmber;
    const label = qd.excluded ? '[X EXCL]'   : '[E EST]';

    const colStart = 3 + 4 * qi; // Importe col of this quincena

    // Color the label header cell in row 5 (quincena label row)
    const hCell = ws.getRow(5).getCell(colStart);
    hCell.fill = sfill(bg);
    hCell.font = { bold: true, size: 9, color: { argb: fc } };
    hCell.value = `${QUINCENAS[qi]!.label} ${label}`;

    // Color rows 6-8 (periodo, pago, cols header) for this quincena's columns
    for (let row = 6; row <= 8; row++) {
      for (let dc = 0; dc <= 2; dc++) {
        ws.getRow(row).getCell(colStart + dc).fill = sfill(bg);
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(BASE_DIR)) {
    console.error(`Carpeta no encontrada: ${BASE_DIR}`);
    process.exit(1);
  }

  console.log(`Leyendo RegistroNomina.xlsm desde: ${BASE_DIR}\n`);
  const colaboradores = leerTodo();
  console.log(`\nColaboradores encontrados: ${colaboradores.size}`);
  applyRules(colaboradores);

  const wb = new ExcelJS.Workbook();
  const sorted = Array.from(colaboradores.entries()).sort(([a], [b]) => a.localeCompare(b));

  // ── Hoja Cobertura ────────────────────────────────────────────────────────
  const wsCobertura = wb.addWorksheet('Cobertura');
  for (const row of crearCoberturaSheet(colaboradores)) wsCobertura.addRow(row.length ? row : []);

  // Formato cobertura
  // Row 1 = título, Row 2 = leyenda, Row 3 = encabezados, Row 4+ = datos
  wsCobertura.getRow(1).getCell(1).font = { bold: true, size: 13 };
  wsCobertura.getRow(2).getCell(1).font = { italic: true, size: 9, color: { argb: FG.darkGray } };
  const hdrCob = wsCobertura.getRow(3);
  hdrCob.eachCell(c => { c.font = { bold: true, size: 10, color: { argb: FG.white } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FG.darkNavy } }; c.alignment = { horizontal: 'center' }; });
  hdrCob.getCell(1).alignment = { horizontal: 'left' };
  hdrCob.getCell(2).alignment = { horizontal: 'left' };
  wsCobertura.getColumn(1).width = 8;
  wsCobertura.getColumn(2).width = 36;
  wsCobertura.getColumn(3).width = 13;
  wsCobertura.getColumn(4).width = 7;  // Total Real
  wsCobertura.getColumn(5).width = 7;  // Estim.
  for (let c = 6; c <= 29; c++) wsCobertura.getColumn(c).width = 7;
  for (let r = 4; r <= 3 + sorted.length; r++) {
    const [, rowData] = sorted[r - 4]!;
    const row = wsCobertura.getRow(r);
    const bg = r % 2 === 0 ? FG.lightBlueGray : FG.white;
    row.eachCell({ includeEmpty: true }, (c, ci) => {
      c.font = { size: 10 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      if (ci >= 4) c.alignment = { horizontal: 'center' };
      if (ci === 4 || ci === 5) c.font = { size: 10, bold: true };
    });
    // Apply special colors for E (estimated) and X (excluded) quincena cells
    // Quincenas start at column 6 (after Código, Nombre, Tipo, Total, Estim.)
    for (let qi = 0; qi < QUINCENAS.length; qi++) {
      const qd = rowData.quincenas[qi];
      if (!qd) continue;
      const cell = row.getCell(6 + qi);
      if (qd.excluded) {
        cell.fill = sfill(FG.lightRed);
        cell.font = { size: 10, bold: true, color: { argb: FG.darkRed } };
      } else if (qd.estimated) {
        cell.fill = sfill(FG.lightAmber);
        cell.font = { size: 10, color: { argb: FG.darkAmber } };
      }
    }
  }
  wsCobertura.views = [{ state: 'frozen', xSplit: 5, ySplit: 3 }];

  // ── Hoja Resumen ──────────────────────────────────────────────────────────
  const wsResumen = wb.addWorksheet('Resumen');
  const resData = crearResumenSheet(colaboradores);
  for (const row of resData) wsResumen.addRow(row.length ? row : []);
  applyResumenFormat(wsResumen, sorted.length);

  // ── Una hoja por colaborador ──────────────────────────────────────────────
  for (const [, data] of sorted) {
    const sheetName = `${data.info.codigo} - ${data.info.nombre}`.slice(0, 31);
    const ws = wb.addWorksheet(sheetName);
    const personaData = crearPersonaSheet(data);
    for (const row of personaData) ws.addRow(row.length ? row : []);
    applyPersonaFormat(ws);
    applyQuincenaMarkers(ws, data.quincenas);
    console.log(`  Hoja: ${sheetName}`);
  }

  await wb.xlsx.writeFile(OUTPUT_PATH);
  console.log(`\nGenerado: ${OUTPUT_PATH}`);
}

if (require.main === module) {
  main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
}
