import ExcelJS from "exceljs";
import * as xlsx from "xlsx";

// Types
interface TableRow {
  CODIGOINTERNO: number;
  DESCRIPCION1: string;
  SECCION: string;
  FAMILIA: string;
  SUBFAMILIA: string;
}

interface InventoryRow {
  "ID Articulo": number;
  Almacen: string;
  Stock: number;
}

interface MovimientoRow {
  IDARTICULO: number | string;
  Almacen: string;
  Tipo: string;
  Cantidad: number;
  Factor_conversion: number;
}

interface ConceptoRow {
  "CODIGO INTERNO": number;
  UPC: number;
  "FACTOR DE CONVERSION": number;
}

interface MainRow {
  code: number;
  name: string;
  seccion: string;
  familia: string;
  subfamilia: string;
  urban: StockData;
  harbor: StockData;
  montejo: StockData;
  global: GlobalData;
}

interface StockData {
  inicial: number;
  compras: number;
  ventas: number;
  traspasos: number;
  final: number;
  validacion: number;
}

interface GlobalData {
  inicial: number;
  compras: number;
  ventas: number;
  traspasos: number;
  expected: number;
  final: number;
  diferencia: number;
  precioUnitario: number;
  perdidas: number;
  lossRate: number;
}

// Constants
const INPUT_FILE = "data/audit-stock/2026-01-auditStock.xlsx";

// Colors for each warehouse
const COLORS = {
  urban: "4472C4", // Blue
  harbor: "70AD47", // Green
  montejo: "ED7D31", // Orange
  global: "7030A0", // Purple
  header: "F2F2F2", // Light gray for sub-headers
};

// Utility: round to 2 decimal places
const round = (n: number) => Math.round(n * 100) / 100;

