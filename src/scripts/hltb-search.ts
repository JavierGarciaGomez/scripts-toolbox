/**
 * HowLongToBeat Search Script
 *
 * Searches games on HowLongToBeat.com and exports completion times to Excel/JSON.
 *
 * Note: The HowLongToBeat API uses web scraping and may block requests with 403 errors.
 * If this happens:
 * - Try using a VPN or different IP
 * - Increase delays between requests
 * - Try again later
 * - Consider using the official HowLongToBeat API if available
 */

import { HowLongToBeatService, HowLongToBeatEntry } from "howlongtobeat";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

interface HLTBRow {
  name: string;
  imageUrl?: string;
  gameplayMain?: number;
  gameplayMainExtra?: number;
  gameplayCompletionist?: number;
  similarity?: number;
  platforms?: string;
}

async function searchGames(gameTitles: string[]): Promise<HLTBRow[]> {
  const hltbService = new HowLongToBeatService();
  const results: HLTBRow[] = [];

  console.log(`Searching for ${gameTitles.length} games on HowLongToBeat...\n`);

  for (const title of gameTitles) {
    try {
      console.log(`Searching: ${title}...`);
      const searchResults = await hltbService.search(title);

      if (searchResults && searchResults.length > 0) {
        // Get the first (most relevant) result
        const game = searchResults[0];

        if (game) {
          const row: HLTBRow = {
            name: game.name,
            imageUrl: game.imageUrl,
            gameplayMain: game.gameplayMain,
            gameplayMainExtra: game.gameplayMainExtra,
            gameplayCompletionist: game.gameplayCompletionist,
            similarity: game.similarity,
            platforms: game.platforms?.join(", "),
          };

          results.push(row);
          console.log(
            `  ✓ Found: ${game.name} (Main: ${game.gameplayMain}h, +Extra: ${game.gameplayMainExtra}h, 100%: ${game.gameplayCompletionist}h)`
          );
        } else {
          console.log(`  ✗ Not found: ${title}`);
          results.push({ name: title });
        }
      } else {
        console.log(`  ✗ Not found: ${title}`);
        results.push({ name: title });
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`  Error searching ${title}:`, error);
      results.push({ name: title });
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
  console.log(`\n✓ Excel file saved: ${filePath}`);
}

function exportToJSON(data: HLTBRow[], filename: string) {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  const filePath = path.join(dataDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`✓ JSON file saved: ${filePath}`);
}

async function main() {
  // Get game titles from command line arguments
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: npm run hltb <game1> <game2> ...");
    console.log("\nExample:");
    console.log('  npm run hltb "The Witcher 3" "Elden Ring" "Hades"');
    console.log("\nOr use a file:");
    console.log("  npm run hltb --file games.txt");
    process.exit(1);
  }

  let gameTitles: string[] = [];

  // Check if using a file
  if (args[0] === "--file" && args[1]) {
    const filePath = path.join(process.cwd(), args[1]);
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    const fileContent = fs.readFileSync(filePath, "utf-8");
    gameTitles = fileContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } else {
    gameTitles = args;
  }

  const results = await searchGames(gameTitles);

  // Export results
  const timestamp = new Date().toISOString().split("T")[0];
  exportToJSON(results, `hltb-search-${timestamp}.json`);
  exportToExcel(results, `hltb-search-${timestamp}.xlsx`);

  // Summary
  const found = results.filter((r) => r.gameplayMain !== undefined).length;
  console.log(`\nSummary: Found ${found}/${gameTitles.length} games`);
}

main().catch(console.error);
