# Script-Bucket — Definitive Scriptix Authoring Guide

You are writing scripts for the **scriptix** ecosystem (`npx scriptix <name> [args]`).
Each script is a single executable file with structured `@-directive` comments that
the scriptix CLI reads to validate inputs, check dependencies, execute the script,
and format output. This document is your complete reference. Follow it exactly.

**GitHub:** https://github.com/yigitkonur/cli-scriptix (CLI) / https://github.com/yigitkonur/script-bucket (scripts)
**npm:** `npx scriptix <script-name> [args...]`

---

## How Scriptix Works

```
User runs:  npx scriptix yts "react hooks" 20 --json

1. CLI parses global flags (--json) and separates script name + args
2. Fetches manifest.json from script-bucket repo (cached locally)
3. Finds "yts" entry → fetches scripts/youtube/yts.sh (cached locally)
4. Parses @-directives from the .sh file header
5. Validates: platform OK? deps installed? env vars set? args correct types?
6. Writes script to temp file, spawns with detected shell (bash/python/node/etc)
7. Script args passed as $1, $2, etc. Env vars inherited from user's shell.
8. stdout = data output (TSV/JSON/text). stderr = status messages (user sees both)
9. If --json: scriptix converts TSV→JSON using @header as keys
10. Temp file cleaned up. Exit code forwarded.
```

**Key insight:** The script file IS the source of truth. No config files, no build step.
One `.sh` file with comments = a complete, distributable CLI command.

---

## 10 Golden Rules

1. **ONE FILE per script.** All metadata in `@-directive` comments. Nothing else needed.
2. **`set -euo pipefail`** on every bash script. No exceptions, ever.
3. **Temp files:** `mktemp` + `trap 'rm -f "$tmpfile"' EXIT`. Always.
4. **stdout = data ONLY.** Status messages, progress, errors → stderr (`>&2`).
5. **`jq -n --arg`** for JSON construction. NEVER string-interpolate variables into JSON.
6. **Sanitize TSV fields:** `gsub("\t"; " ") | gsub("\n"; " ")` — tabs and newlines break TSV.
7. **Positional args:** `$1`, `$2`, etc. Bash defaults for optionals: `${2:-10}`.
8. **No hardcoded secrets.** Use `@env` directives. Users put tokens in `~/.scriptix/.env`.
9. **No header row in stdout.** Scriptix auto-injects `@header`. Output data rows only.
10. **Quote EVERYTHING:** `"$1"` not `$1`. `"$tmpfile"` not `$tmpfile`. `"$variable"` always.

---

## Complete Script Template

This is the canonical structure. Every script starts here.

```bash
#!/bin/bash
# @name my-script
# @description Verb-phrase description under 120 characters
# @arg param1 string "Description of first parameter"
# @arg param2 number "Description of second parameter" =10
# @dep jq
# @dep curl
# @env API_KEY "Get from https://example.com/settings"
# @output tsv
# @header Col1 Col2 Col3
# @category category-name
# @tag tag1
# @tag tag2
# @author github-username
# @example scriptix my-script "hello" 42
# @version 1.0.0

set -euo pipefail

PARAM1="$1"
PARAM2="${2:-10}"

echo "Processing '$PARAM1'..." >&2

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

# ... fetch/process data ...

# Output data rows ONLY — no header row
jq -r '.[] | [.field1, (.field2 | gsub("\t"; " ") | gsub("\n"; " ")), .field3] | @tsv' "$tmpfile"
```

---

## @-Directive Reference (Complete)

### REQUIRED Directives

#### `@name` — Script Identifier (REQUIRED)

Must match filename without `.sh`. Lowercase, alphanumeric, hyphens only.

```bash
# @name youtube-search       # filename: youtube-search.sh
# @name gh-prs               # filename: gh-prs.sh
```

**Rules:**
- `^[a-z][a-z0-9-]*$` regex — starts with letter, then letters/digits/hyphens
- NO underscores, spaces, uppercase, dots, or special characters
- Keep short (1-3 words hyphenated). Users type this every time.

