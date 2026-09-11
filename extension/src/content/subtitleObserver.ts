import { normalizeSubtitle } from "./siteAdapter";

export class SubtitleObserver {
  private observer?: MutationObserver;
  private last = "";
  constructor(private element: HTMLElement, private onChange: (text: string) => void) {}
  start() {
    const emit = () => {
      const text = normalizeSubtitle(this.element);
      if (text !== this.last) { this.last = text; this.onChange(text); }
    };
    this.observer = new MutationObserver(emit);
    this.observer.observe(this.element, { subtree: true, childList: true, characterData: true });
    emit();
  }
  stop() { this.observer?.disconnect(); }
}
