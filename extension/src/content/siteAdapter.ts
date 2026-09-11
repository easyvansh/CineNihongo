export const SELECTORS = {
  player: ".player-root",
  video: ".player-root video",
  subtitle: ".player-root .lp-subtitle"
} as const;

export function parseFilmId(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/^\/watch\/movie\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch { return null; }
}

export function normalizeSubtitle(elementOrText: Element | string | null): string {
  if (!elementOrText) return "";
  if (typeof elementOrText === "string") return elementOrText.replace(/\s+/g, " ").trim();
  return (elementOrText as HTMLElement).innerText.replace(/\s+/g, " ").trim();
}

export function findElements() {
  return {
    player: document.querySelector<HTMLElement>(SELECTORS.player),
    video: document.querySelector<HTMLVideoElement>(SELECTORS.video),
    subtitle: document.querySelector<HTMLElement>(SELECTORS.subtitle)
  };
}
