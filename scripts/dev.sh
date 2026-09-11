#!/usr/bin/env sh
set -eu
root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
(cd "$root/backend" && .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload) &
cd "$root/extension" && npm run dev
