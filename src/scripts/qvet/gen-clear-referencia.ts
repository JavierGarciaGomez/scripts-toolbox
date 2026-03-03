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
  7424, 8530, 6100, 4446, 4296, 7394, 7396, 7397, 7398, 7421, 7422, 7423,
  7438, 7439, 8509, 8510, 8630, 8641, 4415, 3955, 5817, 4364, 5666, 3970,
  4266, 4434, 4640, 6224, 8478, 8608, 8659, 8661, 4343, 7425, 7426, 7427,
  7428, 7429, 7432, 8582, 4421, 7417, 2609, 6097, 6098, 6242, 2656, 7334,
  2876, 4524, 4525, 4526, 4528, 4295, 7395, 2112, 1102, 3898, 2992, 3406,
  3668, 6245, 6246, 4344, 6247, 6258, 6277, 6281, 7369, 7370, 7371, 7372,
  7373, 7375, 7376, 7377, 7378, 7379, 7380, 7381, 7382, 7383, 7390, 7401,
  7406, 7419, 7420, 4417, 4418, 4419, 4420, 4422, 6285, 6286, 7343, 4164,
  4188, 4165, 4166, 4171, 4175, 4215, 4204, 4200, 4205, 4203, 4199, 4189,
  4284, 4265, 3258, 4273, 3981, 8620, 8621, 8579, 8578, 8619, 8590, 4685,
  8637, 8535, 4719, 7357, 7358, 8546, 4472, 7356, 8549, 8548, 8628, 7408,
  8627, 4735, 8575, 7339, 7341, 7338, 7340, 7342, 3738, 4074, 4499, 3123,
  3119, 8558, 2188, 4563, 4001, 7362, 7361, 7360, 5496, 4384, 4380, 535,
  7442,
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
