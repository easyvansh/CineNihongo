import { DEFAULT_SETTINGS, type AlignedSubtitle, type CapabilityReport, type RuntimeMessage, type RuntimeState, type Settings } from '../shared/types';
import { cueAt, fallbackRomanize, parseSubtitleFile, type FileCue } from './subtitleFile';
import { activeTrack, currentTrackText, detectSite, normalizeSubtitle } from './siteAdapter';
import { Overlay } from './overlay';
import { CueScheduler, inInterval, type CueWindow } from './cueScheduler';

declare global { interface Window { __cinenihongoLoaded?: boolean; } }
if (!window.__cinenihongoLoaded) {
  window.__cinenihongoLoaded = true;
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let selector = ''; let picked: HTMLElement | null = null; let site = detectSite();
  let video: HTMLVideoElement | null = null; let videoEvents: AbortController | null = null;
  let overlay: Overlay | null = null; let sessionId: string | null = null; let generation = 0;
  let source = ''; let identity = ''; let discontinuity = true;
  let result: AlignedSubtitle | null = null; let displayStart = 0; let displayEnd = 0; let latestSourceEnd = -1;
  let fileCues: FileCue[] = []; let activeFileCue: FileCue | null = null; let fileRequest = 0;
  let hiddenElement: HTMLElement | null = null; let originalVisibility = ''; let originalPriority = '';
  let hiddenTrack: TextTrack | null = null; let originalTrackMode: TextTrackMode = 'showing';
  let picker: AbortController | null = null;
  let state: RuntimeState = { phase: 'idle' };
  const scheduler = new CueScheduler();
  const romanized = new Map<string, string>();
  const send = (message: RuntimeMessage) => chrome.runtime.sendMessage(message);
  const capability = (backendReachable = false): CapabilityReport => ({ adapter: site.adapter, frameId: 0, videoFound: Boolean(video), subtitleSource: fileCues.length ? 'file' : site.subtitleSource, backendReachable, captureSupported: location.protocol === 'http:' || location.protocol === 'https:', mediaId: site.mediaId, warnings: site.warnings });
  function restoreCaptions() {
    if (hiddenElement) {
      if (hiddenElement.style.visibility === 'hidden') hiddenElement.style.setProperty('visibility', originalVisibility, originalPriority);
      hiddenElement = null;
    }
    if (hiddenTrack) { if (hiddenTrack.mode === 'hidden') hiddenTrack.mode = originalTrackMode; hiddenTrack = null; }
  }
  function captions() {
    if (settings.showEnglish || (!sessionId && !fileCues.length)) { restoreCaptions(); return; }
    if (hiddenElement !== site.subtitleElement || hiddenTrack !== (video ? activeTrack(video) : null)) restoreCaptions();
    if (site.subtitleElement && !hiddenElement) {
      hiddenElement = site.subtitleElement; originalVisibility = hiddenElement.style.visibility;
      originalPriority = hiddenElement.style.getPropertyPriority('visibility'); hiddenElement.style.setProperty('visibility', 'hidden', 'important');
    } else if (!site.subtitleElement && video && !hiddenTrack) {
      hiddenTrack = activeTrack(video); if (hiddenTrack) { originalTrackMode = hiddenTrack.mode; hiddenTrack.mode = 'hidden'; }
    }
  }
  function reset() {
    generation++; discontinuity = true; result = null; latestSourceEnd = -1;
    activeFileCue = null; fileRequest++; scheduler.reset(video?.currentTime ?? 0);
  }
  function render() {
    const now = video?.currentTime ?? 0; state.mediaTime = now;
    if (result && !inInterval(now, displayStart, displayEnd)) result = null;
    overlay?.render(result, settings, state); captions();
  }
  function submit(windows: CueWindow[]) {
    if (!sessionId || !video) return;
    for (const cue of windows) {
      const id = sessionId; const gen = generation;
      void send({ type: 'SUBTITLE_EVENT', event: { id: crypto.randomUUID(), sessionId: id, filmId: identity, englishText: cue.text, appearedAtVideoTime: cue.start, disappearedAtVideoTime: cue.end, detectedAtWallClock: Date.now(), generation: gen, windowKind: cue.kind, playbackRate: video.playbackRate } })
        .then((reply: RuntimeState) => { if (id === sessionId && gen === generation && reply?.lastError) state.lastError = reply.lastError; })
        .catch(() => { if (id === sessionId) state.lastError = { code: 'BACKEND_OFFLINE', message: 'Could not submit audio window. Stop and start again.' }; });
    }
  }
  function attach() {
    const next = detectSite(selector, picked);
    const changedMedia = Boolean(identity && (next.mediaId !== identity || (source && next.video?.currentSrc && source !== next.video.currentSrc)));
    if (changedMedia) {
      // A new film requires a new server session/cache identity and explicit restart.
      const wasLive = Boolean(sessionId); stop();
      if (wasLive) { void send({ type: 'STOP' }).catch(() => undefined); state.lastError = { code: 'CAPTURE_LOST', message: 'Media changed. Start Live ASR again for this video.' }; }
    }
    if (next.subtitleElement !== site.subtitleElement) restoreCaptions();
    site = next; identity = next.mediaId; source = next.video?.currentSrc ?? '';
    if (next.video !== video) {
      restoreCaptions(); videoEvents?.abort(); overlay?.destroy(); overlay = null;
      video = next.video; reset();
      if (video) {
        overlay = new Overlay(video); videoEvents = new AbortController();
        const options = { signal: videoEvents.signal };
        video.addEventListener('seeking', reset, options);
        video.addEventListener('ratechange', reset, options);
        video.addEventListener('pause', () => { submit(scheduler.finish(video!.currentTime, video!.playbackRate)); sync(); }, options);
        video.addEventListener('play', () => { scheduler.reset(video!.currentTime); discontinuity = true; sync(); }, options);
        video.addEventListener('ended', () => { submit(scheduler.finish(video!.currentTime, video!.playbackRate)); sync(); }, options);
      }
    }
  }
  function sync() {
    if (!sessionId || !video) return;
    void send({ type: 'CAPTURE_SYNC', sessionId, mediaTime: video.currentTime, generation, paused: video.paused || video.ended || video.seeking, playbackRate: video.playbackRate, discontinuity }).catch(() => undefined);
    discontinuity = false;
  }
  function fileCue(cue: FileCue) {
    const request = ++fileRequest;
    result = { subtitleId: `file-${cue.start}`, filmId: identity, english: '', japanese: cue.text, romaji: romanized.get(cue.text) ?? fallbackRomanize(cue.text), start: cue.start, end: cue.end, confidence: 1, source: 'subtitle-file' };
    displayStart = cue.start + settings.subtitleOffset; displayEnd = cue.end + settings.subtitleOffset;
    render();
    if (!romanized.has(cue.text)) void send({ type: 'ROMANIZE', text: cue.text }).then((reply: { romaji?: string }) => {
      if (reply?.romaji) { romanized.set(cue.text, reply.romaji); if (romanized.size > 500) romanized.delete(romanized.keys().next().value!); }
      if (request === fileRequest && cue === activeFileCue && result && reply?.romaji) { result.romaji = reply.romaji; state.mode = 'romanized-file'; render(); }
    }).catch(() => undefined);
  }
  function tick() {
    attach(); if (!video) { render(); return; }
    const now = video.currentTime;
    if (fileCues.length) {
      const cue = cueAt(fileCues, now - settings.subtitleOffset);
      if (cue !== activeFileCue) { activeFileCue = cue; if (cue) fileCue(cue); else { fileRequest++; result = null; } }
    }
    if (sessionId) {
      sync();
      if (!video.paused && !video.seeking && !video.ended) {
        const text = site.subtitleElement ? normalizeSubtitle(hiddenElement === site.subtitleElement ? site.subtitleElement.textContent : site.subtitleElement) : currentTrackText(video);
        submit(scheduler.caption(text, now));
        // An empty/disabled caption container must not suppress rolling ASR.
        submit(scheduler.tick(now, Boolean(text), video.playbackRate));
      }
    }
    render();
  }
  function stop() {
    sessionId = null; fileCues = []; activeFileCue = null; picker?.abort(); picker = null;
    reset(); restoreCaptions(); state = { phase: 'idle' }; render();
  }
  function beginPicker() {
    picker?.abort(); picker = new AbortController();
    const cancel = () => { picker?.abort(); picker = null; };
    addEventListener('keydown', e => { if (e.key === 'Escape') cancel(); }, { capture: true, signal: picker.signal });
    addEventListener('click', e => {
      e.preventDefault(); e.stopImmediatePropagation();
      picked = e.target instanceof HTMLElement ? e.target : null;
      if (picked) {
        const parts: string[] = []; let el: HTMLElement | null = picked;
        while (el && el !== document.documentElement) {
          if (el.id) { parts.unshift(`#${CSS.escape(el.id)}`); break; }
          const tag = el.tagName.toLowerCase(); const siblings: Element[] = el.parentElement ? [...el.parentElement.children].filter(s => s.tagName === el!.tagName) : [];
          parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(el) + 1})`); el = el.parentElement;
        }
        selector = parts.join(' > '); void chrome.storage.local.set({ [`captionSelector:${location.origin}`]: selector });
      }
      cancel(); tick();
    }, { capture: true, signal: picker.signal });
  }
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, respond) => {
    if (message.type === 'DETECT') { attach(); respond(capability(message.backendReachable)); }
    else if (message.type === 'GET_STATE' && !('tabId' in message)) respond({ ...state, capability: capability(state.capability?.backendReachable) });
    else if (message.type === 'LIVE_SESSION') {
      stop(); settings = { ...DEFAULT_SETTINGS, ...message.settings }; attach(); sessionId = message.sessionId;
      reset(); state = { phase: 'capturing', mode: 'live-asr', capability: capability(true) }; tick(); respond({ ok: true });
    } else if (message.type === 'IMPORT_SUBTITLES') {
      const parsed = parseSubtitleFile(message.text); attach();
      if (!video || !parsed.length) { respond({ phase: 'error', lastError: { code: video ? 'NO_SUBTITLE_SOURCE' : 'NO_VIDEO', message: video ? 'No valid SRT/VTT cues found.' : 'No visible HTML5 video found.' } }); return; }
      stop(); settings = { ...DEFAULT_SETTINGS, ...message.settings }; fileCues = parsed;
      state = { phase: 'file-ready', mode: 'subtitle-file', filename: message.filename, cueCount: parsed.length, capability: capability(false) }; tick(); respond(state);
    } else if (message.type === 'BEGIN_PICK_SUBTITLE') { beginPicker(); respond({ ok: true }); }
    else if (message.type === 'SETTINGS_UPDATED') { settings = { ...DEFAULT_SETTINGS, ...message.settings }; activeFileCue = null; tick(); respond({ ok: true }); }
    else if (message.type === 'ALIGNED_RESULT') {
      const next = message.result;
      if (sessionId && next.sessionId === sessionId && next.generation === generation && next.filmId === identity && next.end > latestSourceEnd && video && video.currentTime - next.end < 15) {
        latestSourceEnd = next.end;
        // ASR completes after speech: give it an explicit delayed presentation interval.
        // Keep original start/end for replay; file cues retain their exact source times.
        if (result?.japanese !== next.japanese || video.currentTime >= displayEnd) {
          result = next; displayStart = video.currentTime;
          displayEnd = displayStart + Math.max(2, Math.min(6, next.end - next.start));
        }
        state.phase = 'processing'; state.lastResultTime = next.end; render();
      }
      respond({ ok: true });
    } else if (message.type === 'CAPTURE_STATE' && sessionId && message.sessionId === sessionId) {
      state = { ...state, ...message, phase: message.state, lastError: message.detail ? { code: message.code ?? 'UNKNOWN', message: message.detail } : undefined };
      if (message.state === 'error') { sessionId = null; reset(); restoreCaptions(); } render(); respond({ ok: true });
    } else if (message.type === 'CONTENT_STOP') { stop(); respond({ ok: true }); }
    else if (message.type === 'REPLAY') { if (video && result) { video.currentTime = Math.max(0, result.start); void video.play().catch(() => undefined); } respond({ ok: true }); }
  });
  void chrome.storage.local.get(`captionSelector:${location.origin}`).then(saved => { selector = saved[`captionSelector:${location.origin}`] ?? ''; tick(); }).catch(() => undefined);
  // One polling owner handles replaced elements, track changes and SPA URLs without
  // observing our own overlay mutations or overwriting site oncuechange handlers.
  let interval = setInterval(tick, 200);
  addEventListener('pagehide', () => { const live = Boolean(sessionId); stop(); clearInterval(interval); videoEvents?.abort(); overlay?.destroy(); overlay = null; video = null; if (live) void send({ type: 'STOP' }).catch(() => undefined); });
  addEventListener('pageshow', event => { if (event.persisted) { clearInterval(interval); interval = setInterval(tick, 200); tick(); } });
  tick();
}
