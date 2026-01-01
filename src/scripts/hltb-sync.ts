/**
 * HowLongToBeat Sync Script
 *
 * Reads an Excel file with pending games, searches HLTB, and updates the same file.
 * Features:
 * - 30 second timeout per game
 * - Auto-save progress every 5 games
 * - Graceful handling of stuck searches
 */

import puppeteer, { Page, Browser } from "puppeteer";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

interface GameRow {
  game_id: string;
  title: string;
  hltb_sync_mode: string;
  hltb_id: string;
  hltb_main_hours: number | string;
  hltb_main_extra_hours: number | string;
  hltb_completionist_hours: number | string;
  hltb_source_url: string;
  hltb_updated_at: string;
  hltb_needs_review: boolean | string;
}

interface HLTBResult {
  id: string;
  name: string;
  main: number;
  mainExtra: number;
  completionist: number;
  url: string;
}

const SEARCH_TIMEOUT = 20000; // 20 seconds max per game
const SAVE_INTERVAL = 10; // Save progress every N games

const randomDelay = (min: number, max: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.random() * (max - min) + min)
  );

let searchStartTime = 0;
const logTime = (label: string) => {
  const elapsed = Date.now() - searchStartTime;
  console.log(`    ⏱️  ${label}: ${elapsed}ms`);
};

