/**
 * HowLongToBeat CSV Import Script
 *
 * Since the HLTB API is blocking automated requests, this script allows you to:
 * 1. Create a CSV file with game times manually
 * 2. Import that CSV into Excel format
 *
 * CSV Format (comma-separated):
 * name,main,main_extra,completionist,platforms
 * "The Witcher 3",51,102,173,"PC, PS4, Xbox One"
 * "Hades",22,45,95,"PC, Switch, PS4"
 *
 * You can get the times from: https://howlongtobeat.com/
 */

import XLSX from "xlsx";
import fs from "fs";
import path from "path";

interface HLTBRow {
  name: string;
  main?: number;
  main_extra?: number;
  completionist?: number;
  platforms?: string;
}

function parseCSV(filePath: string): HLTBRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());

  if (lines.length === 0) {
    throw new Error("CSV file is empty");
  }

  // Skip header if present
  const firstLine = lines[0]?.toLowerCase() || "";
  const startIndex = firstLine.includes("name") ? 1 : 0;

  const results: HLTBRow[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]?.trim() || "";
    if (!line) continue;

    // Simple CSV parsing (handles quoted fields)
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());

    if (fields.length >= 1 && fields[0]) {
      const row: HLTBRow = {
        name: fields[0].replace(/^"|"$/g, ""),
      };

      const mainNum = fields[1] ? parseFloat(fields[1]) : NaN;
      if (!isNaN(mainNum) && mainNum > 0) row.main = mainNum;

      const mainExtraNum = fields[2] ? parseFloat(fields[2]) : NaN;
      if (!isNaN(mainExtraNum) && mainExtraNum > 0) row.main_extra = mainExtraNum;

      const compNum = fields[3] ? parseFloat(fields[3]) : NaN;
      if (!isNaN(compNum) && compNum > 0) row.completionist = compNum;

      if (fields[4]) row.platforms = fields[4].replace(/^"|"$/g, "");

      results.push(row);
    }
  }

  return results;
}

function exportToExcel(data: HLTBRow[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "HLTB Data");

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  const filePath = path.join(dataDir, filename);
  XLSX.writeFile(workbook, filePath);
  console.log(`✓ Excel file saved: ${filePath}`);
}

function createExampleCSV() {
  const examplePath = path.join(process.cwd(), "data", "hltb-example.csv");
  const exampleContent = `name,main,main_extra,completionist,platforms
"The Witcher 3",51,102,173,"PC, PS4, Xbox One"
"Hades",22,45,95,"PC, Switch, PS4, Xbox"
"Elden Ring",54,103,139,"PC, PS5, Xbox Series X"
"Hollow Knight",27,43,64,"PC, Switch, PS4"`;

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  fs.writeFileSync(examplePath, exampleContent);
  console.log(`✓ Example CSV created: ${examplePath}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help") {
    console.log("HowLongToBeat CSV Import");
    console.log("\nUsage:");
    console.log("  npm run hltb-csv <file.csv>       - Import CSV file");
    console.log("  npm run hltb-csv --example        - Create example CSV");
    console.log("\nCSV Format:");
    console.log('  name,main,main_extra,completionist,platforms');
    console.log(
      '  "Game Name",25,50,100,"PC, Switch"  (times in hours)'
    );
    console.log("\nGet game times from: https://howlongtobeat.com/");
    process.exit(0);
  }

  if (args[0] === "--example") {
    createExampleCSV();
    return;
  }

  const firstArg = args[0];
  if (!firstArg) {
    console.error("Error: No file specified");
    process.exit(1);
  }

  const csvPath = path.isAbsolute(firstArg)
    ? firstArg
    : path.join(process.cwd(), firstArg);

  if (!fs.existsSync(csvPath)) {
    console.error(`Error: File not found: ${csvPath}`);
    console.log("\nTry:");
    console.log("  npm run hltb-csv --example    (to create an example file)");
    process.exit(1);
  }

  console.log(`Reading CSV: ${csvPath}\n`);

  try {
    const data = parseCSV(csvPath);
    console.log(`✓ Parsed ${data.length} games\n`);

    // Show summary
    data.forEach((game, i) => {
      console.log(`${i + 1}. ${game.name}`);
      if (game.main) console.log(`   Main: ${game.main}h`);
      if (game.main_extra) console.log(`   +Extra: ${game.main_extra}h`);
      if (game.completionist)
        console.log(`   100%: ${game.completionist}h`);
      if (game.platforms) console.log(`   Platforms: ${game.platforms}`);
      console.log();
    });

    const timestamp = new Date().toISOString().split("T")[0];
    const outputName = `hltb-import-${timestamp}.xlsx`;
    exportToExcel(data, outputName);

    console.log(`\n✓ Successfully imported ${data.length} games`);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
