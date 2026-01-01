import axios from "axios";
import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { GameRow, GameDetailResponse } from "./types";

// Import sorting order from constants
const sortingOrder = [
  "playstation-5",
  "nintendo-switch-2",
  "xbox-series-x",
  "pc",
  "nintendo-switch",
  "xbox-one",
  "playstation-4",
  "wii-u",
  "3ds",
  "playstation-vita",
];

// API Config
const API_URL = "https://backend.metacritic.com/finder/metacritic/web";
const GAME_DETAIL_URL = "https://backend.metacritic.com/games/metacritic";
const PAGE_SIZE = 50;
const CONCURRENCY = 4; // Number of simultaneous API calls for game details

// Rate limiting config
const DELAY_BETWEEN_MAIN_CALLS = 500; // ms between pagination requests
const DELAY_BETWEEN_CHUNKS = 500; // ms between chunks of detail requests
const DELAY_PER_DETAIL_REQUEST = 200; // ms before each detail request

// Headers necesarios para la API
const HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "es,en-US;q=0.9,en;q=0.8,it;q=0.7,fr;q=0.6",
  "cache-control": "no-cache",
  origin: "https://www.metacritic.com",
  pragma: "no-cache",
  priority: "u=1, i",
  referer: "https://www.metacritic.com/",
  "sec-ch-ua":
    '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Linux"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
};

async function fetchGameDetails(slug: string): Promise<Partial<GameRow>> {
  try {
    // Add small delay before each detail request
    await new Promise((resolve) =>
      setTimeout(resolve, DELAY_PER_DETAIL_REQUEST)
    );

    const res = await axios.get(`${GAME_DETAIL_URL}/${slug}/web`, {
      headers: HEADERS,
      params: {
        componentName: "product",
        componentDisplayName: "Product",
        componentType: "Product",
      },
    });

    console.log("Raw server response:", JSON.stringify(res.data, null, 2));
    throw new Error("test");

    const data = res.data?.data?.item;
    if (!data) return {};

    // Extract production companies
    const production = data.production?.companies || [];
    const developer =
      production.find((c: any) => c.typeName === "Developer")?.name || "";

    // Get platform slugs as comma-separated string, sorted by sorting order
    const platforms = data.platforms || [];
    const sortedPlatforms = [...platforms].sort((a, b) => {
      const aIndex = sortingOrder.indexOf(a.slug);
      const bIndex = sortingOrder.indexOf(b.slug);

      // If both platforms are in the sorting order, sort by their position
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }

      // If only one is in the sorting order, prioritize it
      if (aIndex !== -1 && bIndex === -1) return -1;
      if (aIndex === -1 && bIndex !== -1) return 1;

      // If neither is in the sorting order, maintain original order
      return 0;
    });
    const platformSlugs = sortedPlatforms.map((p: any) => p.slug).join(", ");

    // Create console availability object
    const consoleAvailability: Record<string, number> = {
      "playstation-5": 0,
      "nintendo-switch-2": 0,
      "xbox-series-x": 0,
      pc: 0,
      "nintendo-switch": 0,
      "xbox-one": 0,
      "playstation-4": 0,
      "wii-u": 0,
      "3ds": 0,
      "playstation-vita": 0,
    };

    // Set 100 for available consoles
    platforms.forEach((platform: any) => {
      if (consoleAvailability.hasOwnProperty(platform.slug)) {
        consoleAvailability[platform.slug] = 100;
      }
    });

    // Get franchise from gameTaxonomy
    const franchises = data.gameTaxonomy?.franchises || [];
    const franchise = franchises.map((f: any) => f.name).join(", ");

    return {
      franchise,
      developer,
      platforms: platformSlugs,
      empty1: "",
      criticScore: data.criticScoreSummary?.score ?? null,
      criticReviewCount: data.criticScoreSummary?.reviewCount ?? null,
      awards: "",
      empty2: "",
      HLTB: "",
      status: "",
      priority: "",
      available: "",
      rating: "",
      empty3: "",
      started: "",
      ended: "",
      elapsedTime: "",
      empty4: "",
      ...consoleAvailability,
      empty5: "",
      mustPlay: data.mustPlay ?? false,
      Suggested:
        (data.criticScoreSummary?.score ?? 0) >= 85 &&
        (data.criticScoreSummary?.reviewCount ?? 0) >= 30,
    };
  } catch (error) {
    console.log(`⚠️  Failed to fetch details for ${slug}: ${error}`);
    return {};
  }
}

