import * as XLSX from 'xlsx';

// Create test with SECCION, FAMILIA, SUBFAMILIA
const headers = ['CODIGO INTERNO', 'DESCRIPCION', 'SECCION', 'FAMILIA', 'SUBFAMILIA'];

// Current values (Original sheet) - from last saved state
const originalData = [
  headers,
  [6242, 'TEST', 'SUMINISTROS GENERALES', 'OTROS', 'UNICA']
];

// New values (Editar sheet) - change all 3 cascade fields
// FARMACIA has multiple familias and subfamilias to test
const editarData = [
  headers,
  [6242, 'TEST', 'FARMACIA', 'MEDICAMENTOS', 'OTROS']  // Different values to test full cascade
];

const workbook = XLSX.utils.book_new();
const originalSheet = XLSX.utils.aoa_to_sheet(originalData);
const editarSheet = XLSX.utils.aoa_to_sheet(editarData);

XLSX.utils.book_append_sheet(workbook, originalSheet, 'Original');
XLSX.utils.book_append_sheet(workbook, editarSheet, 'Editar');

XLSX.writeFile(workbook, 'data/qvet/test-cascade-3.xlsx');
console.log('Created test-cascade-3.xlsx with SECCION, FAMILIA, SUBFAMILIA');
