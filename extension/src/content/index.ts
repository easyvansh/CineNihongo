import { api } from "../shared/api";
import { DEFAULT_SETTINGS, type AlignedSubtitle, type RuntimeMessage, type Settings, type SubtitleEvent } from "../shared/types";
import { findElements, normalizeSubtitle, parseFilmId } from "./siteAdapter";
import { SubtitleObserver } from "./subtitleObserver";
import { Overlay } from "./overlay";
import { cueAt, parseSubtitleFile, type FileCue } from "./subtitleFile";

let settings: Settings = DEFAULT_SETTINGS;
let sessionId: string | null = null;
let activeFilmId: string | null = null;
let generation = 0;
let current: SubtitleEvent | null = null;
let lastResult: AlignedSubtitle | null = null;
let subtitleObserver: SubtitleObserver | null = null;
let overlay: Overlay | null = null;
let video: HTMLVideoElement | null = null;
let subtitleNode: HTMLElement | null = null;
let fileCues: FileCue[] = [];
let lastFileCue: FileCue | null = null;
let status = "idle";
let attachTimer = 0;

const filmId = () => parseFilmId(location.href);
const render = () => {
  overlay?.render(lastResult, settings, status);
  const native = document.querySelector<HTMLElement>(".player-root .lp-subtitle");
  if (native) native.style.visibility = settings.showEnglish ? "" : "hidden";
};
const sendRuntime = (message: RuntimeMessage) => chrome.runtime.sendMessage(message).catch(() => undefined);

async function submit(event: SubtitleEvent) {
  try { await api.subtitleEvent(event); } catch (error) { status = `backend error: ${String(error)}`; render(); }
}

function onSubtitle(text: string) {
  if (!video || !sessionId) return;
  const now = video.currentTime;
  if (current && (!text || text !== current.englishText)) {
    current.disappearedAtVideoTime = now;
    if (settings.processingMode === "delayed") void submit(current);
    current = null;
  }
  if (text) {
    current = { id: crypto.randomUUID(), sessionId, filmId: filmId() ?? "unknown", englishText: text, appearedAtVideoTime: now, detectedAtWallClock: Date.now(), generation };
    if (settings.processingMode === "predictive") void submit({ ...current, disappearedAtVideoTime: now + 3 });
  }
}

function sync() {
  if (!video || !sessionId) return;
  sendRuntime({ type: "CAPTURE_SYNC", mediaTime: video.currentTime, generation, paused: video.paused });
  if (fileCues.length) {
    const cue = cueAt(fileCues, video.currentTime);
    if (cue !== lastFileCue) {
      lastFileCue = cue;
      if (!cue) { lastResult = null; render(); }
      else void api.romanize(cue.text).then(({ japanese, romaji }) => {
        lastResult = { subtitleId: `file-${cue.start}`, filmId: filmId() ?? "unknown", english: "", japanese, romaji, start: cue.start, end: cue.end, confidence: 1, source: "subtitle-file" };
        render();
      });
    }
  }
}

function attach() {
  if (sessionId && activeFilmId !== filmId()) {
    void stop().then(() => { status = "Movie changed — press Start"; render(); });
  }
  const found = findElements();
  if (!found.player || !found.video || !found.subtitle) return;
  if (video !== found.video) {
    if (video) ["timeupdate", "play", "pause", "seeking", "seeked"].forEach((name) => video?.removeEventListener(name, sync));
    video = found.video;
    ["timeupdate", "play", "pause", "seeked"].forEach((name) => video?.addEventListener(name, sync));
    video.addEventListener("seeking", () => { generation += 1; current = null; lastResult = null; sync(); render(); });
    status = "player ready";
  }
  if (subtitleNode !== found.subtitle) {
    subtitleObserver?.stop(); subtitleNode = found.subtitle;
    subtitleObserver = new SubtitleObserver(found.subtitle, onSubtitle); subtitleObserver.start();
  }
  if (!overlay || !document.getElementById("cinenihongo-overlay-host")) overlay = new Overlay(found.player);
  render();
}

async function start(next: Settings) {
  settings = next;
  const id = filmId();
  if (!id) throw new Error("Not a supported CineJoy movie URL");
  attach();
  if (!video) throw new Error("Video player not detected yet");
  const session = await api.startSession(id, settings.model, settings.confidenceThreshold);
  sessionId = session.sessionId; activeFilmId = id; generation = 0; status = "connected";
  onSubtitle(normalizeSubtitle(subtitleNode)); render();
  sendRuntime({ type: "CAPTURE_START", sessionId }); sync();
}

async function stop() {
  const stoppingSession = sessionId;
  sessionId = null; activeFilmId = null;
  sendRuntime({ type: "CAPTURE_STOP" });
  if (stoppingSession) await api.stopSession(stoppingSession).catch(() => undefined);
  current = null; lastResult = null; status = "stopped"; render();
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, respond) => {
  if (message.type === "START") { start(message.settings).then(() => respond({ ok: true })).catch((e) => respond({ ok: false, error: String(e) })); return true; }
  if (message.type === "STOP") { stop().then(() => respond({ ok: true })); return true; }
  if (message.type === "STATUS") { respond({ active: Boolean(sessionId), sessionId, filmId: filmId(), status }); return; }
  if (message.type === "SETTINGS_UPDATED") { settings = message.settings; render(); respond({ ok: true }); return; }
  if (message.type === "ALIGNED_RESULT" && message.result.filmId === filmId()) { lastResult = message.result; render(); respond({ ok: true }); return; }
  if (message.type === "CAPTURE_STATE") { status = message.detail ? `${message.state}: ${message.detail}` : message.state; render(); respond({ ok: true }); return; }
  if (message.type === "IMPORT_SUBTITLES") { fileCues = parseSubtitleFile(message.text); lastFileCue = null; status = `${fileCues.length} subtitle cues loaded`; render(); respond({ ok: true, count: fileCues.length }); return; }
  if (message.type === "REPLAY" && video && lastResult) { video.currentTime = Math.max(0, lastResult.start); void video.play(); respond({ ok: true }); }
});

const documentObserver = new MutationObserver(attach);
documentObserver.observe(document.documentElement, { childList: true, subtree: true });
attachTimer = window.setInterval(attach, 2000);
window.addEventListener("beforeunload", () => { clearInterval(attachTimer); documentObserver.disconnect(); });
