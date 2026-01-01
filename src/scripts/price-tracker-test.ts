/**
 * Price Tracker Test
 *
 * Tests scraping PSPrices (MX) and CamelCamelCamel
 */

import puppeteer from "puppeteer";

async function testPSPrices(gameName: string) {
  console.log("\n=== Testing PSPrices MX ===");
  console.log(`Searching: ${gameName}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    const searchUrl = `https://psprices.com/region-mx/search/?q=${encodeURIComponent(gameName)}&platform=PS5`;
    console.log(`URL: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForSelector("body", { timeout: 10000 });

    // Screenshot for debug
    await page.screenshot({ path: "data/psprices-test.png" });
    console.log("Screenshot saved: data/psprices-test.png");

    // Try to extract data
    const results = await page.evaluate(() => {
      const items: { name: string; price: string; url: string }[] = [];

      // Try different selectors
      const gameCards = document.querySelectorAll(".game-collection__item, .game-card, [class*='game'], a[href*='/game/']");

      gameCards.forEach((card) => {
        const nameEl = card.querySelector("h3, h4, .title, [class*='title'], [class*='name']");
        const priceEl = card.querySelector("[class*='price'], .price, span[class*='price']");
        const linkEl = card.tagName === "A" ? card : card.querySelector("a");

        if (nameEl) {
          items.push({
            name: nameEl.textContent?.trim() || "",
            price: priceEl?.textContent?.trim() || "N/A",
            url: linkEl?.getAttribute("href") || "",
          });
        }
      });

      return {
        items: items.slice(0, 5),
        html: document.body.innerHTML.slice(0, 2000),
      };
    });

    console.log("\nResults found:", results.items.length);
    results.items.forEach((item, i) => {
      console.log(`${i + 1}. ${item.name} - ${item.price}`);
    });

    if (results.items.length === 0) {
      console.log("\nHTML preview:", results.html.slice(0, 500));
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await browser.close();
  }
}

async function testCamelCamelCamel(gameName: string) {
  console.log("\n=== Testing CamelCamelCamel ===");
  console.log(`Searching: ${gameName}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    const searchUrl = `https://camelcamelcamel.com/search?sq=${encodeURIComponent(gameName)}`;
    console.log(`URL: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForSelector("body", { timeout: 10000 });

    // Screenshot for debug
    await page.screenshot({ path: "data/camel-test.png" });
    console.log("Screenshot saved: data/camel-test.png");

    // Try to extract data
    const results = await page.evaluate(() => {
      const items: { name: string; price: string; lowest: string; url: string }[] = [];

      const rows = document.querySelectorAll("tr.product, .product-row, table tr");

      rows.forEach((row) => {
        const nameEl = row.querySelector("a, .title, td:first-child");
        const priceEl = row.querySelector(".price, td:nth-child(2)");
        const lowestEl = row.querySelector(".lowest, td:nth-child(3)");

        const name = nameEl?.textContent?.trim() || "";
        if (name && name.length > 5) {
          items.push({
            name,
            price: priceEl?.textContent?.trim() || "N/A",
            lowest: lowestEl?.textContent?.trim() || "N/A",
            url: nameEl?.getAttribute("href") || "",
          });
        }
      });

      return {
        items: items.slice(0, 5),
        html: document.body.innerHTML.slice(0, 2000),
      };
    });

    console.log("\nResults found:", results.items.length);
    results.items.forEach((item, i) => {
      console.log(`${i + 1}. ${item.name}`);
      console.log(`   Price: ${item.price} | Lowest: ${item.lowest}`);
    });

    if (results.items.length === 0) {
      console.log("\nHTML preview:", results.html.slice(0, 500));
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await browser.close();
  }
}

async function main() {
  const game = process.argv[2] || "Elden Ring";

  await testPSPrices(game);
  await testCamelCamelCamel(game);
}

main().catch(console.error);
