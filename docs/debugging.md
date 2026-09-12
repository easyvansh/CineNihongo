# Debugging

- **Player not detected:** start playback, open the popup, and run diagnostics. The extension selects the largest visible HTML5 video.
- **Backend unavailable:** open `http://127.0.0.1:8765/health`; ensure Uvicorn is bound to loopback port 8765.
- **No tab audio:** Stop, play the movie, then Start again from the popup. Chrome requires user activation for capture.
- **No result:** enable Debug overlay. Silence, low ASR/alignment confidence, or a saturated queue intentionally yields no overlay.
- **SRT/VTT not visible:** confirm diagnostics says `file-ready`, verify the cue range overlaps the displayed media time, then adjust the subtitle offset. File mode does not require the backend.
- **Wrong caption element:** click **Pick Caption Element**, then click the visible site caption on the page. The selector is saved for that origin.
- **CUDA failure:** set `CINENIHONGO_DEVICE=cpu`; the normal auto mode also falls back automatically.
- **PowerShell blocks npm:** use `npm.cmd`. If antivirus TLS inspection is enabled, configure Node/Python to trust the operating-system certificate store rather than disabling TLS verification.

Runtime databases and any diagnostic recordings are ignored by Git.