**Bad:** `YouTube_Search`, `myScript`, `search.youtube`, `yts 2`
**Good:** `yts`, `youtube-search`, `gh-prs`, `url-to-md`

#### `@description` — One-liner (REQUIRED)

```bash
# @description Search YouTube videos via Apify and return metadata as TSV
```

**Rules:**
- Max 120 characters
- Start with a verb: "Search", "Extract", "Convert", "List", "Fetch", "Generate"
- Describe what the script DOES, not what it IS
- Don't repeat the name

**Bad:** `A script for YouTube` / `YouTube search script` / `This script searches...`
**Good:** `Search YouTube videos and return video IDs, titles, and channel data as TSV`

### Argument Directives

#### `@arg` — Positional Argument

**Format:** `# @arg <name> <type> "<description>" [modifier]`

| Type | Shell receives | Validation |
|------|---------------|------------|
| `string` | Raw string | Any non-empty value |
| `number` | Numeric string | Must parse as a number |
| `boolean` | `"true"` or `"false"` | Must be true/false |

| Modifier | Meaning | Shell handling |
|----------|---------|---------------|
| *(none)* | Required | `"$1"` — fails if missing |
| `?` | Optional, no default | `"${2:-}"` |
| `=<value>` | Optional with default | `"${2:-value}"` |
| `...` | Variadic (rest of args) | `"${@:2}"` |

```bash
# @arg query string "Search query"                              # REQUIRED
# @arg limit number "Maximum number of results" =10             # optional, default 10
# @arg verbose boolean "Enable verbose logging" ?               # optional, no default
# @arg urls string "One or more URLs to process" ...            # variadic

# In script body:
QUERY="$1"                  # required — scriptix rejects if missing
LIMIT="${2:-10}"            # MUST match @arg default
VERBOSE="${3:-false}"       # optional with no default
URLS=("${@:4}")            # variadic — all remaining args
```

**CRITICAL:** The bash default (`${2:-10}`) MUST match the `@arg` default (`=10`). If they
disagree, the script behaves differently when run directly vs through scriptix.

**Ordering rules:**
- Required args first, then optional, then variadic (if any)
- At most ONE variadic arg, and it MUST be last
- Max ~5 args. If you need more, your script is doing too much — split it.

#### `@flag` — Named Flag (reserved, not yet in runner)

```bash
# @flag verbose v "Enable verbose output"
```

Flags are parsed but not yet wired into the runner. For now, use `@arg` with boolean type.

### Dependency Directives

#### `@dep` — External Binary Requirement

One per line. Scriptix runs `which <dep>` before execution. If missing, shows an install hint.

```bash
# @dep jq           # JSON processor
# @dep curl         # HTTP client
# @dep apify        # Apify CLI (npm i -g apify-cli)
# @dep gh           # GitHub CLI
# @dep ffmpeg        # Media processing
# @dep python3      # Python interpreter
# @dep node         # Node.js
# @dep htmlq        # HTML selector
# @dep rg           # ripgrep
```

**Rules:**
- List EVERY external binary your script calls
- Don't list built-in shell commands (`echo`, `cat`, `grep`, `sed`, `awk`, `sort`, `tr`, `cut`, `wc`, `head`, `tail`, `xargs`, `tee`, `mktemp`, `date`) — these are always available
- DO list interpreters if non-bash: `python3`, `node`, `ruby`, `deno`
- Prefer widely-available tools. If your script needs `htmlq`, consider if `grep + sed` can do the job

#### `@env` — Required Environment Variable

```bash
# @env APIFY_TOKEN "Get from https://console.apify.com/account/integrations"
# @env GITHUB_TOKEN "Create at https://github.com/settings/tokens"
# @env OPENAI_API_KEY
```

**Format:** `# @env <VAR_NAME>` or `# @env <VAR_NAME> "<setup instructions>"`

**Where users set env vars (in priority order):**
1. Shell environment (highest): `export APIFY_TOKEN=xxx`
2. Local `.env` file in working directory
3. Global `~/.scriptix/.env` file (recommended for persistent tokens)

