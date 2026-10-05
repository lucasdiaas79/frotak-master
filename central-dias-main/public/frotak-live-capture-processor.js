class FrotakLiveCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = Math.max(128, Math.round(sampleRate * 0.02));
    this.frame = new Float32Array(this.frameSize);
    this.frameLength = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (output) output.fill(0);

    if (input) {
      let offset = 0;
      while (offset < input.length) {
        const available = this.frameSize - this.frameLength;
        const length = Math.min(available, input.length - offset);
        this.frame.set(input.subarray(offset, offset + length), this.frameLength);
        this.frameLength += length;
        offset += length;

        if (this.frameLength === this.frameSize) {
          const completed = this.frame;
          this.port.postMessage(completed, [completed.buffer]);
          this.frame = new Float32Array(this.frameSize);
          this.frameLength = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor("frotak-live-capture", FrotakLiveCaptureProcessor);
