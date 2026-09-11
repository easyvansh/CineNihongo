# CineNihongo

CineNihongo is a privacy-first Chrome/Edge extension that listens to Japanese dialogue playing in a CineJoy movie, transcribes it with a local Whisper service, and displays Japanese and Hepburn-style romaji above the site's English subtitle.

> [!IMPORTANT]
> CineNihongo observes content already available in your browser and uses user-approved tab capture. It does not download media, defeat DRM, redistribute audio/subtitles, or generate Japanese from English.

## Status

Version 1.0.0 implements the complete local pipeline for `https://cinejoy.to/watch/movie/*`: subtitle observation, tab-audio streaming, local Japanese ASR, romanization, alignment, caching, seek recovery, debug information, and SRT/VTT fallback.

## Architecture

```text
CineJoy video + .lp-subtitle
  -> MV3 extension / tab capture (16 kHz mono PCM)
  -> FastAPI WebSocket on 127.0.0.1:8765
  -> ring buffer -> cue window -> VAD -> faster-whisper
  -> Sudachi readings -> pykakasi romaji -> alignment/cache
  -> in-player overlay
```

Audio is kept in memory only. SQLite stores text results, scoped by film and pipeline version.

## Prerequisites

- Windows 10/11, macOS, or Linux
- Chrome or Edge desktop
- Node.js 20+ and npm
- Python 3.11+
- FFmpeg available on `PATH`
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
npm.cmd install
npm.cmd run build
```

Open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist`.

## Usage

1. Start the backend.
2. Open a CineJoy URL matching `/watch/movie/{filmId}` and enable English subtitles.
3. Open the CineNihongo popup and click **Start**. Browser tab capture begins only after this click.
4. Watch normally. Completed English cues trigger Japanese transcription and the overlay.
5. Click **Stop** to release capture immediately.

Delayed mode is the reliable default: a cue is processed once the next cue establishes its end. Predictive mode can be enabled in Advanced settings.

## Japanese subtitle fallback

If capture is unavailable, choose a UTF-8 `.srt` or `.vtt` file in the popup. Japanese cues are parsed locally, romanized by the localhost service, and synchronized using `video.currentTime`.

## Configuration

Copy `backend/.env.example` to `backend/.env`. Important defaults:

| Setting | Default |
| --- | --- |
| Whisper model | `small` |
| Confidence threshold | `0.65` |
| Lead/tail padding | `0.8s` / `0.4s` |
| Ring buffer | `15s` |
| Backend bind | `127.0.0.1:8765` |

CUDA is attempted first when configured with `CINENIHONGO_DEVICE=auto`; failures fall back to CPU `int8`.

## Development and testing

```powershell
.\scripts\dev.ps1
.\scripts\test-all.ps1
```

Or run independently:

```powershell
cd extension; npm.cmd run check
cd backend; python -m pytest; python -m ruff check app tests; python -m mypy app
```

See [architecture](docs/architecture.md), [CineJoy notes](docs/site-notes.md), [debugging](docs/debugging.md), and the original [roadmap](CineNihongo_V2_PLAN.md).

## Privacy and limitations

- The backend listens on loopback only and has no analytics or cloud API.
- No audio is written unless explicit debug recording is enabled.
- Music, overlapping speakers, dialect, and quiet dialogue reduce ASR quality.
- Protected or unsupported playback may prevent capture; use SRT/VTT fallback.
- CineJoy DOM changes can require adapter maintenance.

## License

MIT. Use the project only with media and services you are authorized to access.
