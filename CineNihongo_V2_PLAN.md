# CineNihongo V2 — Complete Project Roadmap & Implementation Plan

## 1. Project Definition

**CineNihongo V2** is a site-specific browser extension that augments English-subtitled Japanese films with **synchronized romanized Japanese dialogue**.

The target website already renders the current English subtitle in the DOM using an element like:

```html
<div class="lp-subtitle ...">
  But while you're here,
</div>
```

The website therefore already provides:
- video playback,
- subtitle timing,
- English translation,
- subtitle rendering,
- a reliable DOM event whenever the subtitle changes.

CineNihongo V2 adds the missing learning layer:

```text
Japanese audio
      ↓
Japanese speech recognition
      ↓
Japanese transcript
      ↓
reading extraction
      ↓
Hepburn romaji
      ↓
synchronized overlay
      ↓
existing English subtitle
```

Example:

```text
Koko ni iru aida wa...
But while you're here,
```

The Japanese audio is the source of truth for **what was actually spoken**.  
The English subtitle is used primarily as a **timing and segmentation anchor**, not as the source from which Japanese is reverse-translated.

---

# 2. Problem Statement

When watching Japanese films with English subtitles, a beginner can understand the meaning of a scene but cannot easily identify the Japanese words being spoken.

The learner experiences:

```text
Japanese audio
      ↓
[unknown spoken words]
      ↓
English meaning
```

CineNihongo changes that into:

```text
Japanese audio
      ↓
romanized Japanese
      ↓
English meaning
```

The initial scope is intentionally narrow:

- one known website,
- one known subtitle DOM selector,
- Japanese audio,
- English subtitles already rendered by the site,
- Chrome/Edge desktop,
- local/private use,
- no OCR,
- no generalized multi-site scraping,
- no attempt to bypass DRM or protected playback systems.

---

# 3. Final V2 User Experience

The user opens a Japanese film on the supported website.

The extension detects:

```text
<video>
.lp-subtitle
```

The user clicks:

```text
Start CineNihongo
```

During playback:

```text
          Koko ni iru aida wa...
          But while you're here,
```

The extension should:

1. detect subtitle changes,
2. record the subtitle's appearance/disappearance time,
3. obtain the corresponding Japanese audio segment where technically permitted,
4. transcribe Japanese speech,
5. convert Japanese text to readings,
6. romanize the readings,
7. align the result to the original subtitle event,
8. render the romaji above the website subtitle.

Optional debug mode:

```text
Japanese:
ここにいる間は

Romaji:
Koko ni iru aida wa...

English:
But while you're here,
```

---

# 4. Success Criteria

V2 is considered successful when all of the following work reliably on the target website.

## Core requirements

- Extension identifies the target video.
- Extension identifies `.lp-subtitle`.
- Subtitle changes are detected without polling.
- Current `video.currentTime` is captured with each subtitle event.
- Japanese audio can be processed through the selected transcription path.
- ASR returns Japanese text with timestamps.
- Japanese text is converted to readable Hepburn-style romaji.
- Correct romaji is displayed close to the corresponding English subtitle.
- Seeking backward/forward does not permanently break synchronization.
- Pause/resume works.
- Fullscreen mode works.
- Extension can be turned on/off without reloading the page.
- No audio or transcript is permanently uploaded unless explicitly configured.

## Practical quality targets

Initial targets:

```text
Subtitle-event detection: >99%
Overlay rendering:        >99%
Subtitle timing error:    <500 ms ideal
                          <1.0 s acceptable
ASR usefulness:           understandable on clear dialogue
Romaji generation:        >95% correct for ASR transcript
```

ASR accuracy itself will vary with:
- film age,
- sound quality,
- music,
- overlapping dialogue,
- dialects,
- whispers,
- background noise.

---

# 5. Architecture

## High-level system

