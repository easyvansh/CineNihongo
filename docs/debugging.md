# Troubleshooting

1. Build with `cd extension; npm.cmd ci; npm.cmd run build`. Load **extension/dist**, not the source folder. Reload an already-loaded extension after rebuilding, then refresh the video page.
2. Start the backend from the **backend** directory with `.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8765`. `/health` must report version 1.2.0 and protocol 3. Old extensions/backends are intentionally incompatible.
3. Start playback before opening the popup. Diagnostics shows the video, caption source, backend compatibility, audio sent, audio buffered, model state and queue. Copy JSON for a report; it can include the current page URL.

| Symptom/code | Next action |
| --- | --- |
| `UNSUPPORTED_PAGE` / `NO_VIDEO` | Open an HTTP(S) page with a visible top-level HTML5 video. Frame-only players and browser pages are outside support. |
| `BACKEND_OFFLINE` | Check the loopback URL and backend terminal. File mode remains usable. |
| `PROTOCOL_MISMATCH` | Restart the updated backend and reload the built extension. |
| `CAPTURE_DENIED` | Activate the video tab and click Start in its popup. Browser policy/protected playback may prevent capture. |
| `CAPTURE_LOST` / `WEBSOCKET_FAILED` | Check playback/backend, then Start again. Tracks and sessions are released on failure. |
| `SILENT_AUDIO` | Eight seconds of near-zero audio were captured. Check volume, pause/mute controls and protection restrictions. |
| Model loading | The first model download requires internet. Later transcription uses the cached local model. Use base on a slow CPU. |
| `MODEL_FAILED` | Read the displayed backend error. Check model-download connectivity/disk space and CPU/CUDA dependencies. |
| `QUEUE_FULL` | The CPU/connection is not keeping up. Select base, restart capture, and use 1x playback. Queue and audio memory are bounded. |
| Low-confidence / no-speech status | Quiet dialogue, music and overlap may produce no reliable line. Adjust confidence cautiously; lower values admit more errors. |
| File cue absent | Check file cue times and media time; positive offset delays the cue. Use valid UTF-8 SRT/VTT under 5 MB. |
| Overlay absent in fullscreen | Use the site's player-container fullscreen. Native video fullscreen and PiP cannot host DOM overlays. |

Run `scripts/test-all.ps1` (Windows) or `scripts/test-all.sh` after installing dependencies and `npx playwright install chromium` in extension. PowerShell scripts explicitly check native exit codes so a failed check cannot silently succeed.

If TLS interception prevents npm downloads, configure the system certificate store. On Node versions that support it, `$env:NODE_USE_SYSTEM_CA='1'` uses the OS trust store. Do not disable certificate verification.
