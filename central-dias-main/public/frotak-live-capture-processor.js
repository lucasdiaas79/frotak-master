class FrotakLiveCaptureProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (output) output.fill(0);

    if (input) {
      const frame = new Float32Array(input.length);
      frame.set(input);
      this.port.postMessage(frame, [frame.buffer]);
    }

    return true;
  }
}

registerProcessor("frotak-live-capture", FrotakLiveCaptureProcessor);
