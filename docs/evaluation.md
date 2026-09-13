# Evaluation

## Automated coverage

`npm run check` covers cue scheduling, rolling-window overlap and final flush, UTF-8 and invalid subtitle files, resampler continuity, pause/rate changes, silence, capture denial, track loss, WebSocket failure and bounded backlog. `npm run test:browser` loads a copy of the actual built MV3 extension in a temporary Chromium profile, granting only the local fixture host for scripted injection. It covers offline files, expiry/offset, native/DOM source selection, caption picking, player replacement, fullscreen, seeks and SPA cleanup.

For the full capture integration test, stop any backend using port 8765 and run `npm run test:capture` from **extension** after installing the backend into its `.venv`. The runner starts a deterministic backend with a temporary database and cleans it up automatically. To run the components manually, start the deterministic test backend from **backend**:

```powershell
.\.venv\Scripts\python.exe -m uvicorn browser_backend:app --app-dir tests --host 127.0.0.1 --port 8765
```

Then from **extension** run `node scripts/browser-test.mjs --capture`. Stop the test backend afterwards; its transcripts are fixed test data. This test exercises real tab capture, AudioWorklet, resampling, WebSocket transport, backend window processing, romanization and overlay. It uses a generated tone and an inference double, so it does **not** measure Whisper accuracy. Only its temporary browser profile grants capture to the generated test extension ID; normal browser settings and the production manifest are unchanged.

Backend pytest covers protocol validation, session ownership, invalid audio, paused seeks, queue snapshots, duplicate windows and stale result suppression. `python -m app.smoke path/to/japanese-audio.ogg` runs real local CPU inference separately, with a model download on first use. See [sample attribution](../samples/ATTRIBUTION.md).

## Real speech/site evaluation

Evaluate 50–100 manually verified cues across a clear modern film, an older/noisy film, and *After Life* (`17962`). Record film ID, start/end, English timing anchor, expected Japanese, expected romaji, returned confidence, latency, and correctness.

These are evaluation targets, not measured guarantees: file cue timing should track the 200 ms controller interval; live results necessarily include capture-window and inference delay. Measure recognition accuracy, romanization and end-to-end latency separately. Automated fixtures do not certify every third-party streaming service or protected player.