```text
┌───────────────────────────────────────────────────────────────┐
│                         Browser                               │
│                                                               │
│   Target Website                                              │
│   ┌─────────────────────┐                                     │
│   │ <video>             │                                     │
│   │ Japanese audio      │                                     │
│   └─────────┬───────────┘                                     │
│             │                                                 │
│   ┌─────────▼───────────┐                                     │
│   │ .lp-subtitle        │                                     │
│   │ English subtitle    │                                     │
│   └─────────┬───────────┘                                     │
│             │                                                 │
│        MutationObserver                                       │
│             │                                                 │
│             ▼                                                 │
│   ┌───────────────────────────────┐                           │
│   │ CineNihongo Content Script    │                           │
│   │ - subtitle events             │                           │
│   │ - timestamps                  │                           │
│   │ - overlay                     │                           │
│   │ - playback state              │                           │
│   └─────────────┬─────────────────┘                           │
└─────────────────┼─────────────────────────────────────────────┘
                  │
                  │ localhost HTTP/WebSocket
                  ▼
┌───────────────────────────────────────────────────────────────┐
│                    Local Backend                              │
│                                                               │
│   Audio input / permitted capture                             │
│             ↓                                                 │
│   segment buffer                                              │
│             ↓                                                 │
│   faster-whisper / whisper.cpp                                │
│             ↓                                                 │
│   Japanese transcript + timestamps                            │
│             ↓                                                 │
│   Japanese tokenizer / readings                               │
│             ↓                                                 │
│   Hepburn romanization                                        │
│             ↓                                                 │
│   alignment                                                   │
│             ↓                                                 │
│   response to extension                                       │
└───────────────────────────────────────────────────────────────┘
```

---

# 6. Recommended Tech Stack

## Browser extension

- TypeScript
- Chrome Manifest V3
- Vite
- React only for popup/settings
- plain DOM APIs for content script
- MutationObserver
- HTMLVideoElement APIs
- chrome.storage.local
- WebSocket or HTTP to local backend

## Local backend

Recommended initial stack:

- Python 3.11+
- FastAPI
- Uvicorn
- faster-whisper
- PyAV / FFmpeg where needed
- Pydantic
- WebSocket support

Why Python:
- fastest route to reliable local Whisper inference,
- easy experimentation,
- excellent audio ecosystem,
- easier than forcing model inference into the extension.

## Japanese language processing

Recommended:

- fugashi + UniDic
  or
- SudachiPy

For romanization:

- pykakasi

Alternative JS path:
- kuromoji.js
- wanakana

Recommended first implementation:

```text
Japanese ASR
→ SudachiPy/fugashi
→ reading
→ pykakasi
→ Hepburn-like romaji
```

---

# 7. Repository Structure

```text
cinenihongo/
│
├── extension/
│   ├── src/
│   │   ├── content/
│   │   │   ├── index.ts
│   │   │   ├── subtitleObserver.ts
│   │   │   ├── videoController.ts
│   │   │   ├── overlay.ts
│   │   │   ├── timeline.ts
│   │   │   └── siteAdapter.ts
│   │   │
│   │   ├── background/
│   │   │   └── serviceWorker.ts
│   │   │
│   │   ├── popup/
│   │   │   ├── App.tsx
│   │   │   └── settings.ts
│   │   │
│   │   ├── shared/
│   │   │   ├── types.ts
│   │   │   ├── messages.ts
│   │   │   └── constants.ts
│   │   │
│   │   └── styles/
│   │       └── overlay.css
│   │
│   ├── manifest.json
│   ├── vite.config.ts
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   │
│   │   ├── api/
│   │   │   ├── health.py
│   │   │   ├── session.py
│   │   │   └── transcribe.py
│   │   │
│   │   ├── audio/
│   │   │   ├── capture.py
│   │   │   ├── buffer.py
│   │   │   ├── segment.py
│   │   │   └── vad.py
│   │   │
│   │   ├── asr/
│   │   │   ├── whisper_engine.py
│   │   │   └── models.py
│   │   │
│   │   ├── japanese/
│   │   │   ├── tokenizer.py
│   │   │   ├── readings.py
│   │   │   └── romanizer.py
│   │   │
│   │   ├── alignment/
│   │   │   ├── aligner.py
│   │   │   └── scoring.py
│   │   │
│   │   └── models/
│   │       └── schemas.py
│   │
│   ├── tests/
│   ├── requirements.txt
│   └── pyproject.toml
│
├── samples/
│   ├── subtitle-events.json
│   ├── japanese-samples.txt
│   └── test-audio/
│
├── scripts/
│   ├── dev.ps1
│   ├── dev.sh
│   └── test-all.sh
│
├── docs/
│   ├── architecture.md
│   ├── debugging.md
│   ├── site-notes.md
│   └── evaluation.md
│
├── README.md
└── PLAN.md
```

