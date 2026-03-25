/**
 * Genera un Excel para limpiar el campo Referencia de una lista de artículos.
 *
 * Crea dos hojas (Original con "x" y Editar con vacío) para que update-articles
 * detecte el cambio y limpie el campo.
 *
 * Uso:
 *   npx ts-node src/scripts/qvet/gen-clear-referencia.ts
 *
 * Luego ejecutar:
 *   npx ts-node src/scripts/qvet/update-articles.ts data/qvet/clear-referencia.xlsx
 */

import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const ARTICLE_IDS = [
  5510, 5677, 5875, 6244, 6250, 6259, 7374, 7384, 8567, 8583, 8585,
];

const dataDir = path.join(process.cwd(), 'data', 'qvet');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const headers = ['Codigo Interno', 'REFERENCIA'];

// Original: tiene "x" como placeholder para que la comparación detecte cambio
const origData = [headers, ...ARTICLE_IDS.map(id => [id, 'x'])];

// Editar: vacío para limpiar el campo
const editData = [headers, ...ARTICLE_IDS.map(id => [id, ''])];

const wb = XLSX.utils.book_new();
const wsOrig = XLSX.utils.aoa_to_sheet(origData);
const wsEdit = XLSX.utils.aoa_to_sheet(editData);
XLSX.utils.book_append_sheet(wb, wsOrig, 'Original');
XLSX.utils.book_append_sheet(wb, wsEdit, 'Editar');

const outPath = path.join(dataDir, 'clear-referencia.xlsx');
XLSX.writeFile(wb, outPath);

console.log(`Generado: ${outPath}`);
console.log(`Artículos: ${ARTICLE_IDS.length}`);
console.log(`\nPara aplicar:`);
console.log(`  npx ts-node src/scripts/qvet/update-articles.ts ${outPath}`);
console.log(`\nPara dry-run primero:`);
console.log(`  npx ts-node src/scripts/qvet/update-articles.ts ${outPath} --dry-run`);
