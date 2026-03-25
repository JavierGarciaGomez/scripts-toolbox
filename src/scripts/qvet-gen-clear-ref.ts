/**
 * Genera un Excel para borrar la Referencia de artículos usando qvet-process-edit.ts
 *
 * Uso:
 *   npx ts-node src/scripts/qvet-gen-clear-ref.ts
 *   npx ts-node src/scripts/qvet-process-edit.ts data/qvet/clear-ref.xlsx
 */

import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const ARTICLE_IDS = [
  535, 915, 1102, 2112, 2188, 2609, 2656, 2659, 2876, 2992,
  3119, 3123, 3258, 3327, 3406, 3668, 3738, 3898, 3955, 3970,
  3981, 4001, 4022, 4074, 4164, 4165, 4166, 4171, 4175, 4188,
  4199, 4200, 4203, 4204, 4205, 4215, 4265, 4266, 4273, 4284,
  4295, 4296, 4343, 4344, 4364, 4380, 4384, 4415, 4417, 4418,
  4419, 4420, 4421, 4422, 4428, 4434, 4446, 4472, 4499, 4524,
  4525, 4526, 4528, 4563, 4640, 4685, 4719, 4735, 5496, 5510,
  5666, 5677, 5817, 5875, 6097, 6098, 6100, 6224, 6242, 6244,
  6245, 6246, 6247, 6250, 6258, 6259, 6277, 6281, 6285, 6286,
  7334, 7338, 7339, 7340, 7341, 7342, 7343, 7356, 7357, 7358,
  7360, 7361, 7362, 7369, 7370, 7371, 7372, 7373, 7374, 7375,
  7376, 7377, 7378, 7379, 7380, 7381, 7382, 7383, 7384, 7390,
  7394, 7395, 7396, 7397, 7398, 7401, 7406, 7408, 7417, 7419,
  7420, 7421, 7422, 7423, 7424, 7425, 7426, 7427, 7428, 7429,
  7432, 7438, 7439, 7442, 8478, 8509, 8510, 8530, 8535, 8546,
  8548, 8549, 8558, 8567, 8575, 8578, 8579, 8582, 8583, 8585,
  8590, 8608, 8619, 8620, 8621, 8627, 8628, 8630, 8637, 8641,
  8659, 8661,
];

const headers = ['CODIGO INTERNO', 'REFERENCIA'];

// Original: poner "x" para que haya diferencia
const originalData = [headers, ...ARTICLE_IDS.map(id => [id, 'x'])];

// Editar: dejar vacío para borrar
const editarData = [headers, ...ARTICLE_IDS.map(id => [id, ''])];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(originalData), 'Original');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(editarData), 'Editar');

const outDir = path.join(process.cwd(), 'data', 'qvet');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, 'clear-ref.xlsx');
XLSX.writeFile(wb, outPath);

console.log(`✅ Excel generado: ${outPath}`);
console.log(`📋 ${ARTICLE_IDS.length} artículos`);
console.log(`\nPara ejecutar:`);
console.log(`  npx ts-node src/scripts/qvet-process-edit.ts ${outPath}`);
