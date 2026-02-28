## New Script: `<name>`

### Checklist

- [ ] Script has `#!/bin/bash` (or appropriate shebang)
- [ ] `@name` matches filename (minus `.sh`)
- [ ] `@description` is present and under 120 chars
- [ ] All `@arg` definitions have correct types and descriptions
- [ ] Bash defaults (`${2:-10}`) match `@arg` defaults (`=10`)
- [ ] All `@dep` tools are listed
- [ ] All `@env` variables are listed with hints
- [ ] `@output` and `@header` are correct
- [ ] `@category` directory matches the directive
- [ ] At least one `@example` is provided
- [ ] `set -euo pipefail` is present
- [ ] Temp files cleaned with `trap`
- [ ] TSV values sanitized (no tabs/newlines)
- [ ] Status messages go to stderr (`>&2`)
- [ ] No hardcoded secrets
- [ ] Tested locally with `npx scriptix --local ./script.sh`

### Description

<!-- What does this script do? When would someone use it? -->

### Dependencies

<!-- List all required tools and how to install them -->

### Testing

<!-- How did you test this script? What commands did you run? -->
