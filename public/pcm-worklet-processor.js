/* AudioWorkletProcessor that replaces the deprecated ScriptProcessorNode mic
 * capture path in interview.js. Runs on the audio render thread (off the
 * main thread), applies a simple one-pole low-pass filter before
 * downsampling to reduce aliasing (the previous downsampleBuffer() was a
 * naive nearest-neighbor pick with no filtering at all), and posts
 * fixed-size Float32Array chunks of mono audio at the target sample rate
 * back to the main thread over `port`. Output contract to the backend is
 * unchanged: interview.js still converts these to 16-bit linear PCM and
 * sends raw binary WebSocket frames exactly as before — nothing server-side
 * changes.
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetSampleRate || 16000;
    // `sampleRate` is a global in AudioWorkletGlobalScope — the context's
    // native rate, which may or may not match the requested rate depending
    // on the browser/OS (the main thread already accounts for this the same
    // way, via audioContext.sampleRate).
    this.ratio = sampleRate / this.targetRate;

    // One-pole low-pass, cutoff just under the target Nyquist frequency.
    // Cheap and causal — not a substitute for a proper polyphase resampler,
    // but far better than downsampling raw unfiltered samples, which lets
    // content above the new Nyquist alias back down into the speech band.
    const cutoffHz = this.targetRate * 0.45;
    const dt = 1 / sampleRate;
    const rc = 1 / (2 * Math.PI * cutoffHz);
    this.lpAlpha = dt / (rc + dt);
    this.lpState = 0;

    this.phase = 0;
    this.outBuffer = [];
    // Deepgram recommends 80 ms chunks for Flux. This reduces WebSocket
    // message pressure while preserving responsive live transcription.
    this.chunkSize = 1280;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel || channel.length === 0) return true;

    for (let i = 0; i < channel.length; i++) {
      this.lpState += this.lpAlpha * (channel[i] - this.lpState);
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        this.outBuffer.push(this.lpState);
        if (this.outBuffer.length >= this.chunkSize) {
          const chunk = new Float32Array(this.outBuffer);
          this.outBuffer.length = 0;
          this.port.postMessage(chunk, [chunk.buffer]);
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture-processor", PCMCaptureProcessor);
