/**
 * HowLongToBeat Direct API Script
 *
 * This version makes direct API calls to HowLongToBeat with custom headers
 * to try to avoid 403 errors.
 */

import axios from "axios";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

interface HLTBResult {
  game_id: number;
  game_name: string;
  game_image: string;
  comp_main: number;
  comp_plus: number;
  comp_100: number;
  comp_all: number;
  profile_platform?: string;
}

interface HLTBRow {
  id: number;
  name: string;
  imageUrl?: string;
  gameplayMain?: number;
  gameplayMainExtra?: number;
  gameplayCompletionist?: number;
  platforms?: string;
}

const HLTB_SEARCH_URL = "https://howlongtobeat.com/api/search";

// More realistic headers
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Content-Type": "application/json",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Origin: "https://howlongtobeat.com",
  Referer: "https://howlongtobeat.com",
  "Sec-Ch-Ua":
    '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

async function searchGame(gameName: string): Promise<HLTBRow | null> {
  try {
    console.log(`Searching: ${gameName}...`);

    const payload = {
      searchType: "games",
      searchTerms: [gameName],
      searchPage: 1,
      size: 20,
      searchOptions: {
        games: {
          userId: 0,
          platform: "",
          sortCategory: "popular",
          rangeCategory: "main",
          rangeTime: {
            min: null,
            max: null,
          },
          gameplay: {
            perspective: "",
            flow: "",
            genre: "",
          },
          rangeYear: {
            min: "",
            max: "",
          },
          modifier: "",
        },
        users: {
          sortCategory: "postcount",
        },
        filter: "",
        sort: 0,
        randomizer: 0,
      },
    };

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const response = await axios.post(HLTB_SEARCH_URL, payload, {
      headers: HEADERS,
      timeout: 30000,
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      const game: HLTBResult = response.data.data[0];

      const result: HLTBRow = {
        id: game.game_id,
        name: game.game_name,
        ...(game.game_image && {
          imageUrl: `https://howlongtobeat.com/games/${game.game_image}`,
        }),
        gameplayMain: game.comp_main / 3600, // Convert seconds to hours
        gameplayMainExtra: game.comp_plus / 3600,
        gameplayCompletionist: game.comp_100 / 3600,
        ...(game.profile_platform && { platforms: game.profile_platform }),
      };

      console.log(
        `  ✓ Found: ${result.name} (Main: ${result.gameplayMain?.toFixed(1)}h, +Extra: ${result.gameplayMainExtra?.toFixed(1)}h, 100%: ${result.gameplayCompletionist?.toFixed(1)}h)`
      );
      return result;
    } else {
      console.log(`  ✗ Not found: ${gameName}`);
      return null;
    }
  } catch (error: any) {
    if (error.response) {
      console.error(
        `  ✗ Error ${error.response.status}: ${error.response.statusText}`
      );
      if (error.response.status === 403) {
        console.error(
          "  ⚠ Blocked by server (403). Try again later or use VPN."
        );
      }
    } else {
      console.error(`  ✗ Error: ${error.message}`);
    }
    return null;
  }
}

async function searchGames(gameTitles: string[]): Promise<HLTBRow[]> {
  const results: HLTBRow[] = [];

  console.log(
    `Searching for ${gameTitles.length} games on HowLongToBeat...\n`
  );

  for (const title of gameTitles) {
    const result = await searchGame(title);
    if (result) {
      results.push(result);
    } else {
      results.push({
        id: 0,
        name: title,
      });
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
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: npm run hltb-direct <game1> <game2> ...");
    console.log("\nExample:");
    console.log('  npm run hltb-direct "The Witcher 3" "Elden Ring" "Hades"');
    console.log("\nOr use a file:");
    console.log("  npm run hltb-direct --file games.txt");
    process.exit(1);
  }

  let gameTitles: string[] = [];

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

  const timestamp = new Date().toISOString().split("T")[0];
  exportToJSON(results, `hltb-direct-${timestamp}.json`);
  exportToExcel(results, `hltb-direct-${timestamp}.xlsx`);

  const found = results.filter((r) => r.id !== 0).length;
  console.log(`\nSummary: Found ${found}/${gameTitles.length} games`);
}

main().catch(console.error);
