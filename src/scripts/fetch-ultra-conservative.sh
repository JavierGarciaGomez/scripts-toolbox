#!/bin/bash

# Ultra-Conservative Large Dataset Fetcher
# This script uses the most conservative settings possible to avoid any rate limiting

set -e

# Default values
YEAR_MIN=${1:-1970}
YEAR_MAX=${2:-2025}
BATCH_SIZE=500  # Smaller batches
DELAY_BETWEEN_BATCHES=600  # 10 minutes between batches
DELAY_BETWEEN_YEARS=300    # 5 minutes between individual years

echo "🐌 Ultra-Conservative Large Dataset Fetcher"
echo "📅 Fetching games from $YEAR_MIN to $YEAR_MAX"
echo "📦 Batch size: $BATCH_SIZE games per year"
echo "⏳ Delay between batches: $DELAY_BETWEEN_BATCHES seconds"
echo "⏳ Delay between years: $DELAY_BETWEEN_YEARS seconds"
echo ""

# Create data directory if it doesn't exist
mkdir -p data

# Function to fetch a single year
fetch_year() {
    local year=$1
    local batch_num=$2
    
    echo "🔄 Fetching year $year (batch $batch_num)"
    
    # Use ultra-conservative settings
    npm run scrape $year $year --slow --max=$BATCH_SIZE
    
    echo "✅ Year $year completed"
}

# Calculate total years
total_years=$((YEAR_MAX - YEAR_MIN + 1))

echo "📊 Total years to fetch: $total_years"
echo "⏱️  Estimated time: ~$((total_years * 15)) minutes (15 min per year)"
echo ""

# Fetch year by year
current_year=$YEAR_MIN
batch_num=1

while [ $current_year -le $YEAR_MAX ]; do
    echo "🚀 Year $batch_num/$total_years: $current_year"
    fetch_year $current_year $batch_num
    
    # Don't wait after the last year
    if [ $current_year -lt $YEAR_MAX ]; then
        echo "⏳ Waiting $DELAY_BETWEEN_YEARS seconds before next year..."
        sleep $DELAY_BETWEEN_YEARS
    fi
    
    current_year=$((current_year + 1))
    batch_num=$((batch_num + 1))
done

echo ""
echo "🎉 All years completed!"
echo "📂 Check the data/ directory for your files"
echo ""
echo "💡 Next steps:"
echo "  • Combine all JSON files into one dataset"
echo "  • Remove duplicates if any"
echo "  • Process the data as needed" 