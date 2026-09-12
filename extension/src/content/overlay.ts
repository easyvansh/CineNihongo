import type { AlignedSubtitle, RuntimeState, Settings } from "../shared/types";
const HOST_ID = "cinenihongo-overlay-host";
export class Overlay {
  private host: HTMLDivElement; private japanese: HTMLDivElement; private romaji: HTMLDivElement; private debug: HTMLDivElement; private resize: ResizeObserver;
  constructor(private video: HTMLVideoElement) {
    document.getElementById(HOST_ID)?.remove(); this.host = document.createElement("div"); this.host.id = HOST_ID;
    Object.assign(this.host.style, { position: "fixed", zIndex: "2147483646", textAlign: "center", pointerEvents: "none", color: "white", textShadow: "0 2px 5px #000,0 0 3px #000" });
    const root = this.host.attachShadow({ mode: "open" }); const style = document.createElement("style");
    style.textContent = `.line{font-family:Inter,system-ui,sans-serif;font-weight:700;line-height:1.25}.jp{font-size:clamp(18px,2.4vw,38px)}.ro{font-size:clamp(17px,2.1vw,34px)}.debug{display:inline-block;margin-top:8px;padding:5px 8px;background:#000c;border-radius:6px;font:12px/1.3 ui-monospace,monospace;color:#9ef}`;
    this.japanese = document.createElement("div"); this.japanese.className = "line jp"; this.romaji = document.createElement("div"); this.romaji.className = "line ro"; this.debug = document.createElement("div"); this.debug.className = "debug";
    root.append(style, this.japanese, this.romaji, this.debug); document.documentElement.append(this.host); this.resize = new ResizeObserver(this.position); this.resize.observe(video); addEventListener("scroll", this.position, true); addEventListener("resize", this.position); document.addEventListener("fullscreenchange", this.position); this.position();
  }
  private position = () => { const rect = this.video.getBoundingClientRect(); Object.assign(this.host.style, { left: `${rect.left + rect.width * .05}px`, width: `${Math.max(0, rect.width * .9)}px`, top: `${Math.max(rect.top, rect.bottom - Math.max(110, rect.height * .22))}px` }); };
  render(result: AlignedSubtitle | null, settings: Settings, state: RuntimeState) { this.japanese.textContent = settings.showJapanese ? result?.japanese ?? "" : ""; this.romaji.textContent = settings.showRomaji ? result?.romaji ?? "" : ""; this.debug.textContent = settings.debug ? `${state.phase} | t=${(state.mediaTime ?? 0).toFixed(2)} | ${state.mode ?? "none"}${state.cueCount !== undefined ? ` | ${state.cueCount} cues` : ""}` : ""; this.debug.style.display = settings.debug ? "inline-block" : "none"; }
  destroy() { this.resize.disconnect(); removeEventListener("scroll", this.position, true); removeEventListener("resize", this.position); document.removeEventListener("fullscreenchange", this.position); this.host.remove(); }
}