**Rules:**
- ALWAYS include the hint URL when the token comes from a specific settings page
- Use SCREAMING_SNAKE_CASE for variable names
- Common patterns: `*_TOKEN`, `*_API_KEY`, `*_SECRET`, `*_URL`

### Output Directives

#### `@output` — Output Format Declaration

Tells scriptix how to parse stdout when `--json` flag is used.

| Value | Script outputs | `--json` conversion |
|-------|---------------|-------------------|
| `tsv` | Tab-separated rows | Array of objects using `@header` as keys |
| `csv` | Comma-separated rows | Array of objects using `@header` as keys |
| `json` | Raw JSON | Pretty-printed passthrough |
| `ndjson` | One JSON object per line | Parsed into JSON array |
| `text` | Plain text lines (default) | Array of strings |

**Most scripts should use `tsv`.** It's the best balance of human-readable + machine-parseable.

#### `@header` — Column Names for TSV/CSV

Space-separated column names. **REQUIRED** when `@output` is `tsv` or `csv`.

```bash
# @header VideoID Title ChannelTitle ChannelID ViewCount
```

**Rules:**
- Column count MUST match the number of fields your script outputs per row
- Use PascalCase or camelCase: `VideoID`, `Title`, `CreatedAt`
- No spaces in column names (use PascalCase to join words)
- Keep names short but descriptive

**What happens at runtime:**
- Without `--json`: scriptix does NOT print the header. Your raw TSV streams to stdout.
- With `--json`: scriptix reads your TSV, uses `@header` as JSON keys, outputs objects.

### Metadata Directives

#### `@category` — Organization

One word, lowercase. Determines the directory: `scripts/<category>/<name>.sh`

| Category | For |
|----------|-----|
| `youtube` | YouTube data extraction |
| `github` | GitHub repos, PRs, issues |
| `web` | Web scraping, HTTP, URLs |
| `text` | Text processing, formatting |
| `data` | Data analysis, CSV, JSON tools |
| `api` | Generic API integrations |
| `devops` | CI/CD, Docker, infra |
| `media` | Audio, video, image |
| `social` | Social media platforms |
| `ai` | LLM APIs, embeddings, AI tools |
| `search` | Search engines, indexing |
| `email` | Email processing |

New categories: just create the directory and use it.

#### `@tag` — Searchable Labels

Multiple `@tag` lines allowed. Used by `scriptix search`.

```bash
# @tag scraping
# @tag apify
# @tag video
# @tag youtube
```

Tags help discoverability. Use descriptive terms users might search for.

#### `@author` — GitHub Username

```bash
# @author yigitkonur
```

#### `@platform` — Platform Constraint

```bash
# @platform all       # default — runs everywhere
# @platform macos     # macOS only (e.g., uses pbcopy, open)
# @platform linux     # Linux only (e.g., uses xclip, xdg-open)
```

Use this ONLY when your script genuinely can't work cross-platform. Most scripts should be `all`.

#### `@example` — Usage Examples

Multiple allowed. Show the full `scriptix` command.

```bash
# @example scriptix yts "react hooks" 20
# @example scriptix yts "kubernetes" --json
# @example echo '{"q":"test"}' | scriptix my-pipe-script
```

#### `@stdin` — Accepts Piped Input

```bash
# @stdin true
```

Set this when your script reads from stdin. Without this, scriptix won't forward piped input.

#### `@version` — Semver

```bash
# @version 1.0.0
```

---

## Patterns Cookbook

### Pattern 1: REST API → jq → TSV

The most common pattern. Fetch from an API, filter JSON, output TSV.

```bash
#!/bin/bash
# @name api-search
# @description Search an API and return results as TSV
# @arg query string "Search term"
# @arg limit number "Number of results" =25
# @dep jq
# @dep curl
# @env API_KEY "Get from https://example.com/settings"
# @output tsv
# @header ID Name Status CreatedAt
# @category api
# @example scriptix api-search "widgets" 50

set -euo pipefail

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

encoded_query=$(jq -rn --arg q "$1" '$q | @uri')

curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.example.com/search?q=${encoded_query}&limit=${2:-25}" \
  > "$tmpfile"

jq -r '.results[] | [
  .id,
  (.name | gsub("\t"; " ") | gsub("\n"; " ")),
  .status,
  .createdAt
] | @tsv' "$tmpfile"
```

