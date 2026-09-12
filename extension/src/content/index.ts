import { DEFAULT_SETTINGS, type AlignedSubtitle, type CapabilityReport, type RuntimeMessage, type RuntimeState, type Settings, type SubtitleEvent } from "../shared/types";
import { cueAt, fallbackRomanize, parseSubtitleFile, type FileCue } from "./subtitleFile";
import { currentTrackText, detectSite, normalizeSubtitle, type DetectedSite } from "./siteAdapter";
import { Overlay } from "./overlay";
import { SubtitleObserver } from "./subtitleObserver";

declare global { interface Window { __cinenihongoLoaded?: boolean; } }

if (!window.__cinenihongoLoaded) {
  window.__cinenihongoLoaded = true;
  let settings: Settings = DEFAULT_SETTINGS; let customSelector = ""; let site: DetectedSite = detectSite(); let video: HTMLVideoElement | null = null; let overlay: Overlay | null = null; let observer: SubtitleObserver | null = null;
  let sessionId: string | null = null; let generation = 0; let current: SubtitleEvent | null = null; let result: AlignedSubtitle | null = null; let fileCues: FileCue[] = []; let activeFileCue: FileCue | null = null; let lastRollingAt = 0; let discontinuity = false;
  let state: RuntimeState = { phase: "idle" };

  const capability = (backendReachable = false): CapabilityReport => ({ adapter: site.adapter, frameId: 0, videoFound: Boolean(site.video), subtitleSource: fileCues.length ? "file" : site.subtitleSource, backendReachable, captureSupported: true, mediaId: site.mediaId, warnings: site.warnings });
  const send = (message: RuntimeMessage) => chrome.runtime.sendMessage(message).catch(() => undefined);
  const render = () => { state.mediaTime = video?.currentTime ?? 0; overlay?.render(result, settings, state); if (site.subtitleElement) site.subtitleElement.style.visibility = settings.showEnglish ? "" : "hidden"; };

  function attach() {
    const next = detectSite(customSelector); site = next;
    if (next.video !== video) { observer?.stop(); observer = null; overlay?.destroy(); video = next.video; if (video) { overlay = new Overlay(video); video.addEventListener("seeking", () => { generation += 1; current = null; result = null; discontinuity = true; tick(); }); } }
    if (!observer && site.subtitleElement) { observer = new SubtitleObserver(site.subtitleElement, onSubtitle); observer.start(); }
    if (video && site.subtitleSource === "text-track") for (const track of [...video.textTracks]) track.oncuechange = () => onSubtitle(currentTrackText(video!));
    render();
  }

  function onSubtitle(text: string) {
    if (!video || !sessionId) return; const now = video.currentTime;
    if (current && (!text || text !== current.englishText)) { current.disappearedAtVideoTime = now; if (settings.processingMode === "delayed") void send({ type: "SUBTITLE_EVENT", event: current }); current = null; }
    if (text) { current = { id: crypto.randomUUID(), sessionId, filmId: site.mediaId, englishText: text, appearedAtVideoTime: now, detectedAtWallClock: Date.now(), generation }; if (settings.processingMode === "predictive") void send({ type: "SUBTITLE_EVENT", event: { ...current, disappearedAtVideoTime: now + 3 } }); }
  }

  async function showFileCue(cue: FileCue) {
    const japanese = cue.text; let romaji = fallbackRomanize(japanese); let mode: RuntimeState["mode"] = "subtitle-file";
    try { const converted = await send({ type: "ROMANIZE", text: japanese }) as { romaji?: string }; if (converted.romaji) { romaji = converted.romaji; mode = "romanized-file"; } } catch { /* Japanese and kana fallback remain usable offline. */ }
    if (cue !== activeFileCue) return; result = { subtitleId: `file-${cue.start}`, filmId: site.mediaId, english: "", japanese, romaji, start: cue.start, end: cue.end, confidence: 1, source: "subtitle-file" }; state.mode = mode; render();
  }

  function tick() {
    attach(); if (!video) return; const now = video.currentTime;
    if (fileCues.length) { const cue = cueAt(fileCues, now - settings.subtitleOffset); if (cue !== activeFileCue) { activeFileCue = cue; if (cue) void showFileCue(cue); else { result = null; render(); } } }
    if (sessionId) {
      send({ type: "CAPTURE_SYNC", mediaTime: now, generation, paused: video.paused, playbackRate: video.playbackRate, discontinuity }); discontinuity = false;
      if (site.subtitleSource === "none" && !video.paused && now - lastRollingAt >= 4) { if (current) { current.disappearedAtVideoTime = now; void send({ type: "SUBTITLE_EVENT", event: current }); } current = { id: crypto.randomUUID(), sessionId, filmId: site.mediaId, englishText: "", appearedAtVideoTime: now, detectedAtWallClock: Date.now(), generation }; lastRollingAt = now; }
    }
    render();
  }

  async function importFile(text: string, filename: string, next: Settings) { settings = next; attach(); if (!video) throw new Error("NO_VIDEO: No HTML5 video found"); fileCues = parseSubtitleFile(text); if (!fileCues.length) throw new Error("NO_SUBTITLE_SOURCE: No valid SRT/VTT cues found"); activeFileCue = null; state = { phase: "file-ready", mode: "subtitle-file", cueCount: fileCues.length, filename, mediaTime: video.currentTime, capability: capability(false) }; tick(); return state; }
  function stop() { sessionId = null; current = null; fileCues = []; activeFileCue = null; result = null; state = { phase: "idle" }; render(); }
  function beginPicker() { const click = (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); const element = event.target as HTMLElement; customSelector = element.id ? `#${CSS.escape(element.id)}` : element.classList.length ? `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 2).map((name) => CSS.escape(name)).join(".")}` : element.tagName.toLowerCase(); void chrome.storage.local.set({ [`captionSelector:${location.origin}`]: customSelector }); element.style.outline = ""; removeEventListener("mouseover", hover, true); removeEventListener("click", click, true); observer?.stop(); observer = null; attach(); }; const hover = (event: MouseEvent) => { const element = event.target as HTMLElement; element.style.outline = "2px solid #8b5cf6"; setTimeout(() => { if (element.style.outline.includes("8b5cf6")) element.style.outline = ""; }, 250); }; addEventListener("mouseover", hover, true); addEventListener("click", click, true); }

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, respond) => {
    if (message.type === "DETECT") { attach(); const report = capability(message.backendReachable); state = { ...state, capability: report, mediaTime: video?.currentTime }; respond(report); return; }
    if (message.type === "GET_STATE") { respond({ ...state, capability: capability(state.capability?.backendReachable) }); return; }
    if (message.type === "LIVE_SESSION") { settings = message.settings; sessionId = message.sessionId; state = { phase: "capturing", mode: "live-asr", capability: capability(true) }; onSubtitle(site.subtitleElement ? normalizeSubtitle(site.subtitleElement) : video ? currentTrackText(video) : ""); tick(); respond({ ok: true }); return; }
    if (message.type === "IMPORT_SUBTITLES") { importFile(message.text, message.filename, message.settings).then(respond).catch((error) => respond({ phase: "error", lastError: { code: String(error).split(":")[0], message: String(error) } })); return true; }
    if (message.type === "BEGIN_PICK_SUBTITLE") { beginPicker(); respond({ ok: true }); return; }
    if (message.type === "SETTINGS_UPDATED") { settings = message.settings; activeFileCue = null; tick(); respond({ ok: true }); return; }
    if (message.type === "ALIGNED_RESULT") { result = message.result; state.phase = "processing"; render(); respond({ ok: true }); return; }
    if (message.type === "CAPTURE_STATE") { state.phase = message.state; state.bufferedAudioSeconds = message.bufferedAudioSeconds; if (message.detail) state.lastError = { code: "UNKNOWN", message: message.detail }; render(); respond({ ok: true }); return; }
    if (message.type === "CONTENT_STOP") { stop(); respond({ ok: true }); return; }
    if (message.type === "REPLAY" && video && result) { video.currentTime = Math.max(0, result.start); void video.play(); respond({ ok: true }); }
  });
  void chrome.storage.local.get(`captionSelector:${location.origin}`).then((saved) => { customSelector = saved[`captionSelector:${location.origin}`] ?? ""; attach(); }); new MutationObserver(attach).observe(document.documentElement, { childList: true, subtree: true }); setInterval(tick, 200); attach();
}
