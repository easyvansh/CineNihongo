export interface FileCue { start: number; end: number; text: string; }
const time = (value: string) => { const p = value.replace(",", ".").split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };

export function parseSubtitleFile(input: string): FileCue[] {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const cues: FileCue[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.trim().split("\n");
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const match = lines[timingIndex].match(/([\d:,.]+)\s*-->\s*([\d:,.]+)/);
    if (!match) continue;
    const text = lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text) cues.push({ start: time(match[1]), end: time(match[2]), text });
  }
  return cues.sort((a, b) => a.start - b.start);
}

export function cueAt(cues: FileCue[], mediaTime: number) { return cues.find((cue) => cue.start <= mediaTime && cue.end >= mediaTime) ?? null; }
