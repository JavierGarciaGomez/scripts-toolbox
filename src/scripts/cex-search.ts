/**
 * CeX Price Search Script
 *
 * Searches game prices on CeX Spain (es.webuy.com) using Algolia API.
 * Fast: ~200ms per game, supports parallel searches.
 */

import XLSX from "xlsx";
import fs from "fs";
import path from "path";

interface GameRow {
  game_id: string;
  title: string;
  console?: string;
  cex_sync_mode?: string;
  cex_box_id?: string;
  cex_box_name?: string;
  cex_category?: string;
  cex_sell_price?: number;
  cex_cash_price?: number;
  cex_exchange_price?: number;
  cex_updated_at?: string;
  [key: string]: string | number | undefined;
}

// Prioridad de consolas cuando no se especifica
const CONSOLE_PRIORITY = ["PS5", "PS4", "Switch 2", "Switch"];

interface CexResult {
  boxId: string;
  boxName: string;
  categoryName: string;
  sellPrice: number;
  cashPriceCalculated: number;
  exchangePriceCalculated: number;
}

const ALGOLIA_URL = "https://search.webuy.io/1/indexes/prod_cex_es/query";
const ALGOLIA_PARAMS = "x-algolia-api-key=bf79f2b6699e60a18ae330a1248b452c&x-algolia-application-id=LNNFEEWZVA";
const PARALLEL_BATCH_SIZE = 10;

function matchesConsole(categoryName: string, console: string): boolean {
  const cat = categoryName.toLowerCase();
  const con = console.toLowerCase();

  // Mapeo de nombres de consola a patrones en categoryName
  if (con === "ps5") return cat.includes("ps5");
  if (con === "ps4") return cat.includes("ps4");
  if (con === "switch 2") return cat.includes("switch 2");
  if (con === "switch") return cat.includes("switch") && !cat.includes("switch 2");
  if (con === "xbox") return cat.includes("xbox");
  if (con === "pc") return cat.includes("pc");

  // Fallback: buscar el texto directamente
  return cat.includes(con);
}

function getConsolePriority(categoryName: string): number {
  for (let i = 0; i < CONSOLE_PRIORITY.length; i++) {
    const console = CONSOLE_PRIORITY[i];
    if (console && matchesConsole(categoryName, console)) {
      return i;
    }
  }
  return CONSOLE_PRIORITY.length; // Menor prioridad si no coincide
}

function extractConsoleFromCategory(categoryName: string): string {
  const cat = categoryName.toLowerCase();

  if (cat.includes("ps5")) return "PS5";
  if (cat.includes("ps4")) return "PS4";
  if (cat.includes("ps3")) return "PS3";
  if (cat.includes("switch 2")) return "Switch 2";
  if (cat.includes("switch")) return "Switch";
  if (cat.includes("xbox series")) return "Xbox Series";
  if (cat.includes("xbox one")) return "Xbox One";
  if (cat.includes("xbox smart delivery")) return "Xbox";
  if (cat.includes("xbox")) return "Xbox";
  if (cat.includes("pc")) return "PC";

  // Fallback: devolver la categoría limpia
  return categoryName.replace(/juegos?/gi, "").trim();
}