---

# 8. Core Data Model

## Subtitle event

```ts
type SubtitleEvent = {
  id: string;
  englishText: string;
  appearedAtVideoTime: number;
  disappearedAtVideoTime?: number;
  detectedAtWallClock: number;
};
```

## Transcript segment

```ts
type TranscriptSegment = {
  start: number;
  end: number;
  japanese: string;
  confidence?: number;
};
```

## Aligned result

```ts
type AlignedSubtitle = {
  subtitleId: string;
  english: string;
  japanese: string;
  romaji: string;
  start: number;
  end: number;
  confidence: number;
};
```

---

# 9. Site Adapter

Do not spread site-specific selectors throughout the project.

Create one adapter:

```ts
export const targetSite = {
  videoSelector: "video",
  subtitleSelector: ".lp-subtitle",
};
```

Later:

```ts
interface SiteAdapter {
  name: string;
  matches(url: URL): boolean;
  getVideo(): HTMLVideoElement | null;
  getSubtitleElement(): HTMLElement | null;
}
```

Even though V2 supports one website only, isolating this logic prevents the project from becoming brittle.

---

# 10. Milestone Roadmap

# Milestone 0 — Repository & Development Environment

## Goal

Establish a clean monorepo-style project with extension and backend running independently.

## Tasks

- initialize Git repository,
- create `extension/`,
- create `backend/`,
- add `.gitignore`,
- create README,
- create environment instructions,
- install Chrome extension build tooling,
- create FastAPI backend,
- add `/health`,
- add linting and formatting.

Extension:

```bash
npm install
npm run dev
```

Backend:

```bash
python -m venv .venv
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Acceptance criteria

Opening:

```text
http://127.0.0.1:8765/health
```

returns:

```json
{"status":"ok"}
```

Extension loads in Chrome developer mode.

---

# Milestone 1 — Detect the Target Website

## Goal

Reliably discover the video and English subtitle element.

## Tasks

Implement:

```ts
document.querySelector("video")
document.querySelector(".lp-subtitle")
```

Handle delayed rendering using:

```text
MutationObserver on document.body
```

Add console logging:

```text
[CineNihongo] video found
[CineNihongo] subtitle element found
```

## Acceptance criteria

On the target website:

- extension detects video,
- detects subtitle element,
- does not require reload after film starts.

---

# Milestone 2 — Live English Subtitle Observer

## Goal

Convert the site's changing subtitle DOM into structured events.

## Tasks

Create `subtitleObserver.ts`.

Observe:

```ts
new MutationObserver(...)
```

Capture:

```text
subtitle text
video.currentTime
Date.now()
```

Deduplicate repeated mutation events.

Example event:

```json
{
  "englishText": "But while you're here,",
  "appearedAtVideoTime": 305.21
}
```

When the next subtitle appears, close the previous event:

```text
previous.disappearedAtVideoTime = current video time
```

## Edge cases

- empty subtitle div,
- same subtitle rendered multiple times,
- CSS mutations,
- whitespace,
- text nodes added in fragments,
- pause,
- seek.

## Acceptance criteria

Watching five minutes produces a clean ordered event log with one event per subtitle.

---

# Milestone 3 — Overlay Renderer

## Goal

Display our own romaji line without touching the site's subtitle.

## Tasks

Inject:

```html
<div id="cinenihongo-overlay">
  Test romaji line
