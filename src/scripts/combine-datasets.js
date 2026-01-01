#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Configuration
const DATA_DIR = path.resolve(__dirname, "../../data");
const OUTPUT_FILE = path.join(DATA_DIR, "metacritic-complete-dataset.json");
const OUTPUT_EXCEL = path.join(DATA_DIR, "metacritic-complete-dataset.xlsx");

console.log("🔗 Combining Metacritic datasets...");

// Get all JSON files in the data directory
const files = fs
  .readdirSync(DATA_DIR)
  .filter((file) => file.startsWith("metacritic-") && file.endsWith(".json"))
  .filter((file) => !file.includes("complete")) // Exclude our output file
  .sort();

console.log(`📁 Found ${files.length} files to combine`);

let allGames = [];
const seenTitles = new Set();

files.forEach((file, index) => {
  console.log(`📄 Processing ${file} (${index + 1}/${files.length})`);

  try {
    const filePath = path.join(DATA_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    // Filter out duplicates based on title and year
    const newGames = data.filter((game) => {
      const key = `${game.title}-${game.premiereYear}`;
      if (seenTitles.has(key)) {
        return false;
      }
      seenTitles.add(key);
      return true;
    });

    allGames.push(...newGames);
    console.log(
      `  ✅ Added ${newGames.length} unique games (${
        data.length - newGames.length
      } duplicates skipped)`
    );
  } catch (error) {
    console.log(`  ⚠️  Error processing ${file}: ${error.message}`);
  }
});

// Sort by year, then by critic score (descending)
allGames.sort((a, b) => {
  if (a.premiereYear !== b.premiereYear) {
    return b.premiereYear - a.premiereYear; // Newer years first
  }
  return (b.criticScore || 0) - (a.criticScore || 0); // Higher scores first
});

console.log(`\n📊 Final dataset: ${allGames.length} unique games`);
console.log(
  `📅 Year range: ${Math.min(
    ...allGames.map((g) => g.premiereYear)
  )} - ${Math.max(...allGames.map((g) => g.premiereYear))}`
);

// Save combined JSON
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allGames, null, 2));
console.log(`💾 Combined JSON saved: ${OUTPUT_FILE}`);

// Generate Excel file if xlsx is available
try {
  const XLSX = require("xlsx");

  const worksheet = XLSX.utils.json_to_sheet(allGames);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Complete Dataset");
  XLSX.writeFile(workbook, OUTPUT_EXCEL);

  console.log(`📊 Excel file saved: ${OUTPUT_EXCEL}`);
} catch (error) {
  console.log("⚠️  Could not generate Excel file (xlsx package not available)");
}

// Generate summary statistics
const stats = {
  totalGames: allGames.length,
  yearRange: {
    min: Math.min(...allGames.map((g) => g.premiereYear)),
    max: Math.max(...allGames.map((g) => g.premiereYear)),
  },
  gamesByYear: {},
  averageCriticScore: 0,
  gamesWithScores: 0,
};

allGames.forEach((game) => {
  const year = game.premiereYear;
  stats.gamesByYear[year] = (stats.gamesByYear[year] || 0) + 1;

  if (game.criticScore) {
    stats.averageCriticScore += game.criticScore;
    stats.gamesWithScores++;
  }
});

if (stats.gamesWithScores > 0) {
  stats.averageCriticScore =
    Math.round((stats.averageCriticScore / stats.gamesWithScores) * 100) / 100;
}

console.log("\n📈 Dataset Statistics:");
console.log(`  Total games: ${stats.totalGames}`);
console.log(`  Year range: ${stats.yearRange.min} - ${stats.yearRange.max}`);
console.log(`  Average critic score: ${stats.averageCriticScore}`);
console.log(`  Games with critic scores: ${stats.gamesWithScores}`);

// Show top 10 years by game count
const topYears = Object.entries(stats.gamesByYear)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 10);

console.log("\n🏆 Top 10 years by game count:");
topYears.forEach(([year, count]) => {
  console.log(`  ${year}: ${count} games`);
});

console.log("\n✅ Dataset combination complete!");
