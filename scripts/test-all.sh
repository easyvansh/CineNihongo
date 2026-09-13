#!/usr/bin/env sh
set -eu
root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
node "$root/scripts/verify-source.mjs"
cd "$root/extension" && npm run check && npm run test:browser
cd "$root/backend" && .venv/bin/python -m ruff check app tests && .venv/bin/python -m mypy app && .venv/bin/python -m pytest
cd "$root/extension" && npm run test:capture
