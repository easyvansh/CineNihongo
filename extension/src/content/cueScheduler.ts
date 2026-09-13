import type { SubtitleEvent } from '../shared/types';

/** Times are media seconds. A rolling window spans four seconds with one second overlap. */
export class CueScheduler {
  private text = '';
  private start: number | null = null;
  private rollingStart: number | null = null;
  reset(now: number) { this.text = ''; this.start = null; this.rollingStart = now; }
  caption(text: string, now: number) {
    if (text === this.text) return [];
    const events = this.flush(now);
    this.text = text;
    this.start = text ? now : null;
    return events;
  }
  flush(now: number) {
    const events = this.start !== null && now > this.start
      ? [{ start: this.start, end: now, text: this.text, kind: 'caption' as const }] : [];
    this.start = null; this.text = '';
    return events;
  }
  finish(now: number, rate = 1): CueWindow[] {
    const events: CueWindow[] = this.flush(now);
    if (!events.length && this.rollingStart !== null && now - this.rollingStart >= .5 * rate) {
      events.push({ start: Math.max(this.rollingStart, now - 4 * rate), end: now, text: '', kind: 'rolling' });
    }
    this.reset(now);
    return events;
  }
  tick(now: number, hasCaption: boolean, rate = 1) {
    if (hasCaption) {
      this.rollingStart = now;
      // Bound long static cues so they cannot outlive the audio buffer.
      if (this.start !== null && now - this.start >= 4 * rate) {
        const text = this.text; const events = this.flush(now);
        this.text = text; this.start = now;
        return events;
      }
      return [];
    }
    this.rollingStart ??= now;
    if (now < this.rollingStart) this.rollingStart = now;
    if (now - this.rollingStart < 4 * rate) return [];
    const start = Math.max(this.rollingStart, now - 4 * rate);
    this.rollingStart = now - rate;
    return [{ start, end: now, text: '', kind: 'rolling' as const }];
  }
}
export type CueWindow = { start: number; end: number; text: string; kind: SubtitleEvent['windowKind'] };

export function inInterval(now: number, start: number, end: number) {
  return now >= start && now < end;
}