</div>
```

Position relative to the video viewport.

Requirements:

- high z-index,
- pointer-events none,
- readable shadow,
- fullscreen support,
- responsive font size,
- no collision with English subtitle.

Initial visual hierarchy:

```text
ROMAJI
English subtitle
```

Do not duplicate English.

## Acceptance criteria

Hardcoded text appears correctly:
- normal playback,
- fullscreen,
- window resize.

---

# Milestone 4 — Playback Timeline Controller

## Goal

Create a reliable abstraction around the website's video playback state.

## Tasks

Listen to:

```text
play
pause
seeking
seeked
ratechange
timeupdate
loadedmetadata
ended
```

Expose:

```ts
getCurrentTime()
isPlaying()
getPlaybackRate()
```

Maintain session state.

## Acceptance criteria

Debug panel correctly reflects:
- time,
- paused state,
- playback rate,
- seeks.

---

# Milestone 5 — Local Backend Connection

## Goal

Allow the extension to communicate with a local Python service.

## API

```text
GET  /health
POST /session/start
POST /session/stop
POST /subtitle-event
POST /transcribe
```

Prefer WebSocket later if streaming becomes necessary.

Extension status:

```text
Backend: Connected
Model: Loaded
```

## Acceptance criteria

Subtitle event reaches backend and response returns to extension.

---

# Milestone 6 — Japanese Text → Romaji Pipeline

Do this before ASR.

## Goal

Prove Japanese linguistic processing independently.

Input:

```text
一週間ここにいてもらいます
```

Output:

```text
isshūkan koko ni ite moraimasu
```

## Tasks

- tokenizer,
- reading extraction,
- punctuation preservation,
- Hepburn conversion,
- casing rules,
- long-vowel handling,
- particles,
- unknown words,
- names.

Function:

```py
romanize_japanese(text: str) -> str
```

## Test corpus

Include:
- common speech,
- names,
- contractions,
- colloquial Japanese,
- numbers,
- kanji-heavy phrases,
- katakana loanwords.

## Acceptance criteria

At least 50 hand-reviewed example sentences.

---

# Milestone 7 — Prototype ASR Independently

## Goal

Transcribe known Japanese audio outside the browser first.

## Tasks

Install faster-whisper.

Prototype:

```py
segments = model.transcribe(
    audio,
    language="ja"
)
```

Evaluate model sizes:

```text
tiny
base
small
medium
```

Start with:

```text
small
```

if laptop performance is acceptable.

Benchmark:

```text
10-second clip
30-second clip
60-second clip
```

Record:
- inference time,
- RAM,
- CPU usage,
- accuracy.

## Acceptance criteria

Given a clean Japanese film dialogue clip:

```text
audio
→ Japanese transcript
→ romaji
```

works end-to-end.

---

# Milestone 8 — Audio Acquisition Spike

## Goal

Determine the technically valid audio path for the target website.

This is the most important feasibility milestone.

Possible paths must be tested in this order.

## Path A — Web Audio API

Attempt:

```ts
const ctx = new AudioContext();
const source = ctx.createMediaElementSource(video);
```

If permitted:

```text
video
→ MediaElementAudioSourceNode
→ AudioWorklet
→ PCM frames
```

Best outcome.

## Path B — captureStream()

Test:

```ts
video.captureStream()
```

Then inspect audio tracks.

## Path C — tabCapture

Chrome extension may capture tab audio with explicit permission/user activation.

Conceptually:

```text
current tab audio
→ extension capture
→ backend
```

Use only where browser permissions and the site allow it.

## Path D — Local system loopback

For personal use, if browser-level access is unavailable:

```text
system audio output
→ local loopback capture
→ backend
```

Examples vary by operating system.

This should remain an explicit local-user setup rather than any mechanism intended to bypass protected media controls.

## Important rule

If the site uses protected/DRM playback and browser APIs deliberately prevent access to decoded audio, CineNihongo should **not attempt to circumvent those protections**.

Fallback:

```text
Japanese subtitle file mode
```

## Acceptance criteria

Document in:

```text
docs/site-notes.md
```

which permitted audio path works.

This milestone determines the final V2 architecture.

---

# Milestone 9 — Streaming Audio Buffer

## Goal

Continuously hold enough recent Japanese audio to process a subtitle event.

Maintain a ring buffer:

```text
previous 5–10 seconds
+
live incoming audio
```

Recommended format:

```text
16 kHz
mono
PCM float32/int16
```

When subtitle appears at:

```text
t = 305.20
```

we need access to audio slightly before it.

Example:

```text
303.5 → 308.5
```

## Data structure

```text
AudioRingBuffer
```

Operations:

```text
append(samples, timestamp)
slice(startTime, endTime)
clear()
```

## Acceptance criteria

Can request:

```text
give me audio from t-2s to t+3s
```

accurately.

---

# Milestone 10 — Subtitle-Driven Segmentation

## Goal

Use English subtitle events as approximate boundaries.

When subtitle A appears:

```text
t0
```

When subtitle B appears:

```text
t1
```

Initial candidate audio window:

```text
[t0 - leadPadding, t1 + tailPadding]
```

Recommended defaults:

```text
leadPadding = 0.8 s
tailPadding = 0.4 s
```

Do not hard-code permanently.

## Why this works

The English subtitle is not a linguistic transcript of the Japanese, but its timing is correlated with the relevant speech.

## Acceptance criteria

For a 10-minute sample, most candidate windows contain the intended Japanese speech.

---

# Milestone 11 — Voice Activity Detection

## Goal

Remove silence and reduce neighboring dialogue contamination.

Potential options:

- Silero VAD
- WebRTC VAD

Pipeline:

```text
subtitle candidate window
        ↓