async function main() {
  console.log("📊 Iniciando auditoría de stock...\n");

  // Read original workbook with xlsx to get data
  const xlsxWorkbook = xlsx.readFile(INPUT_FILE);

  // Load sheets as JSON
  const tableData: TableRow[] = xlsx.utils.sheet_to_json(
    xlsxWorkbook.Sheets["Table"]!
  );
  const inv241231Data: InventoryRow[] = xlsx.utils.sheet_to_json(
    xlsxWorkbook.Sheets["Inv241231"]!
  );
  const invTodayData: InventoryRow[] = xlsx.utils.sheet_to_json(
    xlsxWorkbook.Sheets["InvToday"]!
  );
  const movimientosData: MovimientoRow[] = xlsx.utils.sheet_to_json(
    xlsxWorkbook.Sheets["ListadoMovimientos"]!
  );
  const conceptosData: ConceptoRow[] = xlsx.utils.sheet_to_json(
    xlsxWorkbook.Sheets["ListadoConceptos"]!
  );

  // Load Main sheet to get codes and preserve Excluir column
  const mainSheet = xlsxWorkbook.Sheets["Main"]!;
  const mainRaw: any[][] = xlsx.utils.sheet_to_json(mainSheet, { header: 1 });

  // Codes start at row 3 (index 2)
  const codes: number[] = [];
  const excluirMap = new Map<number, string>(); // Preserve Excluir values

  for (let i = 2; i < mainRaw.length; i++) {
    const row = mainRaw[i];
    if (row && row[0] !== undefined && row[0] !== null && row[0] !== "") {
      const code = Number(row[0]);
      codes.push(code);
      // Save existing Excluir value (column B, index 1)
      if (row[1] !== undefined && row[1] !== null && row[1] !== "") {
        excluirMap.set(code, String(row[1]));
      }
    }
  }

  console.log(`📋 Códigos a procesar: ${codes.length}`);

  // Create lookup maps
  const tableMap = new Map<number, TableRow>();
  tableData.forEach((row) => {
    if (!tableMap.has(row.CODIGOINTERNO)) {
      tableMap.set(row.CODIGOINTERNO, row);
    }
  });

  const conceptosMap = new Map<number, { upc: number; factor: number }>();
  conceptosData.forEach((row) => {
    const code = row["CODIGO INTERNO"];
    if (!conceptosMap.has(code)) {
      conceptosMap.set(code, {
        upc: row.UPC || 0,
        factor: row["FACTOR DE CONVERSION"] || 1,
      });
    }
  });

  const inv241231Map = new Map<string, number>();
  inv241231Data.forEach((row) => {
    const key = `${row["ID Articulo"]}|${row.Almacen}`;
    inv241231Map.set(key, (inv241231Map.get(key) || 0) + (row.Stock || 0));
  });

  const invTodayMap = new Map<string, number>();
  invTodayData.forEach((row) => {
    const key = `${row["ID Articulo"]}|${row.Almacen}`;
    invTodayMap.set(key, (invTodayMap.get(key) || 0) + (row.Stock || 0));
  });

  const movimientosMap = new Map<string, number>();
  movimientosData.forEach((row) => {
    if (row.IDARTICULO && row.Almacen && row.Tipo) {
      const key = `${row.IDARTICULO}|${row.Almacen}|${row.Tipo}`;
      // Para Compras: Cantidad * Factor_conversion
      // Para otros: solo Cantidad
      const cantidad = row.Cantidad || 0;
      const factor = row.Factor_conversion || 1;
      const valor = row.Tipo === "Compra" ? cantidad * factor : cantidad;
      movimientosMap.set(key, (movimientosMap.get(key) || 0) + valor);
    }
  });

  // Process each code
  const results: MainRow[] = [];

  for (const code of codes) {
    const tableRow = tableMap.get(code);
    const name = tableRow?.DESCRIPCION1 || "";
    const seccion = tableRow?.SECCION || "";
    const familia = tableRow?.FAMILIA || "";
    const subfamilia = tableRow?.SUBFAMILIA || "";

    const concepto = conceptosMap.get(code);
    const precioUnitario =
      concepto && concepto.factor > 0
        ? round(concepto.upc / concepto.factor)
        : 0;

    const urbanData = calculateStockData(
      code,
      "URBAN CENTER",
      inv241231Map,
      invTodayMap,
      movimientosMap
    );
    const harborData = calculateStockData(
      code,
      "HARBOR",
      inv241231Map,
      invTodayMap,
      movimientosMap
    );
    const montejoData = calculateStockData(
      code,
      "MONTEJO",
      inv241231Map,
      invTodayMap,
      movimientosMap
    );

    // Si inicial es negativo, usar 0
    const globalInicialRaw = urbanData.inicial + harborData.inicial + montejoData.inicial;
    const globalInicial = round(Math.max(0, globalInicialRaw));
    const globalCompras = round(
      urbanData.compras + harborData.compras + montejoData.compras
    );
    const globalVentas = round(
      urbanData.ventas + harborData.ventas + montejoData.ventas
    );
    const globalTraspasos = round(
      urbanData.traspasos + harborData.traspasos + montejoData.traspasos
    );
    const globalFinal = round(
      urbanData.final + harborData.final + montejoData.final
    );

    // Expected = inicial + compras + ventas + traspasos
    const expected = round(globalInicial + globalCompras + globalVentas + globalTraspasos);
    // Diferencia = expected - final
    const diferencia = round(expected - globalFinal);
    // LossRate: diferencia / (inicial + compras + traspasos) * 100
    const entradas = globalInicial + globalCompras + globalTraspasos;
    const lossRate = entradas !== 0 ? round((diferencia / entradas) * 100) : 0;
    const perdidas = round(diferencia * precioUnitario);

    const globalData: GlobalData = {
      inicial: globalInicial,
      compras: globalCompras,
      ventas: globalVentas,
      traspasos: globalTraspasos,
      expected,
      final: globalFinal,
      diferencia,
      precioUnitario,
      perdidas,
      lossRate,
    };

    results.push({
      code,
      name,
      seccion,
      familia,
      subfamilia,
      urban: urbanData,
      harbor: harborData,
      montejo: montejoData,
      global: globalData,
    });
  }

  console.log(`✅ Procesados ${results.length} productos\n`);

  // Sort by Pérdidas (global.perdidas) descending (mayor a menor)
  results.sort((a, b) => b.global.perdidas - a.global.perdidas);

  // Create new ExcelJS workbook from existing file
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(INPUT_FILE);

  // Remove existing Main sheet and create new one
  const existingMain = workbook.getWorksheet("Main");
  if (existingMain) {
    workbook.removeWorksheet(existingMain.id);
  }

  const ws = workbook.addWorksheet("Main", {
    views: [{ state: "frozen", xSplit: 6, ySplit: 2 }],
  });

  // Define columns (added "excluir" after code)
  ws.columns = [
    { key: "code", width: 6 },
    { key: "excluir", width: 7 },
    { key: "name", width: 32 },
    { key: "seccion", width: 14 },
    { key: "familia", width: 14 },
    { key: "subfamilia", width: 10 },
    { key: "u_ini", width: 6 },
    { key: "u_com", width: 6 },
    { key: "u_ven", width: 6 },
    { key: "u_tra", width: 6 },
    { key: "u_fin", width: 6 },
    { key: "u_val", width: 6 },
    { key: "h_ini", width: 6 },
    { key: "h_com", width: 6 },
    { key: "h_ven", width: 6 },
    { key: "h_tra", width: 6 },
    { key: "h_fin", width: 6 },
    { key: "h_val", width: 6 },
    { key: "m_ini", width: 6 },
    { key: "m_com", width: 6 },
    { key: "m_ven", width: 6 },
    { key: "m_tra", width: 6 },
    { key: "m_fin", width: 6 },
    { key: "m_val", width: 6 },
    { key: "g_ini", width: 6 },
    { key: "g_com", width: 6 },
    { key: "g_ven", width: 6 },
    { key: "g_tra", width: 6 },
    { key: "g_exp", width: 6 },
    { key: "g_fin", width: 6 },
    { key: "g_dif", width: 6 },
    { key: "g_pre", width: 8 },
    { key: "g_per", width: 9 },
    { key: "g_loss", width: 6 },
  ];

  // Row 1: Warehouse headers
  const row1 = ws.getRow(1);
  row1.values = [
    "",
    "",
    "",
    "",
    "",
    "",
    "URBAN",
    "",
    "",
    "",
    "",
    "",
    "HARBOR",
    "",
    "",
    "",
    "",
    "",
    "MONTEJO",
    "",
    "",
    "",
    "",
    "",
    "GLOBAL",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];

  // Merge cells for warehouse names (shifted for new columns)
  ws.mergeCells("G1:L1");   // URBAN: cols 7-12
  ws.mergeCells("M1:R1");   // HARBOR: cols 13-18
  ws.mergeCells("S1:X1");   // MONTEJO: cols 19-24
  ws.mergeCells("Y1:AH1");  // GLOBAL: cols 25-34 (added Exp column)

  // Style row 1
  const styleHeaderCell = (
    cell: ExcelJS.Cell,
    color: string,
    text: string
  ) => {
    cell.value = text;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: color },
    };
    cell.font = { bold: true, color: { argb: "FFFFFF" }, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  };

  styleHeaderCell(ws.getCell("G1"), COLORS.urban, "URBAN");
  styleHeaderCell(ws.getCell("M1"), COLORS.harbor, "HARBOR");
  styleHeaderCell(ws.getCell("S1"), COLORS.montejo, "MONTEJO");
  styleHeaderCell(ws.getCell("Y1"), COLORS.global, "GLOBAL");

  // Row 2: Column headers
  const row2 = ws.getRow(2);
  row2.values = [
    "CODE",
    "Excluir",
    "NAME",
    "SECCION",
    "FAMILIA",
    "SUBFAM",
    "Ini",
    "Com",
    "Ven",
    "Tra",
    "Fin",
    "Val",
    "Ini",
    "Com",
    "Ven",
    "Tra",
    "Fin",
    "Val",
    "Ini",
    "Com",
    "Ven",
    "Tra",
    "Fin",
    "Val",
    "Ini",
    "Com",
    "Ven",
    "Tra",
    "Exp",
    "Fin",
    "Dif",
    "Precio",
    "Pérdidas",
    "Loss%",
  ];

  // Style row 2
  row2.eachCell((cell, colNumber) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.header },
    };
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };

    // Color based on warehouse (adjusted for new columns)
    if (colNumber >= 7 && colNumber <= 12) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "D6E3F8" },
      }; // Light blue - URBAN
    } else if (colNumber >= 13 && colNumber <= 18) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "E2EFDA" },
      }; // Light green - HARBOR
    } else if (colNumber >= 19 && colNumber <= 24) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FCE4D6" },
      }; // Light orange - MONTEJO
    } else if (colNumber >= 25 && colNumber <= 34) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "E4DFEC" },
      }; // Light purple - GLOBAL
    }
  });

  row1.height = 20;
  row2.height = 18;

  // Add data rows
  for (const r of results) {
    const excluirValue = excluirMap.get(r.code) || "";  // Preserve existing value
    const row = ws.addRow([
      r.code,
      excluirValue,
      r.name,
      r.seccion,
      r.familia,
      r.subfamilia,
      r.urban.inicial,
      r.urban.compras,
      r.urban.ventas,
      r.urban.traspasos,
      r.urban.final,
      r.urban.validacion,
      r.harbor.inicial,
      r.harbor.compras,
      r.harbor.ventas,
      r.harbor.traspasos,
      r.harbor.final,
      r.harbor.validacion,
      r.montejo.inicial,
      r.montejo.compras,
      r.montejo.ventas,
      r.montejo.traspasos,
      r.montejo.final,
      r.montejo.validacion,
      r.global.inicial,
      r.global.compras,
      r.global.ventas,
      r.global.traspasos,
      r.global.expected,
      r.global.final,
      r.global.diferencia,
      r.global.precioUnitario,
      r.global.perdidas,
      r.global.lossRate,
    ]);

    row.font = { size: 9 };
    row.alignment = { vertical: "middle" };

    // Style numeric cells (start at col 7 now due to Excluir column)
    row.eachCell((cell, colNumber) => {
      if (colNumber >= 7) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
      }
      cell.border = {
        top: { style: "thin", color: { argb: "D9D9D9" } },
        bottom: { style: "thin", color: { argb: "D9D9D9" } },
        left: { style: "thin", color: { argb: "D9D9D9" } },
        right: { style: "thin", color: { argb: "D9D9D9" } },
      };

      // Format specific columns
      if (colNumber === 32) {
        // Precio - currency
        cell.numFmt = '"$"#,##0.00';
      } else if (colNumber === 33) {
        // Pérdidas - currency
        cell.numFmt = '"$"#,##0.00';
      } else if (colNumber === 34) {
        // Loss% - percentage
        cell.numFmt = '0.00"%"';
      }
    });

    // Excluir column (2) - center align
    const excluirCell = row.getCell(2);
    excluirCell.alignment = { horizontal: "center", vertical: "middle" };
  }

  // Add data validation for Excluir column (dropdown TRUE/FALSE)
  const excluirCol = ws.getColumn(2);
  for (let i = 3; i <= results.length + 2; i++) {
    ws.getCell(i, 2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"TRUE,FALSE"'],
    };
  }

  // Add auto-filter
  const lastRow = results.length + 2;
  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: lastRow, column: 34 },
  };

  // Workaround: Add _FilterDatabase defined name for Excel compatibility
  const sheetName = "Main";
  const filterRange = `'${sheetName}'!$A$2:$AH$${lastRow}`;

  // Get existing defined names or empty array
  const existingNames = (workbook.definedNames as any)._model || [];

  // Add the filter database entry
  (workbook.definedNames as any)._model = [
    ...existingNames.filter((n: any) => n.name !== "_xlnm._FilterDatabase"),
    {
      name: "_xlnm._FilterDatabase",
      localSheetId: ws.id - 1,
      hidden: true,
      ranges: [filterRange],
    },
  ];

  // Save with ExcelJS
  await workbook.xlsx.writeFile(INPUT_FILE);

  console.log(`📁 Archivo actualizado: ${INPUT_FILE}`);
  console.log(`⚠️  Nota: Los filtros deben agregarse manualmente en Excel (Ctrl+Shift+L)`);

  // Summary
  const discrepancies = results.filter((r) => r.global.diferencia !== 0);
  const totalPerdidas = results.reduce((sum, r) => sum + r.global.perdidas, 0);

  console.log(`\n📊 Resumen:`);
  console.log(`   Productos con discrepancia: ${discrepancies.length}`);
  console.log(`   Pérdidas totales: $${round(totalPerdidas).toLocaleString()}`);
}

function calculateStockData(
  code: number,
  almacen: string,
  inv241231Map: Map<string, number>,
  invTodayMap: Map<string, number>,
  movimientosMap: Map<string, number>
): StockData {
  const keyBase = `${code}|${almacen}`;

  const inicial = inv241231Map.get(keyBase) || 0;
  const final = invTodayMap.get(keyBase) || 0;

  const compras = movimientosMap.get(`${keyBase}|Compra`) || 0;
  const ventas = movimientosMap.get(`${keyBase}|Venta`) || 0;
  const traspasosEntrada =
    movimientosMap.get(`${keyBase}|Traspaso entrada`) || 0;
  const traspasosSalida =
    movimientosMap.get(`${keyBase}|Traspaso salida`) || 0;
  const traspasos = traspasosEntrada + traspasosSalida;

  const validacion = inicial + compras + ventas + traspasos - final;

  return {
    inicial: round(inicial),
    compras: round(compras),
    ventas: round(ventas),
    traspasos: round(traspasos),
    final: round(final),
    validacion: round(validacion),
  };
}

main().catch(console.error);
