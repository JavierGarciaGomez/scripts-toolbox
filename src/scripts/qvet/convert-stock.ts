/**
 * QVET Convert Stock
 *
 * Converts a flat stock-change Excel (one row per article+warehouse)
 * into the format expected by update-articles.ts (one row per article).
 *
 * Output: Single sheet with columns Stock_Min_X, Stock_Opt_X per warehouse.
 * Compatible with both 1-sheet and 2-sheet modes of update-articles.ts:
 *   - Default: outputs Original + Editar sheets (for comparison mode)
 *   - --single: outputs a single sheet (all values applied directly)
 *
 * Usage:
 *   npx ts-node src/scripts/qvet/convert-stock.ts <archivo.xlsx> [--single]
 */

import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Warehouse name in Excel → suffix in column headers
const ALMACEN_MAP: Record<string, string> = {
  'URBAN CENTER': 'Urban',
  'HARBOR': 'Harbor',
  'MONTEJO': 'Montejo',
};

interface ArticleRow {
  id: number;
  producto: string;
  actual: Record<string, { min: number; opt: number }>;
  nuevo: Record<string, { min: number; opt: number }>;
}

function detectPivotedFormat(headers: string[]): { almacenColumns: Map<string, { minActual: number; minNuevo: number; optActual: number; optNuevo: number }> } | null {
  const almacenColumns = new Map<string, { minActual: number; minNuevo: number; optActual: number; optNuevo: number }>();

  for (const [almacenName, suffix] of Object.entries(ALMACEN_MAP)) {
    const minActual = headers.findIndex(h => h?.toString().toUpperCase().includes(almacenName) && h?.toString().toLowerCase().includes('minactual'));
    const minNuevo = headers.findIndex(h => h?.toString().toUpperCase().includes(almacenName) && h?.toString().toLowerCase().includes('minnuevo'));
    const optActual = headers.findIndex(h => h?.toString().toUpperCase().includes(almacenName) && h?.toString().toLowerCase().includes('optactual'));
    const optNuevo = headers.findIndex(h => h?.toString().toUpperCase().includes(almacenName) && h?.toString().toLowerCase().includes('optnuevo'));

    if (minNuevo !== -1 || optNuevo !== -1) {
      almacenColumns.set(suffix, { minActual, minNuevo, optActual, optNuevo });
    }
  }

  return almacenColumns.size > 0 ? { almacenColumns } : null;
}

function parseFlatFormat(rows: any[][], headers: string[]): Map<number, ArticleRow> {
  const colIdx = {
    id: headers.findIndex(h => h?.toString().toLowerCase().includes('codigo')),
    producto: headers.findIndex(h => h?.toString().toLowerCase().includes('producto')),
    almacen: headers.findIndex(h => h?.toString().toLowerCase().includes('almacen')),
    minActual: headers.findIndex(h => h?.toString().toLowerCase() === 'minactual'),
    minNuevo: headers.findIndex(h => h?.toString().toLowerCase() === 'minnuevo'),
    optActual: headers.findIndex(h => h?.toString().toLowerCase() === 'optimoactual'),
    optNuevo: headers.findIndex(h => h?.toString().toLowerCase() === 'optimonuevo'),
  };

  for (const [name, idx] of Object.entries(colIdx)) {
    if (idx === -1) {
      console.log(`Columna no encontrada: ${name} (headers: ${headers.join(', ')})`);
      process.exit(1);
    }
  }

  const articles = new Map<number, ArticleRow>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const id = Number(row[colIdx.id]);
    if (isNaN(id)) continue;

    const almacenRaw = String(row[colIdx.almacen] || '').trim().toUpperCase();
    const suffix = ALMACEN_MAP[almacenRaw];
    if (!suffix) {
      console.log(`  Almacen desconocido en fila ${i + 1}: "${almacenRaw}"`);
      continue;
    }

    if (!articles.has(id)) {
      articles.set(id, { id, producto: String(row[colIdx.producto] || ''), actual: {}, nuevo: {} });
    }

    const art = articles.get(id)!;
    art.actual[suffix] = { min: Number(row[colIdx.minActual]) || 0, opt: Number(row[colIdx.optActual]) || 0 };
    art.nuevo[suffix] = { min: Number(row[colIdx.minNuevo]) || 0, opt: Number(row[colIdx.optNuevo]) || 0 };
  }

  return articles;
}

