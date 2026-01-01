# Scripts Toolbox

A collection of utility scripts for web scraping, data processing, and automation tasks.

## Overview

This is a miscellaneous project containing various TypeScript scripts for different purposes:
- Web scraping (Metacritic, IGN, HowLongToBeat)
- Data conversion (JSON to Excel)
- Game data processing and matching
- Payroll summary processing

## Installation

```bash
npm install
# or
yarn install
```

## Available Scripts

### 🎮 Game Data Scripts

#### Metacritic Scraper
Fetch game data from Metacritic API and export to Excel/JSON.

```bash
# Fetch games from current year
npm run scrape

# Fetch games from specific year
npm run scrape 2024

# Fetch games from year range with slow mode
npm run scrape 2020 2024 --slow

# Resume interrupted scraping
npm run scrape 2024 --resume
```

**Options:**
- `--slow` - Longer delays to avoid rate limiting
- `--max=N` - Limit number of games to fetch
- `--resume` - Continue from last saved progress

**Output:** `metacritic-YYYY-YYYY.xlsx` and `.json` files in `data/` folder

#### HowLongToBeat Search
Automated game completion time lookup using Puppeteer.

```bash
# Search single game
npm run hltb-auto "Hades"

# Search multiple games
npm run hltb-auto "Hades" "Celeste" "Portal"

# Import from CSV (fallback method)
npm run hltb-csv data/hltb-example.csv
npm run hltb-csv --example  # Generate example CSV
```

**Output:** Times for Main Story, Main + Extra, and Completionist runs

#### Game Slug Matcher
Match game titles with their slugs for API queries.

```bash
npm run slug-matcher
```

#### IGN Rankings Scraper
Scrape IGN game rankings and reviews.

```bash
npm run ign-rankings
```

#### CEX Search
Search for game prices and availability.

```bash
npm run cex-search
```

#### HLTB Sync
Synchronize HowLongToBeat data with existing game databases.

```bash
npm run hltb-sync
```

### 📊 Data Processing Scripts

#### JSON to Excel Converter
Convert JSON files to Excel format.

```bash
npm run json-to-excel <input.json>
```

#### Payroll Summary
Process payroll summary files.

```bash
npm run payroll-summary
```

## Project Structure

```
scripts-toolbox/
├── src/
│   └── scripts/
│       ├── metacritic-to-excel.ts          # Metacritic scraper
│       ├── hltb-puppeteer.ts               # HLTB automated search
│       ├── hltb-from-csv.ts                # HLTB CSV import
│       ├── hltb-sync.ts                    # HLTB data sync
│       ├── ign-rankings-scraper.ts         # IGN rankings
│       ├── cex-search.ts                   # CEX price search
│       ├── game-slug-matcher.ts            # Game slug matching
│       ├── json-to-excel.ts                # JSON converter
│       ├── types.ts                        # Shared types
│       └── payroll-summary/
│           └── process-payroll-summary.ts  # Payroll processing
├── data/                                   # Output folder (gitignored)
├── dist/                                   # Compiled TypeScript
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

- **axios** - HTTP client for API requests
- **xlsx** - Excel file generation
- **puppeteer** - Browser automation for web scraping
- **howlongtobeat** - HLTB API library
- **string-similarity** - String matching utilities
- **TypeScript** - Type-safe development

## Adding New Scripts

1. Create new file in `src/scripts/your-script.ts`
2. Add npm script in `package.json`:
   ```json
   "your-script": "ts-node src/scripts/your-script.ts"
   ```
3. Follow existing patterns: types, error handling, data export
4. Update this README if the script is relevant for others

## Tips

### Rate Limiting
If you get 403 errors when scraping:
- Use `--slow` flag for longer delays
- Limit requests with `--max=N`
- Wait and use `--resume` to continue
- Try different IP addresses (VPN)

### Data Output
All scripts export to the `data/` folder:
- Excel files (`.xlsx`) for easy viewing
- JSON files (`.json`) for programmatic access
- Progress files for resume functionality

## License

MIT
