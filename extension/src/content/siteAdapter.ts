import type { AdapterName, SubtitleSource } from '../shared/types';
export interface DetectedSite { adapter: AdapterName; video: HTMLVideoElement | null; subtitleElement: HTMLElement | null; subtitleSource: SubtitleSource; mediaId: string; warnings: string[]; }
export function parseFilmId(url: string): string | null { try { return new URL(url).pathname.match(/^\/watch\/movie\/([^/?#]+)/)?.[1] ?? null; } catch { return null; } }
export function normalizeSubtitle(value: Element | string | null): string {
  return (typeof value === 'string' ? value : (value as HTMLElement | null)?.innerText ?? value?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
export function visibleArea(element: HTMLElement) {
  const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return 0;
  return Math.max(0, Math.min(rect.right, innerWidth) - Math.max(0, rect.left)) * Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(0, rect.top));
}
export function chooseVideo(): HTMLVideoElement | null {
  return [...document.querySelectorAll('video')].filter(v => visibleArea(v) > 0)
    .sort((a, b) => Number(!b.paused && !b.ended) - Number(!a.paused && !a.ended) || visibleArea(b) - visibleArea(a))[0] ?? null;
}
export function activeTrack(video: HTMLVideoElement): TextTrack | null {
  return [...video.textTracks].filter(t => ['subtitles', 'captions'].includes(t.kind) && t.mode !== 'disabled')
    .sort((a, b) => Number(b.mode === 'showing') - Number(a.mode === 'showing') || Number(b.language.startsWith('en')) - Number(a.language.startsWith('en')))[0] ?? null;
}
export function detectSite(customSelector = '', preferred: HTMLElement | null = null): DetectedSite {
  const video = chooseVideo(); const host = location.hostname;
  const cinejoy = host === 'cinejoy.to' || host.endsWith('.cinejoy.to');
  const youtube = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
  const track = video ? activeTrack(video) : null;
  let picked: HTMLElement | null = preferred?.isConnected ? preferred : null;
  let invalidSelector = false;
  try { picked ??= customSelector ? document.querySelector<HTMLElement>(customSelector) : null; } catch { invalidSelector = true; }
  const known = cinejoy ? '.player-root .lp-subtitle' : youtube ? '.ytp-caption-window-container' : '';
  const candidates = [...document.querySelectorAll<HTMLElement>([known, '[data-testid*="caption"], [class*="subtitle"], [class*="caption"], [aria-live="polite"]'].filter(Boolean).join(','))];
  const vr = video?.getBoundingClientRect();
  const scored = candidates.filter(el => !el.closest('#cinenihongo-overlay-host') && !el.matches('button,input,select') && normalizeSubtitle(el).length < 1000)
    .map(el => {
      const r = el.getBoundingClientRect();
      const overlaps = vr && r.left < vr.right && r.right > vr.left && r.top < vr.bottom && r.bottom > vr.top;
      return { el, score: known && el.matches(known) ? 100 : overlaps && r.height < vr!.height * .5 && r.width > 0 ? 20 + (normalizeSubtitle(el) ? 5 : 0) : -1 };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  const subtitleElement = picked ?? (!track ? scored[0]?.el ?? null : null);
  const subtitleSource: SubtitleSource = subtitleElement ? 'dom' : track ? 'text-track' : 'none';
  const adapter: AdapterName = cinejoy ? 'cinejoy' : youtube ? 'youtube' : track ? 'native-track' : 'generic-dom';
  const url = new URL(location.href);
  const mediaId = cinejoy ? `cinejoy:${parseFilmId(url.href) ?? url.pathname}` : url.href;
  const warnings: string[] = [];
  if (!video) warnings.push(document.querySelector('iframe') ? 'No top-level HTML5 video found. Embedded frame players are not supported.' : 'No visible HTML5 video found. Start playback and run diagnostics again.');
  if (subtitleSource === 'none') warnings.push('No site captions detected. Live ASR uses rolling audio windows.');
  if (invalidSelector) warnings.push('Saved caption selector is invalid. Pick the caption element again.');
  if (video && document.fullscreenElement === video) warnings.push('Native video fullscreen cannot display a DOM overlay. Use the site player fullscreen or exit fullscreen.');
  return { adapter, video, subtitleElement, subtitleSource, mediaId, warnings };
}
export function currentTrackText(video: HTMLVideoElement): string {
  const cues = activeTrack(video)?.activeCues;
  return cues ? [...cues].map(c => (c as VTTCue).text ?? '').join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}
