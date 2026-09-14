import { useEffect, useRef, useState } from "react";

export function PhotoVerification({ busy, onCapture, onCancel }: {
  busy: boolean;
  onCapture: (photo: string) => Promise<void>;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | undefined;
    setReady(false);
    setError("");
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("Camera access requires HTTPS or localhost and a supported browser.");
        const camera = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (disposed) {
          camera.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = camera;
        if (video.current) {
          video.current.srcObject = camera;
          await video.current.play();
        }
      } catch (e) {
        stream?.getTracks().forEach((track) => track.stop());
        if (!disposed) {
          setReady(false);
          setError(e instanceof DOMException && e.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in your browser, then retry."
            : e instanceof DOMException && e.name === "NotFoundError"
              ? "No camera was found. Connect a webcam, then retry."
              : (e as Error).message || "Could not start your camera. Please retry.");
        }
      }
    }
    void start();
    return () => {
      disposed = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [attempt]);

  async function capture() {
    const camera = video.current;
    if (!camera || !ready || busy) return;
    if (!camera.videoWidth || !camera.videoHeight || camera.readyState < 2) {
      setError("The camera is not ready yet. Please retry.");
      return;
    }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 960 / Math.max(camera.videoWidth, camera.videoHeight));
    canvas.width = Math.round(camera.videoWidth * scale);
    canvas.height = Math.round(camera.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Could not capture a camera photo. Please try another browser.");
      return;
    }
    context.drawImage(camera, 0, 0, canvas.width, canvas.height);
    setError("");
    await onCapture(canvas.toDataURL("image/jpeg", 0.85));
    canvas.width = canvas.height = 0;
  }

  return <section className="photo-verification" aria-label="Photo verification" aria-busy={busy}>
    <p>Face the camera in good light with only your face visible. We’ll compare this photo with your saved profile photo. The captured photo is used for this check and is not saved.</p>
    <video ref={video} autoPlay muted playsInline aria-label="Camera preview"
      onCanPlay={() => setReady(true)} onEmptied={() => setReady(false)} />
    {error && <p role="alert">{error}</p>}
    {error && <button type="button" className="text-button" disabled={busy}
      onClick={() => setAttempt((value) => value + 1)}>Retry camera</button>}
    <button type="button" className="button primary" disabled={!ready || busy}
      onClick={() => void capture()}>{busy ? "Verifying photo…" : "Capture and verify"}</button>
    <button type="button" className="text-button" disabled={busy} onClick={onCancel}>Back to sign in</button>
  </section>;
}