### Pattern 2: Apify Actor → Parse → TSV

For scripts that use Apify actors as data sources.

```bash
#!/bin/bash
# @name apify-scrape
# @description Run an Apify actor and parse results
# @arg query string "Search input for the actor"
# @arg maxResults number "Maximum results" =10
# @dep jq
# @dep apify
# @env APIFY_TOKEN "Get from https://console.apify.com/account/integrations"
# @output tsv
# @header Field1 Field2 Field3
# @category scraping
# @tag apify
# @example scriptix apify-scrape "search term" 25

set -euo pipefail

echo "Running actor with query: '$1'..." >&2

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

# Build JSON payload safely — NEVER string-interpolate
payload=$(jq -n \
  --arg input "$1" \
  --argjson max "${2:-10}" \
  '{ "searchQuery": $input, "maxResults": $max }')

echo "$payload" | apify call actor-owner/actor-name \
  --silent --output-dataset > "$tmpfile" 2>/dev/null

jq -r '.[] | [
  .field1,
  (.field2 | gsub("\t"; " ") | gsub("\n"; " ")),
  (.field3 // "N/A")
] | @tsv' "$tmpfile"
```

**Apify-specific notes:**
- `--silent` suppresses the progress bar
- `--output-dataset` outputs the dataset as JSON array
- `2>/dev/null` suppresses apify's stderr status messages
- Always declare `@env APIFY_TOKEN`

### Pattern 3: Stdin Pipe → Transform → Output

For scripts that transform piped input. Enables chaining.

```bash
#!/bin/bash
# @name json-summarize
# @description Summarize piped JSON array into compact NDJSON
# @stdin true
# @dep jq
# @output ndjson
# @category data
# @example cat data.json | scriptix json-summarize
# @example scriptix api-search "term" --json | scriptix json-summarize

set -euo pipefail

jq -c '.[] | { id: .id, summary: (.text | .[0:100]) }'
```

**Stdin rules:**
- MUST declare `@stdin true` or scriptix won't forward piped input
- Don't mix stdin with required positional args (confusing UX)
- If your script CAN work with either stdin or a file arg, prefer the file arg pattern and
  let users do `cat file | scriptix ...` for piping

### Pattern 4: Paginated API

When an API returns paginated results and you need to fetch all pages.

```bash
#!/bin/bash
# @name api-paginate
# @description Fetch all pages from a paginated API
# @arg endpoint string "API endpoint path"
# @arg maxPages number "Maximum pages to fetch" =5
# @dep jq
# @dep curl
# @env API_KEY
# @output ndjson
# @category api
# @example scriptix api-paginate "/users" 10

set -euo pipefail

MAX_PAGES="${2:-5}"
PAGE=1
ENDPOINT="$1"

while [ "$PAGE" -le "$MAX_PAGES" ]; do
  echo "Fetching page $PAGE..." >&2

  response=$(curl -s -H "Authorization: Bearer $API_KEY" \
    "https://api.example.com${ENDPOINT}?page=${PAGE}&per_page=100")

  # Output each item as NDJSON
  echo "$response" | jq -c '.data[]'

  # Check if there's a next page
  has_next=$(echo "$response" | jq -r '.has_next_page')
  if [ "$has_next" != "true" ]; then
    break
  fi

  PAGE=$((PAGE + 1))
done
```

### Pattern 5: Python Script

Any language works — just change the shebang. Python scripts use `#` comments so `@-directives` work identically.

