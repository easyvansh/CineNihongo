import type { AlignedSubtitle, Settings } from "../shared/types";

const HOST_ID = "cinenihongo-overlay-host";

export class Overlay {
  private host: HTMLDivElement;
  private japanese: HTMLDivElement;
  private romaji: HTMLDivElement;
  private debug: HTMLDivElement;
  constructor(player: HTMLElement) {
    document.getElementById(HOST_ID)?.remove();
    this.host = document.createElement("div");
    this.host.id = HOST_ID;
    Object.assign(this.host.style, { position: "absolute", left: "5%", right: "5%", bottom: "calc(2rem + clamp(3.5rem, 9vh, 8rem))", zIndex: "44", textAlign: "center", pointerEvents: "none", color: "white", textShadow: "0 2px 5px #000, 0 0 3px #000" });
    const root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `.line{font-family:Inter,system-ui,sans-serif;font-weight:700;line-height:1.25}.jp{font-size:clamp(18px,2.4vw,38px)}.ro{font-size:clamp(17px,2.1vw,34px)}.debug{display:inline-block;margin-top:8px;padding:5px 8px;background:#000b;border-radius:6px;font:12px/1.3 ui-monospace,monospace;color:#9ef}`;
    this.japanese = document.createElement("div"); this.japanese.className = "line jp";
    this.romaji = document.createElement("div"); this.romaji.className = "line ro";
    this.debug = document.createElement("div"); this.debug.className = "debug";
    root.append(style, this.japanese, this.romaji, this.debug);
    player.append(this.host);
  }
  render(result: AlignedSubtitle | null, settings: Settings, status = "") {
    this.japanese.textContent = settings.showJapanese ? result?.japanese ?? "" : "";
    this.romaji.textContent = settings.showRomaji ? result?.romaji ?? "" : "";
    this.debug.textContent = settings.debug ? `${status}${result ? ` | ${result.start.toFixed(2)}–${result.end.toFixed(2)} | ${(result.confidence * 100).toFixed(0)}% | ${result.source}` : ""}` : "";
    this.debug.style.display = settings.debug ? "inline-block" : "none";
  }
  destroy() { this.host.remove(); }
}