async function searchCex(query: string, preferredConsole?: string): Promise<CexResult | null> {
  try {
    const response = await fetch(`${ALGOLIA_URL}?${ALGOLIA_PARAMS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        hitsPerPage: 20, // Obtener varios para filtrar por consola
        attributesToRetrieve: [
          "boxId",
          "boxName",
          "categoryName",
          "sellPrice",
          "cashPriceCalculated",
          "exchangePriceCalculated",
        ],
      }),
    });

    const data = await response.json();
    const hits = data.hits ?? [];

    if (hits.length === 0) return null;

    let selectedHit;

    if (preferredConsole) {
      // Buscar coincidencia exacta con la consola especificada
      selectedHit = hits.find((h: CexResult) => matchesConsole(h.categoryName, preferredConsole));

      // Si no hay coincidencia exacta, usar el primer resultado
      if (!selectedHit) {
        selectedHit = hits[0];
      }
    } else {
      // Sin consola especificada: ordenar por prioridad
      const sorted = [...hits].sort((a: CexResult, b: CexResult) => {
        return getConsolePriority(a.categoryName) - getConsolePriority(b.categoryName);
      });
      selectedHit = sorted[0];
    }

    if (selectedHit) {
      return {
        boxId: selectedHit.boxId,
        boxName: selectedHit.boxName,
        categoryName: selectedHit.categoryName,
        sellPrice: selectedHit.sellPrice ?? 0,
        cashPriceCalculated: selectedHit.cashPriceCalculated ?? 0,
        exchangePriceCalculated: selectedHit.exchangePriceCalculated ?? 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function searchBatch(games: { title: string; console: string | undefined; index: number }[]): Promise<Map<number, CexResult | null>> {
  const results = new Map<number, CexResult | null>();

  await Promise.all(
    games.map(async ({ title, console, index }) => {
      const result = await searchCex(title, console);
      results.set(index, result);
    })
  );

  return results;
}

function saveProgress(workbook: XLSX.WorkBook, rows: GameRow[], sheetName: string, filePath: string) {
  const newWorksheet = XLSX.utils.json_to_sheet(rows);
  workbook.Sheets[sheetName] = newWorksheet;
  XLSX.writeFile(workbook, filePath);
}

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args[0] ?? "data/cex_sync.xlsx";
  const filePath = path.isAbsolute(inputFile) ? inputFile : path.join(process.cwd(), inputFile);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`📂 Reading: ${filePath}`);

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    console.error("❌ No sheets found");
    process.exit(1);
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    console.error("❌ Worksheet not found");
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json<GameRow>(worksheet);
  console.log(`📋 Sheet: ${sheetName}`);
  console.log(`📊 Total rows: ${rows.length}`);

  const pendingGames = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.cex_sync_mode || row.cex_sync_mode === "pending");

  console.log(`⏳ Pending: ${pendingGames.length}`);

  if (pendingGames.length === 0) {
    console.log("✅ No pending games to sync");
    process.exit(0);
  }

  console.log(`\n⚙️  Parallel batch size: ${PARALLEL_BATCH_SIZE}`);
  console.log(`🚀 Starting search...\n`);

  const startTime = Date.now();
  const now = new Date().toISOString();
  let foundCount = 0;
  let processedCount = 0;

  // Process in batches
  for (let i = 0; i < pendingGames.length; i += PARALLEL_BATCH_SIZE) {
    const batch = pendingGames.slice(i, i + PARALLEL_BATCH_SIZE);
    const batchData = batch.map(({ row, index }) => ({ title: row.title, console: row.console, index }));

    const results = await searchBatch(batchData);

    for (const { row, index } of batch) {
      const result = results.get(index);
      const rowRef = rows[index];

      if (rowRef) {
        if (result) {
          // Si no tenía consola, llenar con la que se encontró
          if (!rowRef.console) {
            rowRef.console = extractConsoleFromCategory(result.categoryName);
          }
          rowRef.cex_box_id = result.boxId;
          rowRef.cex_box_name = result.boxName;
          rowRef.cex_category = result.categoryName;
          rowRef.cex_sell_price = result.sellPrice;
          rowRef.cex_cash_price = result.cashPriceCalculated;
          rowRef.cex_exchange_price = result.exchangePriceCalculated;
          rowRef.cex_sync_mode = "synced";
          rowRef.cex_updated_at = now;
          console.log(`✓ ${row.title} [${rowRef.console}] → ${result.boxName} | Sell: ${result.sellPrice}€ | Cash: ${result.cashPriceCalculated}€ | Exchange: ${result.exchangePriceCalculated}€`);
          foundCount++;
        } else {
          rowRef.cex_sync_mode = "not_found";
          rowRef.cex_updated_at = now;
          console.log(`✗ ${row.title} → Not found`);
        }
      }

      processedCount++;
    }

    // Save progress every batch
    if (i + PARALLEL_BATCH_SIZE < pendingGames.length) {
      console.log(`\n💾 Progress: ${processedCount}/${pendingGames.length}\n`);
      saveProgress(workbook, rows, sheetName, filePath);
    }
  }

  // Final save
  saveProgress(workbook, rows, sheetName, filePath);

  const elapsed = Date.now() - startTime;
  console.log(`\n✅ Done in ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`📊 Found: ${foundCount}/${processedCount}`);
  console.log(`⚡ Speed: ${(elapsed / processedCount).toFixed(0)}ms/game`);
}

main().catch(console.error);
