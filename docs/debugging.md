# Debugging

- **Player not detected:** wait for playback to load, confirm the URL matches `/watch/movie/*`, and reload the extension after updates.
- **Backend unavailable:** open `http://127.0.0.1:8765/health`; ensure Uvicorn is bound to loopback port 8765.
- **No tab audio:** Stop, play the movie, then Start again from the popup. Chrome requires user activation for capture.
- **No result:** enable Debug overlay. Silence, low ASR/alignment confidence, or a saturated queue intentionally yields no overlay.
- **CUDA failure:** set `CINENIHONGO_DEVICE=cpu`; the normal auto mode also falls back automatically.
- **PowerShell blocks npm:** use `npm.cmd`. If antivirus TLS inspection is enabled, configure Node/Python to trust the operating-system certificate store rather than disabling TLS verification.

Runtime databases and any diagnostic recordings are ignored by Git.
