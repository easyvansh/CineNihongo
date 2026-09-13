import type { AlignedSubtitle, RuntimeState, Settings } from '../shared/types';
export class Overlay {
  private host = document.createElement('div');
  private japanese = document.createElement('div');
  private romaji = document.createElement('div');
  private debug = document.createElement('div');
  private resize: ResizeObserver;
  constructor(private video: HTMLVideoElement) {
    this.host.id = 'cinenihongo-overlay-host';
    Object.assign(this.host.style, { position: 'fixed', zIndex: '2147483646', textAlign: 'center', pointerEvents: 'none', color: 'white', textShadow: '0 2px 5px #000,0 0 3px #000' });
    const root = this.host.attachShadow({ mode: 'open' }); const style = document.createElement('style');
    style.textContent = '.line{font-family:system-ui,sans-serif;font-weight:700;line-height:1.25;white-space:pre-wrap;overflow-wrap:anywhere}.jp{font-size:clamp(18px,2.4vw,38px)}.ro{font-size:clamp(17px,2.1vw,34px)}.debug{margin-top:8px;padding:5px 8px;background:#000c;border-radius:6px;font:12px/1.3 monospace;color:#9ef}';
    this.japanese.className = 'line jp'; this.romaji.className = 'line ro'; this.debug.className = 'debug';
    root.append(style, this.japanese, this.romaji, this.debug);
    this.resize = new ResizeObserver(this.position); this.resize.observe(video);
    addEventListener('scroll', this.position, true); addEventListener('resize', this.position);
    document.addEventListener('fullscreenchange', this.position); this.position();
  }
  position = () => {
    const fullscreen = document.fullscreenElement;
    const parent = fullscreen && fullscreen !== this.video && fullscreen.contains(this.video) ? fullscreen : document.documentElement;
    if (this.host.parentElement !== parent) parent.append(this.host);
    const rect = this.video.getBoundingClientRect();
    Object.assign(this.host.style, { left: `${rect.left + rect.width * .05}px`, width: `${Math.max(0, rect.width * .9)}px`, top: `${Math.max(rect.top, rect.bottom - Math.max(110, rect.height * .24))}px` });
    this.host.style.visibility = fullscreen === this.video ? 'hidden' : '';
  };
  render(result: AlignedSubtitle | null, settings: Settings, state: RuntimeState) {
    const jp = settings.showJapanese ? result?.japanese ?? '' : '';
    const ro = settings.showRomaji ? result?.romaji ?? '' : '';
    const debug = settings.debug ? `${state.phase} | t=${(state.mediaTime ?? 0).toFixed(2)} | ${state.modelState ?? state.mode ?? 'none'}` : '';
    if (this.japanese.textContent !== jp) this.japanese.textContent = jp;
    if (this.romaji.textContent !== ro) this.romaji.textContent = ro;
    if (this.debug.textContent !== debug) this.debug.textContent = debug;
    this.debug.style.display = debug ? 'inline-block' : 'none'; this.position();
  }
  destroy() { this.resize.disconnect(); removeEventListener('scroll', this.position, true); removeEventListener('resize', this.position); document.removeEventListener('fullscreenchange', this.position); this.host.remove(); }
}
