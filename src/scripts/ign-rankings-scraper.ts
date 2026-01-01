/**
 * IGN Rankings Scraper
 *
 * Scrapes game rankings from IGN articles using Puppeteer
 * Extracts position and game name from ranked lists
 */

import puppeteer from "puppeteer";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

interface RankingEntry {
  position: number;
  name: string;
}

// Predefined IGN ranking URLs
const IGN_RANKINGS: { [key: string]: string } = {
  ps5: "https://www.ign.com/articles/the-best-ps5-games",
  ps4: "https://www.ign.com/articles/best-ps4-games",
  switch: "https://www.ign.com/articles/best-nintendo-switch-games-2",
  switch2: "https://www.ign.com/articles/the-best-switch-2-games",
  xbox: "https://www.ign.com/articles/best-xbox-series-x-games",
  pc: "https://www.ign.com/articles/best-pc-games",
};

const randomDelay = (min: number, max: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.random() * (max - min) + min)
  );

async function scrapeRanking(
  url: string,
  headless: boolean = true
): Promise<RankingEntry[]> {
  console.log(`\nScraping ranking from: ${url}`);
  console.log("Launching browser...");

  const browser = await puppeteer.launch({
    headless: headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  try {
    console.log("Loading page...");
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    console.log("Page loaded, waiting for content...");
    await randomDelay(3000, 4000);

    // Try to close any popups/cookie banners (don't fail if it doesn't work)
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const closeButtons = buttons.filter((btn) => {
          const text = btn.textContent?.trim().toLowerCase() || "";
          return (
            text.includes("accept") ||
            text.includes("close") ||
            text.includes("dismiss")
          );
        });
        closeButtons.slice(0, 3).forEach((btn) => (btn as HTMLElement).click());
      });
      await randomDelay(1500, 2000);
    } catch (e) {
      // Ignore popup errors
    }

    console.log("Extracting ranking data...");

    const ranking = await page.evaluate(() => {
      const entries: { position: number; name: string }[] = [];

      // Strategy 1: Look for numbered headings (h2, h3) with pattern like "1. Game Name" or "1 - Game Name"
      const headings = Array.from(
        document.querySelectorAll("h2, h3, h4, strong, p")
      );

      headings.forEach((heading) => {
        const text = heading.textContent?.trim() || "";

        // Match patterns like:
        // "1. Game Name"
        // "1 - Game Name"
        // "1: Game Name"
        // "#1 Game Name"
        const match = text.match(/^(?:#|№)?(\d+)[\.\-:\)]\s*(.+)$/);

        if (match) {
          const position = parseInt(match[1] || "0", 10);
          let name = (match[2] || "").trim();

          // Clean up the name more carefully
          // Only remove descriptions after long dashes (–, —) or dash with more than 5 words after it
          name = name
            .replace(/\s*[–—]\s+.*$/, "") // Remove everything after em/en dash
            .replace(/\s*\([^)]{20,}\)/g, "") // Remove long parenthetical content
            .trim();

          if (position > 0 && name.length > 0 && position <= 100) {
            entries.push({ position, name });
          }
        }
      });

      // Strategy 2: If we didn't find much, try looking for ordered lists
      if (entries.length < 5) {
        const orderedLists = document.querySelectorAll("ol");
        orderedLists.forEach((ol) => {
          const items = Array.from(ol.querySelectorAll("li"));
          items.forEach((li, index) => {
            const text = li.textContent?.trim() || "";
            let name = text
              .replace(/^\d+[\.\-:\)]\s*/, "") // Remove leading numbers
              .replace(/\s*[–—]\s+.*$/, "") // Remove everything after em/en dash
              .replace(/\s*\([^)]{20,}\)/g, "") // Remove long parenthetical content
              .trim();

            if (name.length > 0) {
              entries.push({ position: index + 1, name });
            }
          });
        });
      }

      // Strategy 3: Look for article sections that might contain the ranking
      if (entries.length < 5) {
        // Try to find game titles in article content
        // Look for patterns like links to game pages or strong emphasis on game names
        const articleLinks = Array.from(
          document.querySelectorAll('a[href*="/games/"]')
        );
        const gameNames = new Set<string>();

        articleLinks.forEach((link) => {
          const text = link.textContent?.trim() || "";
          // Only consider substantial text (likely game names)
          if (text.length > 3 && text.length < 100 && !text.match(/^(Read|View|More)/i)) {
            gameNames.add(text);
          }
        });

        // Try to find these games with positions in the text
        gameNames.forEach((gameName) => {
          const textNodes = Array.from(document.querySelectorAll("*")).filter(
            (el) => {
              const text = el.textContent || "";
              return text.includes(gameName);
            }
          );

          textNodes.forEach((node) => {
            const fullText = node.textContent?.trim() || "";
            const match = fullText.match(
              new RegExp(`(\\d+)[.:\\-\\)]\\s*${gameName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
            );
            if (match) {
              const position = parseInt(match[1] || "0", 10);
              if (position > 0 && position <= 100) {
                entries.push({ position, name: gameName });
              }
            }
          });
        });
      }

      // Remove duplicates (keep first occurrence)
      const seen = new Set<number>();
      const unique = entries.filter((entry) => {
        if (seen.has(entry.position)) {
          return false;
        }
        seen.add(entry.position);
        return true;
      });

      // Sort by position
      return unique.sort((a, b) => a.position - b.position);
    });

    await browser.close();
    console.log("Browser closed");

    return ranking;
  } catch (error: any) {
    await browser.close();
    console.error("Error scraping:", error.message);
    throw error;
  }
}

function exportToExcel(data: RankingEntry[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Ranking");

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  const filePath = path.join(dataDir, filename);
  XLSX.writeFile(workbook, filePath);
  console.log(`\n✓ Excel file saved: ${filePath}`);
}

function exportToJSON(data: RankingEntry[], filename: string) {
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
    console.log("Usage: npm run ign-rankings [preset|url]");
    console.log("\nPresets:");
    Object.entries(IGN_RANKINGS).forEach(([key, url]) => {
      console.log(`  ${key.padEnd(10)} - ${url}`);
    });
    console.log("\nExamples:");
    console.log("  npm run ign-rankings ps5");
    console.log("  npm run ign-rankings switch");
    console.log('  npm run ign-rankings "https://www.ign.com/articles/..."');
    process.exit(1);
  }

  const visibleMode = args.includes("--visible");
  const input = args.filter((arg) => !arg.startsWith("--"))[0] || "";
  let url: string;
  let label: string;

  // Check if input is a preset or URL
  if (IGN_RANKINGS[input.toLowerCase()]) {
    url = IGN_RANKINGS[input.toLowerCase()] || "";
    label = input.toLowerCase();
  } else if (input.startsWith("http")) {
    url = input;
    label = "custom";
  } else {
    console.error(
      `Unknown preset: ${input}\n\nAvailable presets: ${Object.keys(IGN_RANKINGS).join(", ")}`
    );
    process.exit(1);
  }

  const ranking = await scrapeRanking(url, !visibleMode);

  if (ranking.length === 0) {
    console.log("\n⚠ No ranking entries found!");
    console.log(
      "The page structure might have changed or the URL is incorrect."
    );
    process.exit(1);
  }

  console.log(`\n✓ Found ${ranking.length} games in the ranking\n`);
  console.log("Preview (first 10):");
  ranking.slice(0, 10).forEach((entry) => {
    console.log(`  ${entry.position}. ${entry.name}`);
  });

  if (ranking.length > 10) {
    console.log(`  ... and ${ranking.length - 10} more`);
  }

  const timestamp = new Date().toISOString().split("T")[0];
  exportToJSON(ranking, `ign-${label}-${timestamp}.json`);
  exportToExcel(ranking, `ign-${label}-${timestamp}.xlsx`);

  console.log(`\n✓ Done! Scraped ${ranking.length} games`);
}

main().catch(console.error);