```python
#!/usr/bin/env python3
# @name csv-stats
# @description Compute basic statistics from a CSV file
# @arg file string "Path to CSV file"
# @dep python3
# @output tsv
# @header Column Min Max Mean Count
# @category data
# @example scriptix csv-stats data.csv

import sys
import csv
from statistics import mean

with open(sys.argv[1]) as f:
    reader = csv.DictReader(f)
    rows = list(reader)

for col in rows[0].keys():
    try:
        vals = [float(r[col]) for r in rows if r[col]]
        print(f"{col}\t{min(vals)}\t{max(vals)}\t{mean(vals):.2f}\t{len(vals)}", flush=True)
    except ValueError:
        pass
```

**Python-specific notes:**
- Use `#!/usr/bin/env python3` — never hardcode paths
- `print(..., flush=True)` ensures output isn't buffered
- `sys.argv[1]` for first arg, `sys.argv[2]` for second, etc.
- For optional args: `sys.argv[2] if len(sys.argv) > 2 else "default"`
- Add `@dep python3` so scriptix checks it's installed

### Pattern 6: Node.js Script

For scripts needing JavaScript. Uses `//` comments for directives.

```javascript
#!/usr/bin/env node
// @name npm-deps
// @description List npm package dependencies and their latest versions
// @arg package string "npm package name"
// @dep node
// @output tsv
// @header Name Current Latest Type
// @category devops
// @example scriptix npm-deps express

const https = require('https');

const pkg = process.argv[2];

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'scriptix' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  const data = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
  const deps = { ...data.dependencies, ...data.devDependencies };

  for (const [name, version] of Object.entries(deps || {})) {
    const type = data.dependencies?.[name] ? 'prod' : 'dev';
    const latest = await fetch(`https://registry.npmjs.org/${name}/latest`);
    console.log(`${name}\t${version}\t${latest.version}\t${type}`);
  }
})();
```

**Node.js-specific notes:**
- Use `//` for directive comments (the parser supports both `#` and `//`)
- `process.argv[2]` for first arg (argv[0] = node, argv[1] = script path)
- Add `@dep node` so scriptix checks it's installed
- Use built-in modules only if possible (no npm install in scripts)

### Pattern 7: GitHub CLI Integration

Scripts that wrap `gh` for structured GitHub data extraction.

```bash
#!/bin/bash
# @name gh-prs
# @description List open pull requests for a GitHub repository
# @arg repo string "Repository in owner/repo format"
# @arg limit number "Number of PRs to list" =10
# @dep gh
# @dep jq
# @output tsv
# @header Number Title Author CreatedAt Labels
# @category github
# @tag github
# @tag pr
# @example scriptix gh-prs vercel/next.js 20
# @example scriptix gh-prs facebook/react --json

set -euo pipefail

gh pr list --repo "$1" --limit "${2:-10}" \
  --json number,title,author,createdAt,labels \
  | jq -r '.[] | [
    .number,
    (.title | gsub("\t"; " ") | gsub("\n"; " ")),
    .author.login,
    .createdAt,
    ([.labels[].name] | join(","))
  ] | @tsv'
```

### Pattern 8: File Processing with Multiple Temp Files

When you need intermediate processing steps.

```bash
#!/bin/bash
# @name json-merge
# @description Merge multiple JSON files into a single array
# @arg files string "JSON files to merge" ...
# @dep jq
# @output json
# @category data
# @example scriptix json-merge file1.json file2.json file3.json

set -euo pipefail

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

# Initialize empty array
echo '[]' > "$tmpfile"

for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "Warning: $file not found, skipping" >&2
    continue
  fi
  echo "Merging $file..." >&2
  # Append file contents to array
  jq -s '.[0] + .[1]' "$tmpfile" "$file" > "${tmpfile}.new"
  mv "${tmpfile}.new" "$tmpfile"
done

jq '.' "$tmpfile"
```

### Pattern 9: Web Scraping with curl