VAD
        ↓
speech regions
        ↓
ASR
```

## Acceptance criteria

ASR receives mostly speech rather than long silent windows.

---

# Milestone 12 — ASR Worker & Queue

## Goal

Do not block video playback while transcribing.

Backend queue:

```text
subtitle event
      ↓
audio extraction
      ↓
ASR job
      ↓
Japanese transcript
      ↓
romanization
      ↓
alignment response
```

Each job:

```py
class TranscriptionJob:
    subtitle_id
    start_time
    end_time
    audio
```

## Requirements

- cancellable on major seek,
- stale results ignored,
- bounded queue,
- no duplicate transcription.

## Acceptance criteria

Film playback stays smooth while backend processes subtitles.

---

# Milestone 13 — Alignment Engine V1

## Goal

Choose the transcript segment that most likely belongs to the active English subtitle.

Initial scoring does **not** need semantic AI.

Use timing first.

For transcript segment `J` and subtitle event `E`:

```text
score =
  temporal_overlap
  + center_distance
  + duration_similarity
```

Possible formulation:

```text
score =
  0.60 * overlap_score
+ 0.25 * center_score
+ 0.15 * speech_confidence
```

Return:

```text
confidence 0..1
```

If confidence is poor:

```text
do not show uncertain romaji
```

or mark debug status.

## Acceptance criteria

On a selected test scene, correct Japanese segment is attached to most subtitle events.

---

# Milestone 14 — Incremental / Lookahead Strategy

## Problem

You often do not know the subtitle's end time until the next subtitle appears.

Therefore V2 should support two display strategies.

## Strategy A — delayed high-confidence mode

Wait until next subtitle begins.

Then process previous cue.

Latency:

```text
approximately one subtitle behind
```

Reliable but less ideal.

## Strategy B — predictive live mode

At subtitle appearance:

```text
capture previous 1s + next ~2–3s
```

then transcribe immediately.

More real-time but harder.

## Implementation order

1. delayed mode,
2. optimize,
3. predictive mode.

## Acceptance criteria

Delayed mode must work before real-time optimization begins.

---

# Milestone 15 — Caching

Films contain pauses, seeks, rewatches, and repeated segments.

Cache by:

```text
film/session
start time
end time
```

Store:

```json
{
  "start": 305.2,
  "end": 308.7,
  "japanese": "...",
  "romaji": "..."
}
```

Local only.

Possible storage:

```text
SQLite
```

or temporary JSON for MVP.

## Benefits

Seeking backwards becomes instant.

## Acceptance criteria

Replaying an already processed scene does not run Whisper again.

---

# Milestone 16 — Seek Recovery

## Goal

Handle:

```text
user jumps from 5:00 → 45:00
```

On `seeking`:

- invalidate pending live transcription,
- clear temporary audio buffers,
- keep persistent cache.

On `seeked`:

- reset observer timing,
- create new timeline anchor.

## Acceptance criteria

After arbitrary seeking, subtitles recover within one or two subtitle events.

---

# Milestone 17 — Playback Rate Handling

If playback becomes:

```text
0.75x
1.25x
1.5x
```

video timestamps remain authoritative.

Never synchronize using wall-clock time.

Use:

```text
video.currentTime
```

for all alignment.

## Acceptance criteria

Romaji remains aligned at supported playback rates.

---

# Milestone 18 — Settings Popup

Minimal UI:

```text
CineNihongo

