# Script-Bucket — Script Authoring Guide for LLMs

You are writing scripts for the **scriptix** ecosystem. Each script is a single
executable file with structured `@-directive` comments that define metadata.
The scriptix CLI reads these directives to validate, execute, and format output.

---

## Golden Rules

1. **ONE FILE per script.** All metadata lives in `@-directive` comments at the top.
2. **`set -euo pipefail`** in every bash script. No exceptions.
3. **Temp files** must use `mktemp` and be cleaned with `trap 'rm -f "$tmpfile"' EXIT`.
4. **Status messages → stderr** (`>&2`). Only data goes to stdout.
5. **JSON construction** must use `jq -n --arg`/`--argjson`. Never interpolate variables into JSON strings.
6. **TSV output** must sanitize tabs and newlines in field values (`gsub("\t"; " ")`).
7. **Arguments are positional:** `$1`, `$2`, etc. Use `${2:-default}` for optional args.
8. **Never hardcode secrets.** Use `@env` directives instead.
9. **No header row in stdout.** Scriptix auto-injects the `@header` when needed.
10. **Quote everything:** `"$1"` not `$1`, `"$tmpfile"` not `$tmpfile`.

---

## Script Template

Every script must follow this structure exactly:

```bash
#!/bin/bash
# @name my-script
# @description One-line description of what this script does (max 120 chars)
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
# @author your-github-username
# @example scriptix my-script "hello" 42
# @version 1.0.0

set -euo pipefail

PARAM1="$1"
PARAM2="${2:-10}"

echo "Processing..." >&2

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

# Your logic here — fetch data, process it, etc.

# Output data rows only (no header row)
jq -r '.[] | [.field1, (.field2 | gsub("\t"; " ") | gsub("\n"; " ")), .field3] | @tsv' "$tmpfile"
```

---

## @-Directive Reference

### Required Directives

#### `@name` (REQUIRED)
Script identifier. Must match the filename without `.sh` extension.
Lowercase, alphanumeric, hyphens only. No underscores, no spaces.

```bash
# @name youtube-search
```

#### `@description` (REQUIRED)
One-line human-readable description. Maximum 120 characters.
Start with a verb. Describe what the script **does**, not what it **is**.

```bash
# @description Search YouTube videos via Apify and return metadata as TSV
```

### Argument Directives

#### `@arg`
Positional argument definition.

**Format:** `# @arg <name> <type> "<description>" [modifier]`

**Types:** `string`, `number`, `boolean`

**Modifiers:**
- *(none)* — required argument
- `?` — optional argument (no default)
- `=<value>` — optional with default value
- `...` — variadic (collects all remaining args)

```bash
# @arg query string "Search query"                      # required
# @arg limit number "Max results to return" =10         # optional, default 10
# @arg verbose boolean "Enable verbose output" ?         # optional, no default
# @arg files string "Input files to process" ...         # variadic
```

In the script body, access args positionally:
```bash
QUERY="$1"
LIMIT="${2:-10}"     # Must match the default in @arg
```

#### `@flag`
Named flag (not yet implemented in runner — reserved for future use).

```bash
# @flag verbose v "Enable verbose output"
```

### Dependency Directives

#### `@dep`
External binary the script requires. One `@dep` per line.
Scriptix runs `which <dep>` before execution and shows install instructions if missing.

```bash
# @dep jq
# @dep curl
# @dep apify
# @dep ffmpeg
# @dep python3
```

#### `@env`
Required environment variable. One per line.
Optional: add a quoted hint about where to obtain the value.

```bash
# @env APIFY_TOKEN "Get from https://console.apify.com/account/integrations"
# @env GITHUB_TOKEN "Create at https://github.com/settings/tokens"
# @env OPENAI_API_KEY
```

Users can set env vars in `~/.scriptix/.env` (loaded automatically) or in their shell.

### Output Directives

#### `@output`
Declares the output format. Tells scriptix how to parse stdout when `--json` flag is used.