// Wrap search with timeout
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function searchGame(
  page: Page,
  gameName: string
): Promise<HLTBResult | null> {
  try {
    const searchUrl = `https://howlongtobeat.com/?q=${encodeURIComponent(gameName)}`;
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    logTime("page loaded");

    await randomDelay(500, 800);

    // Close cookie popup
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const acceptButton = buttons.find((btn) =>
        btn.textContent?.trim().toLowerCase().includes("accept")
      );
      if (acceptButton) {
        (acceptButton as HTMLElement).click();
      }
    });
    await randomDelay(200, 400);
    logTime("cookie handled");

    const results = await page.evaluate(() => {
      const allLis = Array.from(document.querySelectorAll("li"));

      const gameCards = allLis.filter((li) => {
        const hasImage = li.querySelector("img");
        const text = li.textContent || "";
        const hasHours = text.includes("Hours") || text.includes("Mins");
        return hasImage && hasHours;
      });

      return gameCards.slice(0, 10).map((card) => {
        const links = Array.from(card.querySelectorAll("a"));
        const nameLink = links.find((link) => {
          const text = link.textContent?.trim() || "";
          return text.length > 2 && !text.toLowerCase().includes("view");
        });
        const name = nameLink?.textContent?.trim() || "";

        const gameUrl = nameLink?.getAttribute("href") || "";
        const idMatch = gameUrl.match(/\/game[\/\?](\d+)/);
        const gameId = idMatch ? idMatch[1] || "" : "";
        const fullUrl = gameUrl ? `https://howlongtobeat.com${gameUrl}` : "";

        const allText = card.textContent || "";

        let main = 0;
        let mainExtra = 0;
        let completionist = 0;

        const allHours = Array.from(
          allText.matchAll(/(\d+(?:½|\.5)?)\s*Hours?/gi)
        ).map((m) => parseFloat(m[1]?.replace("½", ".5") || "0"));

        if (allHours.length >= 1) main = allHours[0] ?? 0;
        if (allHours.length >= 2) mainExtra = allHours[1] ?? 0;
        if (allHours.length >= 3) completionist = allHours[2] ?? 0;

        return { id: gameId, name, url: fullUrl, main, mainExtra, completionist };
      });
    });

    const result = results.find((r) => r.name && r.name.length > 0);

    logTime("data extracted");

    if (result && result.name) {
      return {
        name: result.name,
        id: result.id,
        url: result.url,
        main: result.main,
        mainExtra: result.mainExtra,
        completionist: result.completionist,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function searchWithTimeout(
  page: Page,
  gameName: string
): Promise<HLTBResult | null> {
  console.log(`\n🔍 Searching: ${gameName}...`);
  searchStartTime = Date.now();

  const result = await withTimeout(
    searchGame(page, gameName),
    SEARCH_TIMEOUT,
    null
  );

  const totalTime = Date.now() - searchStartTime;
  if (result) {
    console.log(`  ✓ Found: ${result.name} (${totalTime}ms total)`);
    console.log(`    Main: ${result.main}h | Extra: ${result.mainExtra}h | Complete: ${result.completionist}h`);
  } else {
    console.log(`  ✗ Not found or timeout: ${gameName} (${totalTime}ms)`);
  }

  return result;
}

function saveProgress(workbook: XLSX.WorkBook, rows: GameRow[], sheetName: string, filePath: string) {
  const newWorksheet = XLSX.utils.json_to_sheet(rows);
  workbook.Sheets[sheetName] = newWorksheet;
  XLSX.writeFile(workbook, filePath);
}

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args[0] ?? "data/hltb_sync.xlsx";
  const filePath = path.isAbsolute(inputFile)
    ? inputFile
    : path.join(process.cwd(), inputFile);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`📂 Reading: ${filePath}`);

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    console.error("❌ No sheets found in workbook");
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

  const pendingGames = rows.filter((row) => row.hltb_sync_mode === "pending");
  console.log(`⏳ Pending games: ${pendingGames.length}`);

  if (pendingGames.length === 0) {
    console.log("✅ No pending games to sync");
    process.exit(0);
  }

  console.log(`\n⚙️  Settings: ${SEARCH_TIMEOUT / 1000}s timeout, save every ${SAVE_INTERVAL} games`);
  console.log("\n🌐 Launching browser...");

  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 60000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  const now = new Date().toISOString();
  let foundCount = 0;
  let processedCount = 0;

  // Handle graceful shutdown
  let interrupted = false;
  process.on("SIGINT", () => {
    console.log("\n\n⚠️  Interrupted! Saving progress...");
    interrupted = true;
  });

  for (const game of pendingGames) {
    if (interrupted) break;

    try {
      const result = await searchWithTimeout(page, game.title);

      const rowIndex = rows.findIndex((r) => r.game_id === game.game_id);
      const row = rows[rowIndex];
      if (rowIndex !== -1 && row) {
        if (result) {
          row.hltb_id = result.id;
          row.hltb_main_hours = result.main;
          row.hltb_main_extra_hours = result.mainExtra;
          row.hltb_completionist_hours = result.completionist;
          row.hltb_source_url = result.url;
          row.hltb_updated_at = now;
          row.hltb_sync_mode = "synced";
          row.hltb_needs_review = false;
          foundCount++;
        } else {
          row.hltb_sync_mode = "not_found";
          row.hltb_updated_at = now;
          row.hltb_needs_review = true;
        }
      }

      processedCount++;
    } catch (err) {
      console.log(`  ⚠️ Error processing ${game.title}, skipping...`);
      const rowIndex = rows.findIndex((r) => r.game_id === game.game_id);
      const row = rows[rowIndex];
      if (rowIndex !== -1 && row) {
        row.hltb_sync_mode = "error";
        row.hltb_updated_at = now;
        row.hltb_needs_review = true;
      }
      processedCount++;
    }

    // Auto-save progress
    if (processedCount % SAVE_INTERVAL === 0) {
      console.log(`\n💾 Auto-saving progress (${processedCount}/${pendingGames.length})...`);
      saveProgress(workbook, rows, sheetName, filePath);
    }

    await randomDelay(400, 800);
  }

  await browser.close();
  console.log("\n🌐 Browser closed");

  // Final save
  saveProgress(workbook, rows, sheetName, filePath);

  console.log(`\n✅ Updated: ${filePath}`);
  console.log(`📊 Summary: Found ${foundCount}/${processedCount} games processed`);

  if (interrupted) {
    const remaining = pendingGames.length - processedCount;
    console.log(`⚠️  ${remaining} games remaining (run again to continue)`);
  }
}

main().catch(console.error);