Status
● Connected

[ Start ]
[ Stop ]

Display
[x] Romaji
[ ] Japanese
[x] Native English subtitles

Transcription
Model: small
Confidence threshold: 0.65

Advanced
[ ] Debug overlay
```

Do not overdesign.

---

# Milestone 19 — Japanese Script Toggle

Even though the initial learning goal is romaji, preserve transcript internally.

Allow:

```text
ここにいる間は
Koko ni iru aida wa...
```

or:

```text
Koko ni iru aida wa...
```

Why:

The learner may eventually transition from romaji to kana/kanji.

---

# Milestone 20 — Replay Current Dialogue

Add optional keyboard shortcut:

```text
R
```

Behavior:

```text
seek to cue start
play
```

Potential later controls:

```text
Shift+R = repeat three times
```

Not required for initial V2 completion.

---

# Milestone 21 — Debug Overlay

During development provide:

```text
CineNihongo Debug

Video: 305.41
Cue: 305.20–308.77
ASR: ここにいる間は
Romaji: koko ni iru aida wa
Confidence: 0.82
Latency: 690 ms
```

This will save enormous debugging time.

Must be disabled by default in normal use.

---

# 11. Real-Time Processing Strategy

Do **not** transcribe the entire film repeatedly.

Preferred strategy:

```text
continuous small audio ring buffer
+
subtitle-event-triggered transcription
```

This dramatically reduces compute.

Example:

```text
movie = 2 hours
```

Instead of constantly running ASR:

```text
process only relevant dialogue windows
```

This matters especially on a laptop.

---

# 12. Performance Strategy

## Default model

Start with:

```text
faster-whisper small
```

Then benchmark.

Possible configuration:

```py
WhisperModel(
    "small",
    device="cpu",
    compute_type="int8"
)
```

If too slow:

```text
base
```

If machine handles more:

```text
medium
```

## Targets

Per subtitle window:

```text
audio length: ~2–6 seconds
processing: ideally <1 second
```

A slightly delayed display is acceptable initially.

---

# 13. Alignment Evolution

## Alignment V1

Timing only.

## Alignment V2

Timing + ASR word timestamps.

## Alignment V3

Timing + semantic relation between:
- Japanese transcript translation,
- existing English subtitle.

Important:

English is not used to **generate Japanese**.

It may only be used as a **validation signal**.

Example:

```text
Japanese ASR
     ↓
machine translation for scoring only
     ↓
compare to English DOM subtitle
```

If similarity is low:

```text
reduce confidence
```

This is much safer than reverse-translating English and pretending that it was spoken.

---

# 14. Error Handling

## No subtitle element

Show:

```text
CineNihongo: subtitle element not found
```

## No video

Show:

```text
Video player not detected
```

## Backend offline

Show:

```text
Local transcription service unavailable
```

## ASR timeout

Skip cue instead of freezing the extension.

## Poor confidence

Do not hallucinate.

Possible display:

```text
[…]
```

Better to omit uncertain text than teach incorrect Japanese.

---

# 15. Fallback Japanese Subtitle Mode

Although V2 prioritizes automatic Japanese transcription, implement this after the core architecture if browser audio capture is blocked or ASR proves unreliable.

User selects:

```text
movie-ja.srt
```

Pipeline:

```text
Japanese SRT
      ↓
parse timestamps
      ↓
video.currentTime
      ↓
active Japanese cue
      ↓
romanize
      ↓
