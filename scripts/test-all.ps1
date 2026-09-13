$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
node "$root\scripts\verify-source.mjs"
if ($LASTEXITCODE -ne 0) { throw 'Source integrity check failed' }
Push-Location "$root\extension"
try { npm.cmd run check; if ($LASTEXITCODE -ne 0) { throw 'Extension checks failed' }; npm.cmd run test:browser; if ($LASTEXITCODE -ne 0) { throw 'Browser tests failed' } } finally { Pop-Location }
Push-Location "$root\backend"
try {
  .\.venv\Scripts\python.exe -m ruff check app tests
  if ($LASTEXITCODE -ne 0) { throw 'Backend lint failed' }
  .\.venv\Scripts\python.exe -m mypy app
  if ($LASTEXITCODE -ne 0) { throw 'Backend typing failed' }
  .\.venv\Scripts\python.exe -m pytest
  if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
} finally { Pop-Location }
Push-Location "$root\extension"
try { npm.cmd run test:capture; if ($LASTEXITCODE -ne 0) { throw 'Capture integration failed' } } finally { Pop-Location }
