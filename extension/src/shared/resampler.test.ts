import { describe, expect, it } from 'vitest';
import { StreamingResampler } from './resampler';
describe('streaming audio', () => {
  for (const rate of [44100, 48000]) it(`retains sample count and continuity at ${rate}Hz`, () => {
    const input = Float32Array.from({ length: rate }, (_, i) => Math.sin(i * .02) * .5);
    const whole = new StreamingResampler(rate).push(input);
    const converter = new StreamingResampler(rate); const values: number[] = [];
    for (let i = 0; i < input.length; i += 128) values.push(...converter.push(input.slice(i, i + 128)));
    expect(values).toHaveLength(16000); expect(values).toEqual([...whole]);
  });
  it('resets fractional samples on discontinuity and clips amplitude', () => {
    const r = new StreamingResampler(48000); r.push(new Float32Array([1, 1])); r.reset();
    expect([...r.push(new Float32Array([-2, -2, -2]))]).toEqual([-32768]);
  });
});
