class CineNihongoProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];
    if (channels && channels[0]) {
      const length = channels[0].length;
      const mono = new Float32Array(length);
      for (let channel = 0; channel < channels.length; channel += 1) {
        for (let i = 0; i < length; i += 1) mono[i] += channels[channel][i] / channels.length;
      }
      this.port.postMessage(mono, [mono.buffer]);
    }
    return true;
  }
}
registerProcessor("cinenihongo-processor", CineNihongoProcessor);
