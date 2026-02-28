#!/bin/bash
# @name CHANGEME
# @description TODO: One-line description of what this script does
# @arg query string "TODO: Describe the first argument"
# @arg limit number "Maximum number of results" =10
# @dep jq
# @dep curl
# @env API_KEY "TODO: Where to get the API key"
# @output tsv
# @header Col1 Col2 Col3
# @category TODO
# @tag TODO
# @author TODO
# @example scriptix CHANGEME "example query" 20
# @version 1.0.0

set -euo pipefail

QUERY="$1"
LIMIT="${2:-10}"

echo "Running CHANGEME with query: '$QUERY'..." >&2

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

# TODO: Replace with your data source
# Example: API call
# curl -s -H "Authorization: Bearer $API_KEY" \
#   "https://api.example.com/search?q=$(jq -rn --arg q "$QUERY" '$q | @uri')&limit=$LIMIT" \
#   > "$tmpfile"

# TODO: Replace with your jq filter
# Output ONLY data rows (no header — scriptix auto-injects @header)
# jq -r '.results[] | [.id, (.name | gsub("\t"; " ")), .status] | @tsv' "$tmpfile"