overlay
```

This fallback shares the same:

- overlay,
- timeline,
- romanization,
- cache,
- UI.

Only the Japanese transcript source changes.

Define interface:

```ts
interface JapaneseSource {
  getJapaneseForTime(time: number): Promise<JapaneseResult | null>;
}
```

Implement:

```text
WhisperJapaneseSource
SrtJapaneseSource
```

This is the cleanest architecture.

---

# 16. Testing Plan

## Unit tests

Extension:

```text
subtitle text normalization
deduplication
timeline state
site adapter
overlay updates
```

Backend:

```text
romanization
audio buffers
alignment scoring
cache
job cancellation
```

## Integration tests

Use synthetic subtitle events:

```json
[
  {
    "text": "But while you're here,",
    "start": 10.0,
    "end": 12.5
  }
]
```

Feed test audio.

Expected:

```text
Japanese → correct transcript
Romaji → expected output
```

## Manual test matrix

Test:

```text
play
pause
resume
seek forward
seek backward
fullscreen
exit fullscreen
change playback speed
hide subtitles
show subtitles
long silence
two speakers
music
quiet dialogue
```

---

# 17. Evaluation Dataset

Before polishing, build a small manually verified dataset.

Take approximately:

```text
50–100 subtitle events
```

from:
- After Life,
- one modern Japanese movie,
- one noisy/older film.

For each:

```json
{
  "start": 305.2,
  "english": "But while you're here,",
  "expected_japanese": "...",
  "expected_romaji": "..."
}
```

Measure:

- ASR correctness,
- alignment correctness,
- romanization correctness,
- latency.

This turns the project from a demo into an engineering project with evidence.

---

# 18. Development Phases

## Phase A — Extension foundation

Milestones:

```text
0–4
```

Deliverable:

```text
live website subtitle observer
+
overlay
+
timeline
```

Expected effort:

```text
1–2 focused days
```

---

## Phase B — Language pipeline

Milestones:

```text
5–7
```

Deliverable:

```text
Japanese text/audio
→ transcript
→ romaji
```

Expected effort:

```text
1–2 days
```

---

## Phase C — Audio feasibility

Milestone:

```text
8
```

Deliverable:

```text
confirmed audio acquisition strategy
```

Expected effort:

```text
half day–2 days
```

This is the highest-risk stage.

Do this **before** building a complex streaming backend.

---

## Phase D — Real-time engine

Milestones:

```text
9–15
```

Deliverable:

```text
subtitle events
→ Japanese ASR
→ alignment
→ synchronized romaji
```

Expected effort:

```text
3–6 days
```

---

## Phase E — Reliability

Milestones:

```text
16–21
```

Deliverable:

```text
usable personal extension
```

Expected effort:

```text
2–4 days
```

---

## Total realistic MVP

Focused build:

```text
~7–14 days
```

Polished version:

```text
~2–3 weeks
```

depending primarily on audio access and ASR latency.

---

# 19. Implementation Order

Do not jump directly to Whisper.

Implement strictly in this order:

```text
1. repo
2. detect video
3. detect subtitle div
4. subtitle MutationObserver
5. log timestamps
6. overlay
7. playback controller
8. backend health connection
9. Japanese romanization
10. standalone Whisper test
11. TARGET-WEBSITE AUDIO FEASIBILITY SPIKE
12. audio ring buffer
13. subtitle segmentation
14. ASR queue
15. alignment
16. overlay real results
17. seek recovery
18. cache
19. settings
20. debugging
21. evaluation
```

The project should have a working visible result after every few milestones.

---

# 20. First End-to-End Prototype

The first meaningful prototype should perform:

```text
Target website
      ↓
detect subtitle:
"But while you're here,"
      ↓
timestamp:
305.21
      ↓
obtain Japanese audio segment
      ↓
Whisper:
ここにいる間は
      ↓
Romanizer:
koko ni iru aida wa
      ↓
