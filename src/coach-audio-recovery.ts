// Keep the microphone graph alive across permission dialogs, browser suspension,
// worklet failures and a default input device disconnect. Mute remains a send gate.
export function keepCoachMicrophone(
  context: AudioContext,
  initialStream: MediaStream,
  onFrame: (event: MessageEvent<Float32Array>) => void,
  onError: (message: string) => void,
): () => void {
  let disposed = false, recovering = false, stream = initialStream;
  let source: MediaStreamAudioSourceNode | undefined;
  let node: AudioWorkletNode | undefined;
  let lastFrame = performance.now();
  const silent = context.createGain();
  silent.gain.value = 0;
  silent.connect(context.destination);
  const resume = () => {
    if (!disposed && context.state !== 'closed') {
      void context.resume().catch(() => {
        if (!disposed) onError('Audio paused. Click the microphone button to resume.');
      });
    }
  };
  const disconnect = () => {
    if (node) { node.port.onmessage = null; node.onprocessorerror = null; node.disconnect?.(); }
    source?.disconnect?.();
  };
  const install = () => {
    disconnect();
    node = new AudioWorkletNode(context, 'pcm-capture-processor', {processorOptions: {targetSampleRate: 16000}});
    source = context.createMediaStreamSource(stream);
    source.connect(node);
    node.connect(silent);
    node.port.onmessage = event => { lastFrame = performance.now(); if (!disposed) onFrame(event); };
    node.onprocessorerror = () => { void recover(false); };
    lastFrame = performance.now();
    resume();
  };
  const recover = async (replaceInput: boolean) => {
    if (disposed || recovering) return;
    recovering = true;
    try {
      if (replaceInput) {
        const replacement = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, channelCount: 1}});
        if (disposed) { replacement.getTracks().forEach(track => track.stop()); return; }
        const previous = stream;
        stream = replacement;
        if (previous !== initialStream) previous.getTracks().forEach(track => track.stop());
      }
      if (!disposed) install();
    } catch {
      if (!disposed) onError('Microphone disconnected. Reconnect your microphone and retry the lesson.');
    } finally { recovering = false; }
  };
  const check = () => {
    if (disposed) return;
    if (stream.getAudioTracks().some(track => track.readyState === 'ended')) { void recover(true); return; }
    if (context.state !== 'running') resume();
    else if (performance.now() - lastFrame > 3000) void recover(false);
  };
  install();
  context.addEventListener?.('statechange', check);
  window.addEventListener('focus', resume);
  const timer = setInterval(check, 1000);
  return () => {
    disposed = true;
    clearInterval(timer);
    context.removeEventListener?.('statechange', check);
    window.removeEventListener('focus', resume);
    disconnect();
    silent.disconnect?.();
    if (stream !== initialStream) stream.getTracks().forEach(track => track.stop());
  };
}

// Browser audio time stops when the context is suspended; wall time does not.
export function coachPlaybackAck(context: AudioContext, endsAt: number, isCurrent: () => boolean, complete: () => void): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout>;
  const check = () => {
    if (cancelled || !isCurrent() || context.state === 'closed') return;
    if (context.state !== 'running') {
      void context.resume().catch(() => {});
      timer = setTimeout(check, 100);
    } else if (context.currentTime + .005 < endsAt) {
      timer = setTimeout(check, Math.max(20, (endsAt - context.currentTime) * 1000 + 70));
    } else complete();
  };
  timer = setTimeout(check, Math.max(0, (endsAt - context.currentTime) * 1000) + 70);
  return () => { cancelled = true; clearTimeout(timer); };
}