```bash
#!/bin/bash
# @name web-links
# @description Extract all links from a web page
# @arg url string "Target URL"
# @dep curl
# @dep grep
# @output tsv
# @header URL Text
# @category web
# @tag scraping
# @example scriptix web-links "https://example.com"

set -euo pipefail

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

curl -sL "$1" > "$tmpfile"

# Extract href values and link text
grep -oP '<a[^>]+href="[^"]*"[^>]*>[^<]*</a>' "$tmpfile" | while IFS= read -r tag; do
  url=$(echo "$tag" | grep -oP 'href="\K[^"]*')
  text=$(echo "$tag" | sed -E 's/<[^>]+>//g' | tr '\t\n' '  ')
  [ -n "$url" ] && printf '%s\t%s\n' "$url" "$text"
done
```

### Pattern 10: Error Recovery and Retries

When calling unreliable APIs.

```bash
#!/bin/bash
# @name api-retry
# @description Fetch data from an API with automatic retries
# @arg url string "API endpoint URL"
# @arg retries number "Number of retry attempts" =3
# @dep curl
# @dep jq
# @output json
# @category api
# @example scriptix api-retry "https://api.example.com/data" 5

set -euo pipefail

URL="$1"
MAX_RETRIES="${2:-3}"
ATTEMPT=1

while [ "$ATTEMPT" -le "$MAX_RETRIES" ]; do
  echo "Attempt $ATTEMPT of $MAX_RETRIES..." >&2

  HTTP_CODE=$(curl -s -o /tmp/scriptix-response-$$.json -w "%{http_code}" "$URL")

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    jq '.' /tmp/scriptix-response-$$.json
    rm -f /tmp/scriptix-response-$$.json
    exit 0
  fi

  echo "HTTP $HTTP_CODE — retrying in $((ATTEMPT * 2))s..." >&2
  sleep $((ATTEMPT * 2))
  ATTEMPT=$((ATTEMPT + 1))
done

echo "Failed after $MAX_RETRIES attempts" >&2
rm -f /tmp/scriptix-response-$$.json
exit 1
```

---

## Common Mistakes and How to Fix Them

### Mistake 1: Putting data messages on stdout

```bash
# BAD — "Searching..." appears in TSV output and breaks parsing
echo "Searching for '$QUERY'..."
jq -r '.[] | @tsv' "$tmpfile"

# GOOD — status goes to stderr, data goes to stdout
echo "Searching for '$QUERY'..." >&2
jq -r '.[] | @tsv' "$tmpfile"
```

### Mistake 2: String-interpolating JSON

```bash
# BAD — injection risk, breaks on special characters
echo '{"query": "'"$QUERY"'", "limit": '"$LIMIT"'}'

# GOOD — safe, handles all characters
jq -n --arg q "$QUERY" --argjson limit "$LIMIT" '{ query: $q, limit: $limit }'
```

### Mistake 3: Forgetting to sanitize TSV fields

```bash
# BAD — tabs or newlines in title will misalign columns
jq -r '.[] | [.id, .title] | @tsv'

# GOOD — sanitize before TSV output
jq -r '.[] | [.id, (.title | gsub("\t"; " ") | gsub("\n"; " "))] | @tsv'
```

### Mistake 4: Printing a header row

```bash
# BAD — scriptix already handles headers via @header
echo -e "ID\tTitle\tStatus"
jq -r '.[] | [.id, .title, .status] | @tsv'

# GOOD — only output data rows
jq -r '.[] | [.id, .title, .status] | @tsv'
```

### Mistake 5: Using predictable temp file names

```bash
# BAD — race conditions, predictable path
TMPFILE="/tmp/output.json"

# GOOD — unique, unpredictable
tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT
```

### Mistake 6: Not quoting variables

```bash
# BAD — word splitting on spaces
curl -s $URL
jq -r . $tmpfile

# GOOD — always quote
curl -s "$URL"
jq -r . "$tmpfile"
```

### Mistake 7: Mismatched defaults

```bash
# BAD — @arg says default is 10 but bash uses 20
# @arg limit number "Max results" =10
LIMIT="${2:-20}"    # WRONG — disagrees with @arg

# GOOD — defaults match
# @arg limit number "Max results" =10
LIMIT="${2:-10}"    # Matches @arg declaration
```

### Mistake 8: Not declaring all dependencies

