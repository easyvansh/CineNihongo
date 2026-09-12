import type { AdapterName, SubtitleSource } from "../shared/types";
export interface DetectedSite { adapter: AdapterName; video: HTMLVideoElement | null; subtitleElement: HTMLElement | null; subtitleSource: SubtitleSource; mediaId: string; warnings: string[]; }
const GENERIC_CAPTIONS = "[data-testid*='caption'],[class*='subtitle'],[class*='caption']";
export function parseFilmId(url: string): string | null { try { return new URL(url).pathname.match(/^\/watch\/movie\/([^/?#]+)/)?.[1] ?? null; } catch { return null; } }
export function normalizeSubtitle(value: Element | string | null): string { if (!value) return ""; return (typeof value === "string" ? value : (value as HTMLElement).innerText).replace(/\s+/g, " ").trim(); }
function visibleArea(video: HTMLVideoElement) { const rect = video.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 ? Math.min(rect.width, innerWidth) * Math.min(rect.height, innerHeight) : 0; }
export function chooseVideo(): HTMLVideoElement | null { return [...document.querySelectorAll<HTMLVideoElement>("video")].sort((a, b) => Number(!b.paused) - Number(!a.paused) || visibleArea(b) - visibleArea(a))[0] ?? null; }
function activeTrack(video: HTMLVideoElement) { return [...video.textTracks].find((track) => track.mode === "showing" || track.mode === "hidden") ?? null; }
export function detectSite(customSelector?: string): DetectedSite {
  const video = document.querySelector<HTMLVideoElement>(".player-root video") ?? document.querySelector<HTMLVideoElement>(".html5-main-video") ?? chooseVideo();
  const cinejoy = location.hostname.endsWith("cinejoy.to"); const youtube = location.hostname.endsWith("youtube.com") || location.hostname === "youtu.be";
  const adapter: AdapterName = cinejoy ? "cinejoy" : youtube ? "youtube" : video && activeTrack(video) ? "native-track" : "generic-dom";
  const selector = customSelector || (cinejoy ? ".player-root .lp-subtitle" : youtube ? ".ytp-caption-window-container" : GENERIC_CAPTIONS);
  const subtitleElement = document.querySelector<HTMLElement>(selector);
  const subtitleSource: SubtitleSource = subtitleElement ? "dom" : video && activeTrack(video) ? "text-track" : "none";
  const mediaId = cinejoy ? `cinejoy:${parseFilmId(location.href) ?? location.pathname}` : `${location.hostname}:${location.pathname}`;
  const warnings: string[] = []; if (!video) warnings.push("No visible HTML5 video was found."); if (subtitleSource === "none") warnings.push("No English cues found; live ASR will use rolling windows.");
  return { adapter, video, subtitleElement, subtitleSource, mediaId, warnings };
}
export function currentTrackText(video: HTMLVideoElement): string { const cues = activeTrack(video)?.activeCues; return cues ? [...cues].map((cue) => (cue as VTTCue).text ?? "").join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""; }
