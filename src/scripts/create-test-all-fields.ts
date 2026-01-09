import * as XLSX from 'xlsx';

// Test ALL fields EXCEPT Seccion, Familia, Subfamilia
const headers = [
  'CODIGO INTERNO',
  'DESCRIPCION',
  'Descripcion_2',
  'REFERENCIA',
  'Activo',
  'Visible_Ventas',
  'Visible_Compras',
  'Solo_Escandallo',
  'MARCA',
  'P_Minimo',
  'Upc_Bi',
  'Imp_Ventas',
  'Imp_Compras',
  'Tarifa_Ord_PVP',
  'Tarifa_Ord_MargenC',
  'Tarifa_Ord_MargenV',
  'Stock_Min_Harbor',
  'Stock_Opt_Harbor',
  'Compra_Min_Harbor',
  'Stock_Min_Montejo',
  'Stock_Opt_Montejo',
  'Compra_Min_Montejo',
  'Stock_Min_Urban',
  'Stock_Opt_Urban',
  'Compra_Min_Urban',
  'Observaciones'
];

// Original values
const originalData = [
  headers,
  [
    6242,                    // CODIGO INTERNO
    'ORIGINAL DESC',         // DESCRIPCION
    'ORIGINAL DESC2',        // Descripcion_2
    'REF-ORIGINAL',          // REFERENCIA
    'Si',                    // Activo
    'Si',                    // Visible_Ventas
    'Si',                    // Visible_Compras
    'No',                    // Solo_Escandallo
    'ORIGINAL MARCA',        // MARCA
    10.00,                   // P_Minimo
    8.00,                    // Upc_Bi
    '16',                    // Imp_Ventas
    '16',                    // Imp_Compras
    50.00,                   // Tarifa_Ord_PVP
    10.0,                    // Tarifa_Ord_MargenC
    15.0,                    // Tarifa_Ord_MargenV
    1,                       // Stock_Min_Harbor
    5,                       // Stock_Opt_Harbor
    1,                       // Compra_Min_Harbor
    1,                       // Stock_Min_Montejo
    5,                       // Stock_Opt_Montejo
    1,                       // Compra_Min_Montejo
    1,                       // Stock_Min_Urban
    5,                       // Stock_Opt_Urban
    1,                       // Compra_Min_Urban
    'ORIGINAL OBS'           // Observaciones
  ]
];

// New values - change everything
const editarData = [
  headers,
  [
    6242,                           // CODIGO INTERNO
    'TEST EDITADO V2',              // DESCRIPCION
    'Descripcion secundaria test',  // Descripcion_2
    'REF-TEST-002',                 // REFERENCIA
    'Si',                           // Activo
    'Si',                           // Visible_Ventas
    'Si',                           // Visible_Compras
    'No',                           // Solo_Escandallo
    'ALBOTT',                       // MARCA
    25.50,                          // P_Minimo
    18.00,                          // Upc_Bi
    '16',                           // Imp_Ventas
    '16',                           // Imp_Compras
    99.99,                          // Tarifa_Ord_PVP
    15.0,                           // Tarifa_Ord_MargenC
    20.0,                           // Tarifa_Ord_MargenV
    5,                              // Stock_Min_Harbor
    15,                             // Stock_Opt_Harbor
    2,                              // Compra_Min_Harbor
    3,                              // Stock_Min_Montejo
    10,                             // Stock_Opt_Montejo
    1,                              // Compra_Min_Montejo
    6,                              // Stock_Min_Urban
    20,                             // Stock_Opt_Urban
    3,                              // Compra_Min_Urban
    'Test completo - ' + new Date().toISOString()  // Observaciones
  ]
];

const workbook = XLSX.utils.book_new();
const originalSheet = XLSX.utils.aoa_to_sheet(originalData);
const editarSheet = XLSX.utils.aoa_to_sheet(editarData);

XLSX.utils.book_append_sheet(workbook, originalSheet, 'Original');
XLSX.utils.book_append_sheet(workbook, editarSheet, 'Editar');

XLSX.writeFile(workbook, 'data/qvet/test-all-except-cascade.xlsx');
console.log('Created test-all-except-cascade.xlsx');
console.log('Fields to test:', headers.length - 1, '(excluding ID)');