```bash
# BAD — uses htmlq but doesn't declare it
# @dep curl
curl -s "$1" | htmlq 'h1' --text

# GOOD — declare every binary you call
# @dep curl
# @dep htmlq
curl -s "$1" | htmlq 'h1' --text
```

### Mistake 9: Handling null/missing JSON fields

```bash
# BAD — null values cause empty columns and shift the rest
jq -r '[.id, .name, .email] | @tsv'

# GOOD — provide fallback for nullable fields
jq -r '[.id, (.name // "N/A"), (.email // "")] | @tsv'
```

### Mistake 10: Forgetting `set -euo pipefail`

```bash
# BAD — errors are silently ignored, script continues with bad data
#!/bin/bash
curl -s "$URL" > "$tmpfile"  # might fail silently
jq '.[]' "$tmpfile"          # processes empty/invalid data

# GOOD — fail fast, fail loud
#!/bin/bash
set -euo pipefail
curl -s "$URL" > "$tmpfile"
jq '.[]' "$tmpfile"
```

---

## TSV Output Rules (Detailed)

1. **NO header row.** Scriptix handles headers via `@header`. Your stdout = data only.
2. **Sanitize every text field:**
   ```bash
   # In jq (preferred):
   .field | gsub("\t"; " ") | gsub("\n"; " ") | gsub("\r"; "")

   # In bash:
   echo "$value" | tr '\t\n\r' '   '
   ```
3. **Use jq `@tsv`** for reliable TSV from JSON arrays.
4. **For non-JSON data,** use `printf '%s\t%s\t%s\n' "$f1" "$f2" "$f3"`.
5. **Truncate long fields:** `.[0:200]` in jq. Nobody wants a 10KB description column.
6. **Handle nulls:** Use `// ""` or `// "N/A"` in jq for nullable fields.
7. **Column count MUST match `@header` count** for every row. Missing columns break `--json`.
8. **No trailing tabs.** Each row should have exactly `N-1` tabs for `N` columns.

---

## Error Handling Rules

1. `set -euo pipefail` — exit on error, undefined var, or pipe failure
2. Error messages to stderr: `echo "Error: API returned 500" >&2`
3. Non-zero exit on failure: `exit 1`
4. Never `set +e` — if you need to handle an error, use `if ! command; then` pattern:
   ```bash
   if ! curl -sf "$URL" > "$tmpfile"; then
     echo "Error: Failed to fetch $URL" >&2
     exit 1
   fi
   ```
5. Cleanup with trap: `trap 'rm -f "$tmpfile"' EXIT`
6. Check HTTP status codes:
   ```bash
   HTTP_CODE=$(curl -s -o "$tmpfile" -w "%{http_code}" "$URL")
   if [ "$HTTP_CODE" -ne 200 ]; then
     echo "Error: HTTP $HTTP_CODE from $URL" >&2
     exit 1
   fi
   ```

---

## Security Rules

1. **No hardcoded secrets.** Always `@env`:
   ```bash
   # NEVER this
   API_KEY="sk-abc123..."

   # ALWAYS this
   # @env API_KEY "Get from https://..."
   ```

2. **Safe JSON construction:**
   ```bash
   # SAFE — jq handles escaping
   jq -n --arg q "$QUERY" '{ "query": $q }'

   # UNSAFE — injection risk
   echo "{\"query\": \"$QUERY\"}"
   ```

3. **URL encoding:**
   ```bash
   encoded=$(jq -rn --arg q "$QUERY" '$q | @uri')
   curl -s "https://api.example.com?q=${encoded}"
   ```

4. **Variable quoting:** Always `"$var"`. Unquoted variables are word-split and glob-expanded.

5. **Temp files:** `mktemp` creates unpredictable names in `$TMPDIR`. Never use predictable paths.

6. **Avoid `eval`:** Never use `eval` with user input. If you think you need eval, you don't.

7. **Pipe to shell:** Never `curl | bash`. Download, inspect, then execute.

---

## File Naming & Placement