| Value | Meaning |
|-------|---------|
| `tsv` | Tab-separated values (requires `@header`) |
| `csv` | Comma-separated values (requires `@header`) |
| `json` | Script outputs JSON directly |
| `ndjson` | Newline-delimited JSON (one JSON object per line) |
| `text` | Plain text lines (default) |

```bash
# @output tsv
```

#### `@header`
Column names for TSV or CSV output. Space-separated. Required when `@output` is `tsv` or `csv`.
The header row is **not** printed by the script — scriptix injects it automatically.

```bash
# @header VideoID Title ChannelTitle ChannelID ViewCount
```

### Metadata Directives

#### `@category`
Script category for organization. One word, lowercase.

Common categories: `youtube`, `github`, `web`, `text`, `data`, `api`, `devops`, `media`, `social`

```bash
# @category youtube
```

#### `@tag`
Searchable label. Use multiple `@tag` lines for multiple tags.

```bash
# @tag scraping
# @tag apify
# @tag video
```

#### `@author`
GitHub username of the script author.

```bash
# @author yigitkonur
```

#### `@platform`
Platform constraint. Values: `all` (default), `macos`, `linux`.

```bash
# @platform macos
```

#### `@example`
Usage example showing the full command. Multiple `@example` lines allowed.

```bash
# @example scriptix yts "nodejs tutorial" 20
# @example scriptix yts "react hooks" --json
```

#### `@stdin`
Set to `true` if the script reads from stdin (piped input).

```bash
# @stdin true
```

#### `@version`
Script version in semver format.

```bash
# @version 1.0.0
```

---

## Common Patterns

### Pattern 1: API Call → jq Filter → TSV

The most common pattern. Call an API, filter the JSON response, output TSV.

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

set -euo pipefail

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

# URL-encode the query safely
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

For scripts using Apify actors as data sources.

```bash
#!/bin/bash
# @name apify-scrape
# @description Run an Apify actor and parse results
# @arg input string "Search input for the actor"
# @arg maxResults number "Maximum results" =10
# @dep jq
# @dep apify
# @env APIFY_TOKEN "Get from https://console.apify.com/account/integrations"
# @output tsv
# @header Field1 Field2 Field3
# @category scraping
# @tag apify

set -euo pipefail

echo "Running actor..." >&2

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

payload=$(jq -n \
  --arg input "$1" \
  --argjson max "${2:-10}" \
  '{ "searchQuery": $input, "maxResults": $max }')

echo "$payload" | apify call actor-owner/actor-name \
  --silent --output-dataset > "$tmpfile" 2>/dev/null

jq -r '.[] | [
  .field1,
  (.field2 | gsub("\t"; " ")),
  .field3
] | @tsv' "$tmpfile"
```

### Pattern 3: Stdin Pipe → Transform → Output

For scripts that transform piped input. Enables chaining: `cat data.json | scriptix transform`.

```bash
#!/bin/bash
# @name json-transform
# @description Transform piped JSON input into summarized NDJSON
# @stdin true
# @dep jq
# @output ndjson

set -euo pipefail

jq -c '.[] | { id: .id, summary: (.text | .[0:100]) }'
```

### Pattern 4: Multi-step Pipeline

For scripts that chain multiple external tools.

```bash
#!/bin/bash
# @name web-headers
# @description Extract headings from a web page
# @arg url string "Target URL"
# @dep curl
# @output tsv
# @header Level Text
# @category web

set -euo pipefail

# Use grep + sed instead of htmlq to minimize dependencies
curl -s "$1" | grep -oiE '<h[1-6][^>]*>.*?</h[1-6]>' | while IFS= read -r line; do
  level=$(echo "$line" | grep -oP '(?<=<h)\d')
  text=$(echo "$line" | sed -E 's/<[^>]+>//g' | tr '\t' ' ' | tr '\n' ' ')
  printf '%s\t%s\n' "h${level}" "$text"
done
```

### Pattern 5: Python Script

Scripts can use any language with the appropriate shebang.

