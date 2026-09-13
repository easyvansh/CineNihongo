/** Streaming box-filter resampler. Carries fractional sample coverage across worklet blocks. */
export class StreamingResampler {
  private weight = 0;
  private sum = 0;
  constructor(private inputRate: number, private outputRate = 16000) {}
  reset() { this.weight = 0; this.sum = 0; }
  push(input: Float32Array): Int16Array {
    const ratio = this.inputRate / this.outputRate;
    const output: number[] = [];
    for (const sample of input) {
      let available = 1;
      while (available > 1e-8) {
        const take = Math.min(available, ratio - this.weight);
        this.sum += sample * take; this.weight += take; available -= take;
        if (this.weight >= ratio - 1e-8) {
          const value = Math.max(-1, Math.min(1, this.sum / ratio));
          output.push(Math.round(value * (value < 0 ? 32768 : 32767)));
          this.sum = 0; this.weight = 0;
        }
      }
    }
    return Int16Array.from(output);
  }
}
