# Architecture

CineNihongo has two trust zones. The MV3 extension observes CineJoy playback and captures audio only after user activation. A FastAPI service on `127.0.0.1` owns all inference and persistent text caching.

## Extension lifecycle

The content script discovers `.player-root`, its `video`, and `.lp-subtitle`. It reattaches when Svelte replaces nodes. Subtitle mutations produce media-time cues. The background service worker obtains a tab-capture stream ID and delegates long-running media processing to an offscreen document. An AudioWorklet downmixes audio; the offscreen document resamples and sends header/binary frame pairs over WebSocket.

Seek generations are monotonic. Both audio and subtitle messages carry the current generation, and the backend clears transient state when it advances.

## Backend lifecycle

Each session has a bounded audio buffer, WebSocket subscribers, results, a film identity, and model configuration. Closed cues enter a bounded queue. Workers slice audio with padding, trim silence, run Japanese Whisper, romanize the transcript, score timing alignment, cache accepted results, and publish them.

SQLite contains transcript results only. Audio remains in memory unless debug recording is explicitly added and enabled in a future diagnostic build.