```python
#!/usr/bin/env python3
# @name csv-stats
# @description Compute basic statistics from a CSV file
# @arg file string "Path to CSV file"
# @dep python3
# @output tsv
# @header Column Min Max Mean Count
# @category data

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

### Pattern 6: GitHub CLI Integration

```bash
#!/bin/bash
# @name gh-prs
# @description List open pull requests for a GitHub repo
# @arg repo string "Repository in owner/repo format"
# @arg limit number "Number of PRs to list" =10
# @dep gh
# @dep jq
# @output tsv
# @header Number Title Author CreatedAt
# @category github
# @tag github

set -euo pipefail

gh pr list --repo "$1" --limit "${2:-10}" --json number,title,author,createdAt \
  | jq -r '.[] | [
    .number,
    (.title | gsub("\t"; " ")),
    .author.login,
    .createdAt
  ] | @tsv'
```

---

## TSV Output Rules

1. **No header row.** Scriptix injects the `@header` automatically. Your script outputs data rows only.
2. **Sanitize values.** Replace `\t` with space and `\n` with space in all field values.
   - In jq: `gsub("\t"; " ") | gsub("\n"; " ")`
   - In bash: `tr '\t' ' ' | tr '\n' ' '`
3. **Use jq `@tsv`** for reliable TSV formatting from JSON arrays.
4. **For non-JSON sources,** use `printf '%s\t%s\n' "$field1" "$field2"`.
5. **Truncate long fields** to prevent unwieldy output: `.[0:120]` in jq.

---

## Error Handling Rules

1. Always use `set -euo pipefail` — exit on any error, undefined variable, or pipe failure.
2. Send error messages to stderr: `echo "Error: something failed" >&2`
3. Exit with non-zero code on failure: `exit 1`
4. Never use `set +e` to silently swallow errors.
5. Use `trap` for cleanup: `trap 'rm -f "$tmpfile"' EXIT`
6. The scriptix runner captures and forwards the exit code.

---

## Security Rules

1. **Never hardcode** API keys, tokens, or secrets. Use `@env` directives.
2. **Safe JSON construction** — always use `jq -n --arg` / `--argjson`:
   ```bash
   # GOOD
   jq -n --arg q "$QUERY" '{ "query": $q }'

   # BAD — injection risk
   echo '{ "query": "'"$QUERY"'" }'
   ```
3. **URL encoding** — use jq for safe encoding:
   ```bash
   encoded=$(jq -rn --arg q "$QUERY" '$q | @uri')
   ```
4. **Quote all variables:** `"$1"` not `$1`, `"$tmpfile"` not `$tmpfile`.
5. **Temp files** — use `mktemp`, never predictable names like `/tmp/output.json`.

---

## File Naming & Placement

- Script filename must match the `@name` directive: `@name yts` → `yts.sh`
- Place in the correct category directory: `scripts/<category>/<name>.sh`
- Category directory must match the `@category` directive
- Use lowercase and hyphens only in names: `youtube-search.sh`, not `YoutubeSearch.sh`

---

## Testing Your Script

Before submitting, test your script locally:

```bash
# Run through the full scriptix validation pipeline
npx scriptix --local ./my-script.sh "test arg" 10

# Test JSON conversion
npx scriptix --local ./my-script.sh "test arg" --json

# Test piping
npx scriptix --local ./my-script.sh "test arg" | head -5

# Test with missing deps (temporarily rename a dep to verify error message)
```

---

## Checklist Before Submitting

- [ ] `@name` matches filename (without `.sh`)
- [ ] `@description` is clear, starts with a verb, under 120 chars
- [ ] All `@arg` types are correct (`string`, `number`, `boolean`)
- [ ] Bash defaults (`${2:-10}`) match `@arg` defaults (`=10`)
- [ ] All `@dep` tools are listed
- [ ] All `@env` variables are listed with optional hints
- [ ] `@output` matches actual output format
- [ ] `@header` column count matches TSV field count
- [ ] `@category` directory matches the directive value
- [ ] At least one `@example` is provided
- [ ] `set -euo pipefail` is present
- [ ] Temp files cleaned with `trap`
- [ ] TSV values are sanitized (no tabs/newlines in fields)
- [ ] All status messages go to stderr (`>&2`)
- [ ] No hardcoded secrets
- [ ] Works on macOS and Linux (or `@platform` is set)
