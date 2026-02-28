#!/bin/bash
# @name yts
# @description Search YouTube videos via Apify and return results as TSV
# @arg query string "Search query (e.g. 'nodejs tutorial')"
# @arg maxResults number "Maximum number of results to return" =10
# @dep jq
# @dep apify
# @env APIFY_TOKEN "Get from https://console.apify.com/account/integrations"
# @output tsv
# @header VideoID Title Description ChannelID
# @category youtube
# @tag scraping
# @tag apify
# @tag video
# @author yigitkonur
# @example scriptix yts "react hooks tutorial" 20
# @example scriptix yts "kubernetes explained"
# @example scriptix yts "nodejs" 5 --json
# @version 1.0.0

set -euo pipefail

QUERY="$1"
MAX_RESULTS="${2:-10}"

echo "Fetching up to $MAX_RESULTS results for: '$QUERY'..." >&2

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

payload=$(jq -n \
  --argjson max "$MAX_RESULTS" \
  --arg q "$QUERY" \
  '{
    "geo": "TR",
    "lang": "tr",
    "local": true,
    "maxResults": $max,
    "query": $q,
    "scrapeAllResults": false,
    "type": "video",
    "videoDepthDetails": "basic",
    "features": {
      "360": false, "HD": false, "subtitles": false, "CCommons": false,
      "3D": false, "Live": false, "Purchased": false, "4K": false,
      "Location": false, "HDR": false, "VR180": false
    }
  }')

echo "$payload" | apify call api-ninja/youtube-search-scraper \
  --silent --output-dataset > "$tmpfile" 2>/dev/null

jq -r '
  .[] |
  select(.type == "video") |
  [
    .videoId,
    (.title | gsub("\t"; " ") | gsub("\n"; " ")),
    ((.description // "") | .[0:120] | gsub("\t"; " ") | gsub("\n"; " ")),
    .channelId
  ] | @tsv
' "$tmpfile"
