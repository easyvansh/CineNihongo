# Architecture

CineNihongo has two trust zones. The MV3 extension is injected into the active tab after user activation and selects a CineJoy, YouTube, native-text-track, or generic HTML5 adapter. A FastAPI service on `127.0.0.1` owns inference and persistent text caching.

## Extension lifecycle

The content controller selects the largest visible/playing video and observes adapter-specific DOM captions or native text tracks. Its fixed overlay follows the video rectangle and survives player replacement. File cues run entirely in this controller and do not require capture or a backend. The service worker owns acknowledged live-ASR startup and proxies localhost requests. An offscreen AudioWorklet downmixes/resamples tab audio and sends header/binary frame pairs over WebSocket.

Seek generations are monotonic. Both audio and subtitle messages carry the current generation, and the backend clears transient state when it advances.

## Backend lifecycle

Each session has a bounded audio buffer, WebSocket subscribers, results, a film identity, and model configuration. Closed cues enter a bounded queue. Workers slice audio with padding, trim silence, run Japanese Whisper, romanize the transcript, score timing alignment, cache accepted results, and publish them.

SQLite contains transcript results only. Audio remains in memory unless debug recording is explicitly added and enabled in a future diagnostic build.
