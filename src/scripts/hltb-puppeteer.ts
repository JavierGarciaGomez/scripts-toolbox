/**
 * HowLongToBeat Puppeteer Script
 *
 * Uses a real Chrome browser to scrape HowLongToBeat, simulating human behavior
 * to avoid detection and blocking.
 */

import puppeteer, { Browser, Page } from "puppeteer";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

interface HLTBResult {
  id?: string;
  name: string;
  imageUrl?: string;
  main?: number;
  mainExtra?: number;
  completionist?: number;
  platforms?: string;
  url?: string;
}

// Random delay to simulate human behavior
const randomDelay = (min: number, max: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.random() * (max - min) + min)
  );

async function searchGame(
  page: Page,
  gameName: string
): Promise<HLTBResult | null> {
  try {
    console.log(`\nSearching: ${gameName}...`);

    // Go directly to search URL
    const searchUrl = `https://howlongtobeat.com/?q=${encodeURIComponent(gameName)}`;
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded", // Faster than networkidle0
      timeout: 60000,
    });

    // Wait for page to load (reduced)
    await randomDelay(1000, 1500);

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
    await randomDelay(500, 1000);

    // Try to find the first result
    try {
      // Wait for results (reduced)
      await randomDelay(1000, 1500);

      // Extract data from ALL results on the page
      const results = await page.evaluate(() => {
        // Find all game cards - they're in list items
        const allLis = Array.from(document.querySelectorAll("li"));

        // Filter to only game cards (have images and hours)
        const gameCards = allLis.filter((li) => {
          const hasImage = li.querySelector("img");
          const text = li.textContent || "";
          const hasHours = text.includes("Hours") || text.includes("Mins");
          return hasImage && hasHours;
        });

        return gameCards.slice(0, 10).map((card) => {
          // Get name from the first substantial link
          const links = Array.from(card.querySelectorAll("a"));
          const nameLink = links.find((link) => {
            const text = link.textContent?.trim() || "";
            return text.length > 2 && !text.toLowerCase().includes("view");
          });
          const name = nameLink?.textContent?.trim() || "";

          // Get game URL and extract ID
          const gameUrl = nameLink?.getAttribute("href") || "";
          const idMatch = gameUrl.match(/\/game[\/\?](\d+)/);
          const gameId = idMatch ? idMatch[1] : "";
          const fullUrl = gameUrl ? `https://howlongtobeat.com${gameUrl}` : "";

          // Get image
          const img = card.querySelector("img");
          const imageUrl = img?.src || "";

          // Get all text
          const allText = card.textContent || "";

          // Extract times using simpler regex
          let main = 0;
          let mainExtra = 0;
          let completionist = 0;

          // Split by common separators to find time sections
          const sections = allText.split(/\n|\|/);

          // Look for all hour numbers
          const allHours = Array.from(allText.matchAll(/(\d+(?:½|\.5)?)\s*Hours?/gi)).map(
            (m) => parseFloat(m[1]?.replace("½", ".5") || "0")
          );

          // Use heuristics: typically main is first, extra is second, completionist is third
          if (allHours.length >= 1) main = allHours[0] || 0;
          if (allHours.length >= 2) mainExtra = allHours[1] || 0;
          if (allHours.length >= 3) completionist = allHours[2] || 0;

          return {
            id: gameId,
            name,
            url: fullUrl,
            imageUrl,
            platforms: "",
            main,
            mainExtra,
            completionist,
          };
        });
      });

      // Return the first valid result
      const result = results.find((r) => r.name && r.name.length > 0);

      if (result && result.name) {
        console.log(`  ✓ Found: ${result.name}`);
        if (result.id) console.log(`    ID: ${result.id}`);
        if (result.url) console.log(`    URL: ${result.url}`);
        console.log(`    Main: ${result.main}h`);
        console.log(`    Main+Extra: ${result.mainExtra}h`);
        console.log(`    Completionist: ${result.completionist}h`);

        const finalResult: HLTBResult = {
          name: result.name,
        };

        if (result.id) finalResult.id = result.id;
        if (result.url) finalResult.url = result.url;
        if (result.imageUrl) finalResult.imageUrl = result.imageUrl;
        if (result.main > 0) finalResult.main = result.main;
        if (result.mainExtra > 0) finalResult.mainExtra = result.mainExtra;
        if (result.completionist > 0)
          finalResult.completionist = result.completionist;
        if (result.platforms) finalResult.platforms = result.platforms;

        return finalResult;
      } else {
        console.log(`  ✗ Not found: ${gameName}`);
        return null;
      }
    } catch (error) {
      console.log(`  ✗ No results found for: ${gameName}`);
      return null;
    }
  } catch (error: any) {
    console.error(`  ✗ Error searching ${gameName}:`, error.message);
    return null;
  }
}

async function searchGames(gameTitles: string[]): Promise<HLTBResult[]> {
  console.log(`Starting HowLongToBeat search for ${gameTitles.length} games\n`);
  console.log("Launching browser...");

  const browser = await puppeteer.launch({
    headless: true, // Hide browser
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const page = await browser.newPage();

  // Set realistic viewport
  await page.setViewport({ width: 1920, height: 1080 });

  // Set user agent
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  const results: HLTBResult[] = [];

  for (const title of gameTitles) {
    let result = await searchGame(page, title);

    // Retry if failed (up to 2 more times)
    if (!result) {
      console.log(`  Retrying: ${title}...`);
      await randomDelay(2000, 3000); // Wait a bit longer before retry
      result = await searchGame(page, title);

      if (!result) {
        console.log(`  Retrying (2nd attempt): ${title}...`);
        await randomDelay(2000, 3000);
        result = await searchGame(page, title);
      }
    }

    if (result) {
      results.push(result);
    } else {
      console.log(`  ✗ Failed after 3 attempts: ${title}`);
      results.push({ name: title });
    }

    // Small delay between searches
    if (gameTitles.indexOf(title) < gameTitles.length - 1) {
      await randomDelay(1000, 2000);
    }
  }

  await browser.close();
  console.log("\nBrowser closed");

  return results;
}

function exportToExcel(data: HLTBResult[], filename: string) {
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

function exportToJSON(data: HLTBResult[], filename: string) {
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
    console.log("Usage: npm run hltb-auto <game1> <game2> ...");
    console.log("\nExample:");
    console.log('  npm run hltb-auto "Hades" "Elden Ring" "Hollow Knight"');
    console.log("\nOr use a file:");
    console.log("  npm run hltb-auto --file games.txt");
    console.log("\nOptions:");
    console.log("  --visible    Show browser window (for debugging)");
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
    gameTitles = args.filter((arg) => !arg.startsWith("--"));
  }

  if (gameTitles.length === 0) {
    console.error("No games specified");
    process.exit(1);
  }

  const results = await searchGames(gameTitles);

  const timestamp = new Date().toISOString().split("T")[0];
  exportToJSON(results, `hltb-auto-${timestamp}.json`);
  exportToExcel(results, `hltb-auto-${timestamp}.xlsx`);

  const found = results.filter((r) => r.main !== undefined).length;
  console.log(`\n✓ Summary: Found ${found}/${gameTitles.length} games`);
}

main().catch(console.error);
