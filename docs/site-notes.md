# Supported playback

CineNihongo 1.2 targets desktop Chrome/Edge 116+ and top-level HTTP(S) HTML5 video. Generic detection is best effort; it is not a guarantee that every streaming service exposes a usable player or permits audio capture.

| Player capability | Behavior |
| --- | --- |
| CineJoy `.player-root .lp-subtitle` | DOM cue timing, with rolling audio when captions are empty |
| YouTube caption container | DOM timing; media identity includes the video query parameter |
| Native subtitle/caption tracks | Prefer showing tracks, then hidden tracks; ignore metadata tracks |
| Generic visible HTML5 video | Prefer playing video, then visible area; detect nearby caption containers |
| No captions / empty captions | Four seconds of captured audio per rolling window, one second overlap |
| Japanese SRT/VTT file | Exact media-time synchronization, offline kana fallback, optional local-backend readings |
| Player container fullscreen | Overlay moves inside that fullscreen container |
| Native `<video>` fullscreen or Picture-in-Picture | Browser surface cannot contain the page overlay; exit this mode or use the site's container fullscreen |
| Cross-origin or same-origin iframe-only player | Not supported by this top-level release |
| Closed shadow roots, canvas/WebGL-only player | Not supported; no accessible top-level video clock |
| Protected or silent tab capture | Actionable diagnostic; use a subtitle file if an accessible video exists |
| `chrome://`, `edge://`, extension pages, browser store, local files | Injection restricted or outside HTTP(S) support |

Use **Pick Caption Element** when generic detection chooses the wrong text. Click the caption on the page; Escape cancels. The selector is stored per origin and restored on later visits. Dynamic players and captions are rediscovered every 200 ms. A different URL/media source stops the previous live session; click Start again for the new film. A same-media player replacement preserves capture with a new generation.

Live ASR listens to Japanese audio only. It cannot translate English dialogue into the original Japanese. Because transcription completes after speech, results receive a delayed presentation interval of 2–6 media seconds. Their original timestamps are retained for Alt+R replay. File cues have no processing delay. Seeks and playback-rate changes invalidate old results immediately. Supported capture rates are 0.25x–4x; speed changes also affect recognition quality.

The extension requests capture through the browser after Start is clicked, routes audio back to the output, and uses only active-tab access. The backend receives audio through the extension, so arbitrary website origins are not added to its CORS allowlist. No media requests or DRM internals are inspected.
