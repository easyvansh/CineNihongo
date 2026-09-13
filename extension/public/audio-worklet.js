class CineNihongoProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(2048); this.length = 0; this.start = 0; }
  process(inputs) {
    const channels = inputs[0];
    if (channels && channels[0]) {
      for (let i = 0; i < channels[0].length; i++) {
        if (this.length === 0) this.start = currentTime + i / sampleRate;
        let mono = 0;
        for (const channel of channels) mono += channel[i] / channels.length;
        this.buffer[this.length++] = mono;
        if (this.length === this.buffer.length) {
          this.port.postMessage({ samples: this.buffer, contextStart: this.start }, [this.buffer.buffer]);
          this.buffer = new Float32Array(2048); this.length = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('cinenihongo-processor', CineNihongoProcessor);
