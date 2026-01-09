import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

interface PayrollEntry {
  generalData: {
    fullName: string;
    collaboratorCode: string;
    jobTitle: string;
  };
  totals: {
    totalIncome: number;
    totalDeductions: number;
    netPay: number;
  };
  periodStartDate: string;
  periodEndDate: string;
}

interface PayrollResponse {
  data: PayrollEntry[];
}

interface PersonSummary {
  fullName: string;
  collaboratorCode: string;
  jobTitle: string;
  totalIncome: number;
  totalDeductions: number;
  netPay: number;
  payrollCount: number;
}

function main() {
  const inputPath =
    process.argv[2] ||
    path.join(__dirname, "../../data/payroll-summary/payroll-summary.json");

  if (!fs.existsSync(inputPath)) {
    console.error(`Archivo no encontrado: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Leyendo: ${inputPath}\n`);

  const raw = fs.readFileSync(inputPath, "utf-8");
  const json: PayrollResponse = JSON.parse(raw);

  const summaryMap = new Map<string, PersonSummary>();

  for (const entry of json.data) {
    const name = entry.generalData.fullName;
    const existing = summaryMap.get(name);

    if (existing) {
      existing.totalIncome += entry.totals.totalIncome;
      existing.totalDeductions += entry.totals.totalDeductions;
      existing.netPay += entry.totals.netPay;
      existing.payrollCount += 1;
    } else {
      summaryMap.set(name, {
        fullName: name,
        collaboratorCode: entry.generalData.collaboratorCode,
        jobTitle: entry.generalData.jobTitle,
        totalIncome: entry.totals.totalIncome,
        totalDeductions: entry.totals.totalDeductions,
        netPay: entry.totals.netPay,
        payrollCount: 1,
      });
    }
  }

  const summaries = Array.from(summaryMap.values()).sort(
    (a, b) => b.totalIncome - a.totalIncome
  );

  console.log("=".repeat(80));
  console.log("RESUMEN POR PERSONA");
  console.log("=".repeat(80));

  let grandTotalIncome = 0;
  let grandTotalDeductions = 0;
  let grandNetPay = 0;

  for (const person of summaries) {
    console.log(`\n${person.fullName} (${person.collaboratorCode})`);
    console.log(`  Puesto: ${person.jobTitle}`);
    console.log(`  Nóminas: ${person.payrollCount}`);
    console.log(`  Total Income: $${person.totalIncome.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`);
    console.log(`  Total Deducciones: $${person.totalDeductions.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`);
    console.log(`  Net Pay: $${person.netPay.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`);

    grandTotalIncome += person.totalIncome;
    grandTotalDeductions += person.totalDeductions;
    grandNetPay += person.netPay;
  }

  console.log("\n" + "=".repeat(80));
  console.log("TOTALES GENERALES");
  console.log("=".repeat(80));
  console.log(`Personas: ${summaries.length}`);
  console.log(`Total Nóminas: ${json.data.length}`);
  console.log(`Total Income: $${grandTotalIncome.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`);
  console.log(`Total Deducciones: $${grandTotalDeductions.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`);
  console.log(`Net Pay Total: $${grandNetPay.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`);

  // Exportar a Excel y JSON
  const outputDir = path.join(__dirname, "../../data/payroll-summary");

  // Preparar datos para Excel
  const excelData = summaries.map((p) => ({
    Nombre: p.fullName,
    Código: p.collaboratorCode,
    Puesto: p.jobTitle,
    Nóminas: p.payrollCount,
    "Total Income": p.totalIncome,
    "Total Deducciones": p.totalDeductions,
    "Net Pay": p.netPay,
  }));

  // Agregar fila de totales
  excelData.push({
    Nombre: "TOTAL",
    Código: "",
    Puesto: "",
    Nóminas: json.data.length,
    "Total Income": grandTotalIncome,
    "Total Deducciones": grandTotalDeductions,
    "Net Pay": grandNetPay,
  });

  // Crear Excel
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelData);
  XLSX.utils.book_append_sheet(wb, ws, "Resumen por Persona");

  const excelPath = path.join(outputDir, "payroll-totals.xlsx");
  XLSX.writeFile(wb, excelPath);
  console.log(`\nExcel guardado: ${excelPath}`);

  // Crear JSON
  const jsonOutput = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPersonas: summaries.length,
      totalNominas: json.data.length,
      grandTotalIncome,
      grandTotalDeductions,
      grandNetPay,
    },
    byPerson: summaries,
  };

  const jsonPath = path.join(outputDir, "payroll-totals.json");
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`JSON guardado: ${jsonPath}`);
}

main();
