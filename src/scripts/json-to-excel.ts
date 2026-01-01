import fs from "fs";
import path from "path";
import XLSX from "xlsx";

function jsonToExcel(jsonPath: string, outputPath: string) {
  const fileContent = fs.readFileSync(jsonPath, "utf8");
  const jsonData = JSON.parse(fileContent);

  if (!Array.isArray(jsonData)) {
    throw new Error("El JSON debe contener un array de objetos.");
  }

  const worksheet = XLSX.utils.json_to_sheet(jsonData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Datos");

  XLSX.writeFile(workbook, outputPath);
  console.log(`Excel generado: ${outputPath}`);
}

// Ejemplo de uso
const input = path.resolve(__dirname, "../../data/input.json");
const output = path.resolve(__dirname, "../../data/output.xlsx");

jsonToExcel(input, output);