```
scripts/
├── youtube/
│   ├── yts.sh                    # @name yts, @category youtube
│   └── yt-transcript.sh          # @name yt-transcript, @category youtube
├── github/
│   └── gh-prs.sh                 # @name gh-prs, @category github
├── web/
│   └── url-to-md.sh              # @name url-to-md, @category web
└── data/
    └── csv-stats.sh              # @name csv-stats, @category data
```

**Rules:**
- Filename = `@name` + `.sh` (even for Python/Node scripts — the extension is just for the repo)
- Directory = `@category` value
- All lowercase, hyphens only
- The `_template.sh` file is excluded from the manifest (starts with `_`)

---

## Testing Your Script

```bash
# 1. Run through full scriptix validation pipeline
npx scriptix --local ./my-script.sh "test arg" 10

# 2. Test JSON output conversion
npx scriptix --local ./my-script.sh "test arg" --json

# 3. Test piping (stderr should be separate from stdout)
npx scriptix --local ./my-script.sh "test arg" 2>/dev/null | head -3

# 4. Test with missing args (should show helpful error)
npx scriptix --local ./my-script.sh

# 5. Test default values
npx scriptix --local ./my-script.sh "query"  # should use defaults for optional args

# 6. Test error handling
npx scriptix --local ./my-script.sh "INVALID_INPUT_THAT_SHOULD_FAIL"

# 7. Verify column count matches @header
npx scriptix --local ./my-script.sh "test" | head -1 | awk -F'\t' '{print NF}'
# Should equal the number of columns in @header
```

---

## Checklist Before Submitting

- [ ] `@name` matches filename (without `.sh`) and is lowercase-hyphenated
- [ ] `@description` starts with a verb, under 120 chars
- [ ] All `@arg` types are correct (`string`, `number`, `boolean`)
- [ ] Bash defaults (`${2:-10}`) match `@arg` defaults (`=10`) exactly
- [ ] All external binaries listed in `@dep` (not built-in shell commands)
- [ ] All env vars listed in `@env` with setup URL hints
- [ ] `@output` matches actual output format
- [ ] `@header` column count matches actual TSV field count per row
- [ ] `@category` value matches the directory name
- [ ] At least one `@example` showing the full command
- [ ] `set -euo pipefail` present (bash scripts)
- [ ] Temp files use `mktemp` and cleaned with `trap`
- [ ] All text fields sanitized (no tabs/newlines in TSV values)
- [ ] All status/progress messages go to stderr (`>&2`)
- [ ] No hardcoded secrets — all tokens via `@env`
- [ ] All variables quoted: `"$var"` not `$var`
- [ ] JSON built with `jq -n --arg` not string interpolation
- [ ] Nullable JSON fields have fallbacks (`// ""`)
- [ ] Works on macOS and Linux (or `@platform` is set)
- [ ] Tested with `npx scriptix --local` (both normal and `--json` mode)

---

## Quick Reference Card

```
DIRECTIVES          FORMAT                                      REQUIRED
@name               @name kebab-case-id                         YES
@description        @description Verb-phrase under 120 chars    YES
@arg                @arg name type "desc" [?|=default|...]      no
@dep                @dep binary-name                            no
@env                @env VAR_NAME "setup hint"                  no
@output             @output tsv|csv|json|ndjson|text            no (default: text)
@header             @header Col1 Col2 Col3                      if tsv/csv
@category           @category lowercase-word                    no
@tag                @tag label                                  no (multi)
@author             @author github-username                     no
@platform           @platform all|macos|linux                   no (default: all)
@example            @example scriptix name "arg" 10             no (multi)
@stdin              @stdin true                                 no
@version            @version 1.0.0                              no

SHELL PATTERN       USE CASE
$1, $2              Positional args
${2:-default}       Optional arg with default
$(mktemp)           Temp file creation
trap '...' EXIT     Cleanup on any exit
>&2                 Send to stderr
jq -n --arg         Safe JSON construction
jq '@tsv'           TSV formatting from JSON arrays
jq '@uri'           URL encoding
// ""               jq null fallback
gsub("\t"; " ")     Sanitize tabs in jq
```