async function fetchGames(
  yearMin: number,
  yearMax: number
): Promise<GameRow[]> {
  let allGames: GameRow[] = [];
  let offset = 0;
  let totalResults = 0;

  do {
    console.log(`📡 Fetching games: offset=${offset}...`);

    // Add delay between main API calls
    if (offset > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, DELAY_BETWEEN_MAIN_CALLS)
      );
    }

    const res = await axios.get(API_URL, {
      headers: HEADERS,
      params: {
        sortBy: "-metaScore",
        productType: "games",
        page: 1,
        releaseYearMin: yearMin,
        releaseYearMax: yearMax,
        lastTouchedInput: "releaseYearMin",
        offset,
        limit: PAGE_SIZE,
        apiKey: "1MOZgmNFxvmljaQR1X9KAij9Mo4xAY3u4",
      },
    });

    const data = res.data.data;
    if (!data || !Array.isArray(data.items)) {
      console.log("❌ No more data found.");
      break;
    }

    if (offset === 0) totalResults = data.totalResults || 0;

    // Process games with basic info first
    const gamesPage: GameRow[] = data.items.map((item: any) => ({
      // general info
      title: item.title,
      premiereYear: item.premiereYear,
      genre: (item.genres || []).map((g: any) => g.name).join(", "),
      franchise: "",
      developer: "",
      platforms: "",
      empty1: "",
      // critic info
      criticScore: item.criticScoreSummary?.score ?? null,
      criticReviewCount: item.criticScoreSummary?.reviewCount ?? null,
      userScore: item.userScore?.score ?? null,
      awards: "",
      empty2: "",
      // status info
      HLTB: "",
      status: "",
      priority: "",
      available: "",
      rating: "",
      empty3: "",
      // played info
      started: "",
      ended: "",
      elapsedTime: "",
      empty4: "",
      // consoles info
      "playstation-5": 0,
      "nintendo-switch-2": 0,
      "xbox-series-x": 0,
      pc: 0,
      "nintendo-switch": 0,
      "xbox-one": 0,
      "playstation-4": 0,
      "wii-u": 0,
      "3ds": 0,
      "playstation-vita": 0,
      empty5: "",
      // other info
      slug: item.slug || "",
      mustPlay: item.mustPlay ?? false,
      Suggested:
        (item.criticScoreSummary?.score ?? 0) >= 85 &&
        (item.criticScoreSummary?.reviewCount ?? 0) >= 30,
    }));

    // Fetch detailed info for each game with controlled concurrency
    console.log(`🔍 Fetching details for ${gamesPage.length} games...`);

    const concurrency = CONCURRENCY; // Number of simultaneous requests
    const chunks = [];

    for (let i = 0; i < gamesPage.length; i += concurrency) {
      chunks.push(gamesPage.slice(i, i + concurrency));
    }

    // Process only the first game
    if (gamesPage.length > 0 && gamesPage[0]?.slug) {
      console.log(`  📋 1/1: ${gamesPage[0].title}`);
      const details = await fetchGameDetails(gamesPage[0].slug);
      gamesPage[0] = { ...gamesPage[0], ...details } as GameRow;

      // Return early with just the first game
      return [gamesPage[0]];
    }

    allGames = [...allGames, ...gamesPage];
    offset += PAGE_SIZE;
  } while (allGames.length < totalResults);

  return allGames;
}

async function main() {
  const startTime = Date.now();
  try {
    const args = process.argv.slice(2);

    const yearMin = parseInt(args[0] ?? "", 10) || new Date().getFullYear();
    const yearMax = parseInt(args[1] ?? "", 10) || yearMin;

    console.log(`📅 Fetching games from ${yearMin} to ${yearMax}`);

    const games = await fetchGames(yearMin, yearMax);

    console.log(`✅ Fetched ${games.length} games.`);

    const dataDir = path.resolve(__dirname, "../../data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const worksheet = XLSX.utils.json_to_sheet(games);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      `Games ${yearMin}-${yearMax}`
    );

    const outputPath = path.join(
      dataDir,
      `metacritic-${yearMin}-${yearMax}.xlsx`
    );
    XLSX.writeFile(workbook, outputPath);

    // Save JSON output
    const jsonOutputPath = path.join(
      dataDir,
      `metacritic-${yearMin}-${yearMax}.json`
    );
    fs.writeFileSync(jsonOutputPath, JSON.stringify(games, null, 2));

    const endTime = Date.now();
    const elapsedTime = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`📂 Excel saved at: ${outputPath}`);
    console.log(`📄 JSON saved at: ${jsonOutputPath}`);
    console.log(`⏱️  Total elapsed time: ${elapsedTime} seconds`);
  } catch (error) {
    console.error("Error fetching or saving data:", error);
  }
}

main();