function parsePivotedFormat(rows: any[][], headers: string[], pivotInfo: { almacenColumns: Map<string, { minActual: number; minNuevo: number; optActual: number; optNuevo: number }> }): Map<number, ArticleRow> {
  const idCol = headers.findIndex(h => h?.toString().toLowerCase().includes('codigo'));
  const prodCol = headers.findIndex(h => h?.toString().toLowerCase().includes('producto'));

  if (idCol === -1) {
    console.log(`Columna de código no encontrada (headers: ${headers.join(', ')})`);
    process.exit(1);
  }

  const articles = new Map<number, ArticleRow>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const id = Number(row[idCol]);
    if (isNaN(id)) continue;

    const art: ArticleRow = { id, producto: String(row[prodCol] ?? ''), actual: {}, nuevo: {} };

    for (const [suffix, cols] of pivotInfo.almacenColumns) {
      art.actual[suffix] = {
        min: cols.minActual !== -1 ? (Number(row[cols.minActual]) || 0) : 0,
        opt: cols.optActual !== -1 ? (Number(row[cols.optActual]) || 0) : 0,
      };
      art.nuevo[suffix] = {
        min: cols.minNuevo !== -1 ? (Number(row[cols.minNuevo]) || 0) : 0,
        opt: cols.optNuevo !== -1 ? (Number(row[cols.optNuevo]) || 0) : 0,
      };
    }

    articles.set(id, art);
  }

  return articles;
}

function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find(a => !a.startsWith('--'));

  if (!inputPath) {
    console.log('Uso: npx ts-node src/scripts/qvet/convert-stock.ts <archivo.xlsx> [--single]');
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.log(`Archivo no encontrado: ${inputPath}`);
    process.exit(1);
  }

  const singleSheet = args.includes('--single');

  console.log('QVET Convert Stock');
  console.log('===================\n');
  console.log(`Entrada: ${inputPath}`);
  console.log(`Modo salida: ${singleSheet ? '1 hoja' : '2 hojas (Original + Editar)'}`);

  // Read Excel
  const wb = XLSX.readFile(inputPath);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    console.log('Excel sin hojas');
    process.exit(1);
  }

  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]!, { header: 1 });
  const headers = rows[0] as string[];

  console.log(`Filas de datos: ${rows.length - 1}`);

  // Detect format
  const hasAlmacenCol = headers.some(h => h?.toString().toLowerCase().includes('almacen'));
  const pivotInfo = detectPivotedFormat(headers);
  let articles: Map<number, ArticleRow>;

  if (!hasAlmacenCol && pivotInfo) {
    console.log(`Formato: pivotado (columnas por almacén)`);
    articles = parsePivotedFormat(rows, headers, pivotInfo);
  } else {
    console.log(`Formato: plano (una fila por almacén)`);
    articles = parseFlatFormat(rows, headers);
  }

  console.log(`Articulos unicos: ${articles.size}`);

  const almacenes = [...new Set(
    [...articles.values()].flatMap(a => Object.keys(a.actual))
  )].sort();

  console.log(`Almacenes: ${almacenes.join(', ')}`);

  // Build output headers
  const outHeaders = ['CODIGO INTERNO', 'DESCRIPCION'];
  for (const alm of almacenes) {
    outHeaders.push(`Stock_Min_${alm}`, `Stock_Opt_${alm}`);
  }

  const sortedArticles = [...articles.values()].sort((a, b) => a.id - b.id);
  let totalChanges = 0;

  const outWb = XLSX.utils.book_new();

  if (singleSheet) {
    // Single sheet: only new values
    const data: any[][] = [outHeaders];

    for (const art of sortedArticles) {
      const row: any[] = [art.id, art.producto];
      for (const alm of almacenes) {
        const nuevo = art.nuevo[alm] || { min: 0, opt: 0 };
        row.push(nuevo.min, nuevo.opt);
        totalChanges += 2;
      }
      data.push(row);
    }

    XLSX.utils.book_append_sheet(outWb, XLSX.utils.aoa_to_sheet(data), 'Datos');
  } else {
    // Two sheets: Original (empty to force all) + Editar (new values)
    const originalData: any[][] = [outHeaders];
    const editarData: any[][] = [outHeaders];

    for (const art of sortedArticles) {
      const origRow: any[] = [art.id, art.producto];
      const editRow: any[] = [art.id, art.producto];

      for (const alm of almacenes) {
        const nuevo = art.nuevo[alm] || { min: 0, opt: 0 };
        origRow.push('', '');
        editRow.push(nuevo.min, nuevo.opt);
        totalChanges += 2;
      }

      originalData.push(origRow);
      editarData.push(editRow);
    }

    XLSX.utils.book_append_sheet(outWb, XLSX.utils.aoa_to_sheet(originalData), 'Original');
    XLSX.utils.book_append_sheet(outWb, XLSX.utils.aoa_to_sheet(editarData), 'Editar');
  }

  console.log(`Cambios: ${totalChanges}\n`);

  const dataDir = path.join(process.cwd(), 'data', 'qvet');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  const outputPath = path.join(dataDir, `stock-edit-${timestamp}.xlsx`);
  XLSX.writeFile(outWb, outputPath);

  console.log(`Guardado: ${outputPath}`);
  console.log(`\nSiguiente paso:`);
  console.log(`  npx ts-node src/scripts/qvet/update-articles.ts ${outputPath}`);
}

main();
