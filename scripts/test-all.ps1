$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location "$root\extension"
try { npm.cmd run check } finally { Pop-Location }
Push-Location "$root\backend"
try {
  .\.venv\Scripts\python.exe -m ruff check app tests
  .\.venv\Scripts\python.exe -m mypy app
  .\.venv\Scripts\python.exe -m pytest
} finally { Pop-Location }