overlay:
Koko ni iru aida wa...
```

If this works for a single line, the architecture is proven.

Do not optimize anything before this test succeeds.

---

# 21. Security & Privacy

Default architecture should be:

```text
100% local processing
```

No account.

No cloud database.

No analytics.

No film audio storage beyond temporary buffers unless debug recording is explicitly enabled.

Backend:

```text
127.0.0.1 only
```

not:

```text
0.0.0.0
```

unless necessary.

---

# 22. Copyright / Site Compatibility Boundary

The project is intended as a personal language-learning overlay.

The extension should:

- observe DOM subtitles already presented to the user,
- process locally accessible playback signals where browser/site permissions permit,
- avoid redistributing media or subtitles,
- avoid attempting to defeat DRM or protected playback restrictions,
- provide Japanese SRT/VTT fallback if direct audio capture is unavailable.

---

# 23. What Not to Build Yet

Do not include in V2:

- universal website support,
- OCR,
- mobile version,
- user accounts,
- cloud synchronization,
- vocabulary database,
- spaced repetition,
- AI tutor,
- automatic grammar explanations,
- translation generation,
- Chrome Web Store publishing,
- Netflix-wide support,
- YouTube-wide support,
- subtitle scraping services,
- entire-film pretranscription,
- fancy dashboard.

All of these can wait until the fundamental learning overlay works.

---

# 24. Nice-to-Have V2.1 Features

Only after V2 is stable:

```text
hover Japanese word
→ reading
→ meaning
```

```text
click word
→ save vocabulary
```

```text
R
→ replay dialogue
```

```text
E
→ toggle English
```

```text
J
→ toggle Japanese script
```

```text
Space
→ normal playback
```

Progressive learning modes:

```text
Beginner:
Romaji + English

Intermediate:
Japanese + Romaji + English-on-hover

Advanced:
Japanese only
```

---

# 25. Future V3

Once the single-site version is reliable:

```text
SiteAdapter abstraction
```

can support more sites.

Potential V3:

```text
YouTube
local HTML5 players
self-hosted video sites
other streaming platforms where permitted
```

Architecture remains:

```text
website adapter
      ↓
timeline
      ↓
Japanese source
      ↓
alignment
      ↓
learning overlay
```

---

# 26. Resume / Portfolio Value

The final project can demonstrate:

- browser extension engineering,
- real-time DOM observation,
- media synchronization,
- local AI inference,
- speech recognition,
- NLP,
- Japanese morphological analysis,
- timestamp alignment,
- asynchronous job processing,
- caching,
- WebSocket/HTTP integration,
- performance optimization,
- privacy-first local architecture,
- UX for language learning,
- evaluation methodology.

Suggested resume framing:

> Built a Chrome extension and local inference pipeline that synchronizes Japanese speech recognition with dynamically rendered English subtitles, generating real-time Hepburn-romaji dialogue overlays for language learners. Implemented DOM event capture, media timeline alignment, local Whisper ASR, Japanese morphological processing, caching, and seek-safe playback synchronization.

---

# 27. Definition of Done

CineNihongo V2 is complete when:

```text
1. User opens supported website.
2. Plays Japanese film.
3. English subtitles are active.
4. User clicks Start CineNihongo.
5. Extension detects subtitle changes.
6. Japanese audio is processed locally.
7. Japanese speech is transcribed.
8. Transcript is romanized.
9. Romaji appears above the English subtitle.
10. Pause/play/seek/fullscreen all recover correctly.
11. Previously processed dialogue is cached.
12. Poor-confidence results are omitted rather than guessed.
13. The system works for a sustained 15–30 minute viewing session.
```

The finished V2 should feel like:

```text
Open movie
→ Start CineNihongo
→ Watch normally
→ Follow the Japanese words as they are spoken
```

No manual copying, no pausing every sentence, and ideally no Japanese subtitle file.

---

# 28. Immediate Next Sprint

## Sprint 1

Build only:

```text
extension shell
→ target-site detection
→ MutationObserver
→ timestamp logger
→ hardcoded romaji overlay
```

Deliverable:

When:

```html
<div class="lp-subtitle">
  But while you're here,
</div>
```

appears, console logs:

```text
[CineNihongo]
305.21
But while you're here,
```

and overlay shows:

```text
TEST ROMAJI
```

above the English subtitle.

## Sprint 2

Build:

```text
FastAPI backend
+
Japanese romanizer
+
standalone Whisper test
```

## Sprint 3

Run the **audio acquisition feasibility spike** on the actual target website.

Only after that should the real-time transcription path be finalized.

---

# 29. Core Engineering Principle

Never generate Japanese from the English subtitle and present it as though it were the film's actual dialogue.

Use:

```text
Japanese audio = source of truth
English subtitle = timing/context signal
```

This is the fundamental requirement that makes CineNihongo useful as a real language-learning tool rather than merely a translation overlay.
