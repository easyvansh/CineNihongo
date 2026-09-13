# CineNihongo

CineNihongo is a Chrome/Edge extension that transcribes Japanese dialogue with a local Whisper service and displays Japanese plus romaji over top-level HTML5 video. It also plays Japanese SRT/VTT files without the backend.

> [!IMPORTANT]
> CineNihongo observes content already available in your browser and uses user-approved tab capture. It does not download media, defeat DRM, redistribute audio/subtitles, or generate Japanese from English.

## Status

Version 1.2 uses protocol 3. Reload the extension and restart the backend together after updating. CineJoy, YouTube, native text tracks, DOM captions and captionless HTML5 video use a shared player controller. See the [capability matrix](docs/site-notes.md) for explicit limitations.

## Architecture

```text
HTML5 video + optional native/DOM captions
  -> MV3 extension / tab capture (16 kHz mono PCM)
  -> FastAPI WebSocket on 127.0.0.1:8765
  -> ring buffer -> cue window -> VAD -> faster-whisper
  -> Sudachi readings -> pykakasi romaji -> alignment/cache
  -> in-player overlay
```

Audio is kept in memory only. SQLite stores text results, scoped by film and pipeline version.

## Prerequisites

- Windows 10/11, macOS, or Linux
- Chrome or Edge desktop 116+
- Node.js 22+ and npm
- Python 3.11+
- Optional NVIDIA GPU with current CUDA libraries; CPU mode works automatically

On Windows PowerShell systems that block `npm.ps1`, use `npm.cmd` as shown below.

## Setup

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
Copy-Item .env.example .env
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

The first transcription downloads the configured Whisper model. Check service state at `http://127.0.0.1:8765/health`.

The default installation uses pykakasi's bundled readings. For Sudachi's additional dictionary coverage, install the optional `full-dictionary` extra (`pip install -e ".[dev,full-dictionary]"`); it downloads roughly 40 MB.

### Extension

```powershell
cd extension
npm.cmd ci
npm.cmd run build
```

Open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist`.

## Usage

1. Start the backend.
2. Open an HTTP(S) page containing a top-level HTML5 video and start Japanese audio playback. Site subtitles are optional.
3. Open the CineNihongo popup, run diagnostics, and click **Start Live ASR**. Browser tab capture begins only after this click.
4. Watch normally. Completed site cues supply timing when present; otherwise rolling audio windows drive transcription. The first model load/download may take several minutes.
5. Click **Stop** to release capture immediately.

Live ASR is delayed: a line is shown for 2–6 media seconds after transcription arrives, with its original speech timestamps retained for Alt+R replay. File cues use their exact timestamps. Changing film/URL stops the current session; start again on the new media. Model and confidence changes take effect on the next Start.

## Japanese subtitle fallback

If capture is unavailable, choose a UTF-8 `.srt` or `.vtt` file in the popup. Japanese cues are parsed and synchronized locally without starting capture or requiring the backend. Kana receives an offline romaji fallback; the backend improves readings when available. Use the offset controls if the file and video differ.

## Configuration

Copy `backend/.env.example` to `backend/.env`. Important defaults:

| Setting | Default |
| --- | --- |
| Whisper model | `small` |
| Confidence threshold | `0.65` |
| Captionless windows | `4s`, `1s` overlap |
| Ring buffer | `15s` |
| Backend bind | `127.0.0.1:8765` |

CUDA is attempted first when configured with `CINENIHONGO_DEVICE=auto`; failures fall back to CPU `int8`.

## Development and testing

```powershell
.\scripts\dev.ps1
.\scripts\test-all.ps1
```

If Windows blocks local PowerShell scripts, run the trusted project script in a process-scoped session: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\test-all.ps1`. This does not change the machine's execution policy.

Before the first browser test, run `npx.cmd playwright install chromium` from extension. Stop a running backend before `test-all`: its capture integration test starts an isolated fixture backend on port 8765. Or run checks independently:

```powershell
cd extension; npm.cmd run check; npm.cmd run test:browser
cd backend; python -m pytest; python -m ruff check app tests; python -m mypy app
```

See [architecture](docs/architecture.md), [CineJoy notes](docs/site-notes.md), [debugging](docs/debugging.md), and the original [roadmap](CineNihongo_V2_PLAN.md).

For a backend-free file-mode smoke test, serve the repository with `python -m http.server 8080`, open `http://127.0.0.1:8080/extension/fixtures/player.html`, and load `samples/manual-ja.srt` from the popup.

## Privacy and limitations

- The backend listens on loopback only and has no analytics or cloud API.
- Audio stays in memory; no audio-recording feature is enabled.
- Music, overlapping speakers, dialect, and quiet dialogue reduce ASR quality.
- Protected or unsupported playback may prevent capture; use SRT/VTT fallback.
- Frame-only players, closed shadow roots, browser pages, native video fullscreen and PiP are outside this release's overlay support. Player-container fullscreen is supported.

## License

MIT. Use the project only with media and services you are authorized to access.
