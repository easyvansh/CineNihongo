$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Start-Process -FilePath "$root\backend\.venv\Scripts\python.exe" -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8765", "--reload" -WorkingDirectory "$root\backend" -WindowStyle Hidden
Push-Location "$root\extension"
try { npm.cmd run dev } finally { Pop-Location }
