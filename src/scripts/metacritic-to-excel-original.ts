import axios from "axios";
import XLSX from "xlsx";
import path from "path";
import fs from "fs";

// API Config
const API_URL = "https://backend.metacritic.com/finder/metacritic/web";
const PAGE_SIZE = 50;

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

interface GameRow {
  id: number;
  title: string;
  premiereYear: number;
  score: number | null;
  reviewCount: number | null;
  genre: string;
  userScore: number | null;
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

    const gamesPage: GameRow[] = data.items.map((item: any) => ({
      id: item.id,
      title: item.title,
      premiereYear: item.premiereYear,
      score: item.criticScoreSummary?.score ?? null,
      reviewCount: item.criticScoreSummary?.reviewCount ?? null,
      genre: (item.genres || []).map((g: any) => g.name).join(", "),
      userScore: item.userScore?.score ?? null,
    }));

    allGames = [...allGames, ...gamesPage];
    offset += PAGE_SIZE;
  } while (allGames.length < totalResults);

  return allGames;
}

async function main() {
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

    console.log(`📂 Excel saved at: ${outputPath}`);
  } catch (error) {
    console.error("Error fetching or saving data:", error);
  }
}

main();
