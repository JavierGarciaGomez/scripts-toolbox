#!/bin/bash

# Large Dataset Fetcher for Metacritic
# This script fetches large datasets with conservative settings to avoid rate limiting

set -e

# Default values
YEAR_MIN=${1:-1970}
YEAR_MAX=${2:-2025}
BATCH_SIZE=1000
DELAY_BETWEEN_BATCHES=300  # 5 minutes

echo "🎯 Large Dataset Fetcher"
echo "📅 Fetching games from $YEAR_MIN to $YEAR_MAX"
echo "📦 Batch size: $BATCH_SIZE games"
echo "⏳ Delay between batches: $DELAY_BETWEEN_BATCHES seconds"
echo ""

# Create data directory if it doesn't exist
mkdir -p data

# Function to fetch a batch
fetch_batch() {
    local start_year=$1
    local end_year=$2
    local batch_num=$3
    
    echo "🔄 Starting batch $batch_num: $start_year-$end_year"
    
    # Use the most conservative settings
    npm run scrape $start_year $end_year --slow --max=$BATCH_SIZE
    
    echo "✅ Batch $batch_num completed"
}

# Calculate how many batches we need
total_years=$((YEAR_MAX - YEAR_MIN + 1))
batches_needed=$((total_years / 2 + total_years % 2))  # 2 years per batch

echo "📊 Estimated batches needed: $batches_needed"
echo ""

# Fetch in batches of 2 years each
current_year=$YEAR_MIN
batch_num=1

while [ $current_year -le $YEAR_MAX ]; do
    end_year=$((current_year + 1))
    if [ $end_year -gt $YEAR_MAX ]; then
        end_year=$YEAR_MAX
    fi
    
    echo "🚀 Batch $batch_num/$batches_needed: $current_year-$end_year"
    fetch_batch $current_year $end_year $batch_num
    
    # Don't wait after the last batch
    if [ $current_year -lt $((YEAR_MAX - 1)) ]; then
        echo "⏳ Waiting $DELAY_BETWEEN_BATCHES seconds before next batch..."
        sleep $DELAY_BETWEEN_BATCHES
    fi
    
    current_year=$((end_year + 1))
    batch_num=$((batch_num + 1))
done

echo ""
echo "🎉 All batches completed!"
echo "📂 Check the data/ directory for your files" 