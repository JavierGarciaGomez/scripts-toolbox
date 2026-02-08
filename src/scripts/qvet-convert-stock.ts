/**
 * QVET Convert Stock
 *
 * Convierte el Excel plano de cambios de stock (una fila por artículo+almacén)
 * al formato que espera qvet-process-edit.ts (hojas Original/Editar, una fila por artículo).
 *
 * Uso:
 *   npx ts-node src/scripts/qvet-convert-stock.ts tmp/cambios-stock-2026-02-08.xlsx
 *
 * Output:
 *   data/qvet/stock-edit-TIMESTAMP.xlsx  (listo para qvet-process-edit.ts)
 */

import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Mapeo de nombre de almacén en el Excel → sufijo en COLUMN_MAP de process-edit
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

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || !args[0]) {
    console.log('Uso: npx ts-node src/scripts/qvet-convert-stock.ts <archivo.xlsx>');
    process.exit(1);
  }

  const inputPath = args[0];
  if (!fs.existsSync(inputPath)) {
    console.log(`Archivo no encontrado: ${inputPath}`);
    process.exit(1);
  }

  console.log('QVET Convert Stock');
  console.log('===================\n');
  console.log(`Entrada: ${inputPath}`);

  // Leer Excel plano
  const wb = XLSX.readFile(inputPath);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    console.log('Excel sin hojas');
    process.exit(1);
  }

  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]!, { header: 1 });
  const headers = rows[0] as string[];

  // Encontrar índices de columnas
  const colIdx = {
    id: headers.findIndex(h => h?.toString().toLowerCase().includes('codigo')),
    producto: headers.findIndex(h => h?.toString().toLowerCase().includes('producto')),
    almacen: headers.findIndex(h => h?.toString().toLowerCase().includes('almacen')),
    minActual: headers.findIndex(h => h?.toString().toLowerCase() === 'minactual'),
    minNuevo: headers.findIndex(h => h?.toString().toLowerCase() === 'minnuevo'),
    optActual: headers.findIndex(h => h?.toString().toLowerCase() === 'optimoactual'),
    optNuevo: headers.findIndex(h => h?.toString().toLowerCase() === 'optimonuevo'),
  };

  // Validar que se encontraron todas las columnas
  for (const [name, idx] of Object.entries(colIdx)) {
    if (idx === -1) {
      console.log(`Columna no encontrada: ${name} (headers: ${headers.join(', ')})`);
      process.exit(1);
    }
  }

  console.log(`Filas de datos: ${rows.length - 1}`);

  // Agrupar por artículo (pivotar)
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
      articles.set(id, {
        id,
        producto: String(row[colIdx.producto] || ''),
        actual: {},
        nuevo: {},
      });
    }

    const art = articles.get(id)!;
    art.actual[suffix] = {
      min: Number(row[colIdx.minActual]) || 0,
      opt: Number(row[colIdx.optActual]) || 0,
    };
    art.nuevo[suffix] = {
      min: Number(row[colIdx.minNuevo]) || 0,
      opt: Number(row[colIdx.optNuevo]) || 0,
    };
  }

  console.log(`Articulos unicos: ${articles.size}`);

  // Obtener lista de almacenes que realmente aparecen
  const almacenes = [...new Set(
    [...articles.values()].flatMap(a => Object.keys(a.actual))
  )].sort();

  console.log(`Almacenes: ${almacenes.join(', ')}`);

  // Construir headers del Excel de salida
  const outHeaders = ['CODIGO INTERNO', 'DESCRIPCION'];
  for (const alm of almacenes) {
    outHeaders.push(`Stock_Min_${alm}`, `Stock_Opt_${alm}`);
  }

  // Construir filas Original y Editar
  const originalData: any[][] = [outHeaders];
  const editarData: any[][] = [outHeaders];

  // Ordenar artículos por ID
  const sortedArticles = [...articles.values()].sort((a, b) => a.id - b.id);

  let totalChanges = 0;

  for (const art of sortedArticles) {
    const origRow: any[] = [art.id, art.producto];
    const editRow: any[] = [art.id, art.producto];

    for (const alm of almacenes) {
      const nuevo = art.nuevo[alm] || { min: 0, opt: 0 };

      // Original siempre vacío para forzar que TODOS los valores se apliquen
      origRow.push('', '');
      editRow.push(nuevo.min, nuevo.opt);

      totalChanges += 2;
    }

    originalData.push(origRow);
    editarData.push(editRow);
  }

  console.log(`Cambios detectados: ${totalChanges}\n`);

  // Crear Excel de salida
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, XLSX.utils.aoa_to_sheet(originalData), 'Original');
  XLSX.utils.book_append_sheet(outWb, XLSX.utils.aoa_to_sheet(editarData), 'Editar');

  const dataDir = path.join(process.cwd(), 'data', 'qvet');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  const outputPath = path.join(dataDir, `stock-edit-${timestamp}.xlsx`);
  XLSX.writeFile(outWb, outputPath);

  console.log(`Guardado: ${outputPath}`);
  console.log(`\nSiguiente paso:`);
  console.log(`  npx ts-node src/scripts/qvet-process-edit.ts ${outputPath}`);
}

main();
