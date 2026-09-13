import { describe, expect, it } from 'vitest';
import { CueScheduler, inInterval } from './cueScheduler';
describe('cue timing', () => {
  it('finalizes unchanged captions once and handles disappearing text', () => {
    const s = new CueScheduler(); s.reset(0);
    expect(s.caption('hello', 1)).toEqual([]);
    expect(s.caption('hello', 2)).toEqual([]);
    expect(s.caption('', 3)).toEqual([{ start: 1, end: 3, text: 'hello', kind: 'caption' }]);
    expect(s.flush(4)).toEqual([]);
  });
  it('creates bounded overlapping rolling windows and resets on seek', () => {
    const s = new CueScheduler(); s.reset(10);
    expect(s.tick(13, false)).toEqual([]);
    expect(s.tick(14, false)[0]).toMatchObject({ start: 10, end: 14, kind: 'rolling' });
    expect(s.tick(17, false)[0]).toMatchObject({ start: 13, end: 17 });
    s.reset(2); expect(s.tick(3, false)).toEqual([]);
    expect(s.tick(6, false)[0]).toMatchObject({ start: 2, end: 6 });
  });
  it('bounds long captions and scales audio windows at 2x', () => {
    const s = new CueScheduler(); s.reset(0); s.caption('long', 0);
    expect(s.tick(4, true)[0]).toMatchObject({ start: 0, end: 4 });
    s.reset(0); expect(s.tick(4, false, 2)).toEqual([]);
    expect(s.tick(8, false, 2)[0]).toMatchObject({ start: 0, end: 8 });
  });
  it('uses half-open display intervals', () => {
    expect(inInterval(2, 2, 4)).toBe(true); expect(inInterval(4, 2, 4)).toBe(false);
  });
  it('flushes a short final rolling window on pause once', () => {
    const s = new CueScheduler(); s.reset(10);
    expect(s.finish(12)).toEqual([{ start: 10, end: 12, text: '', kind: 'rolling' }]);
    expect(s.finish(12)).toEqual([]);
  });
});
