import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CameraOff, RefreshCw, ScanFace, Sun, User, Eye } from "lucide-react";

// Face ID-style ring: 60 ticks around a round camera view. Ticks breathe
// while the camera is live, sweep while the photo is being checked, and the
// ring shakes when the server reports a mismatch.
const TICKS = Array.from({ length: 60 }, (_, index) => index);

export function PhotoVerification({ busy, onCapture, onCancel, rejected = "" }: {
  busy: boolean;
  onCapture: (photo: string) => Promise<void>;
  onCancel: () => void;
  /** The latest verification error; each new one plays the "no match" shake. */
  rejected?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const [rejectedNow, setRejectedNow] = useState(false);

  // Play the "no match" shake without remounting the live camera view.
  useEffect(() => {
    if (!rejected || !stage.current) return;
    setRejectedNow(true);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = still ? null : stage.current.animate(
      [0, -7, 7, -7, 7, -4, 2, 0].map(x => ({ transform: `translateX(${x}px)` })),
      { duration: 450, easing: "cubic-bezier(.36,.07,.19,.97)" });
    const timer = window.setTimeout(() => setRejectedNow(false), 1200);
    return () => { animation?.cancel(); window.clearTimeout(timer); };
  }, [rejected]);

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

  const state = error ? "error" : busy ? "scanning" : ready ? "live" : "starting";
  const status = error ? "Camera unavailable" : busy ? "Checking your face…" : ready ? "Position your face in the circle" : "Starting your camera…";
  return <section className={`photo-verification fid fid-${state}`} aria-label="Photo verification" aria-busy={busy}>
    <div ref={stage} className="fid-stage" data-shake={rejectedNow || undefined}>
      <svg className="fid-ring" viewBox="0 0 240 240" aria-hidden="true">
        {TICKS.map(index => <line key={index} x1="120" y1="6" x2="120" y2="18" transform={`rotate(${index * 6} 120 120)`}
          style={{ ["--t" as string]: index }} />)}
      </svg>
      <div className="fid-lens">
        <video ref={video} autoPlay muted playsInline aria-label="Camera preview"
          onCanPlay={() => setReady(true)} onEmptied={() => setReady(false)} />
        {state === "starting" && <span className="fid-placeholder" aria-hidden="true"><ScanFace size={54} /></span>}
        {state === "error" && <span className="fid-placeholder" aria-hidden="true"><CameraOff size={44} /></span>}
        {state === "scanning" && <span className="fid-sweep" aria-hidden="true" />}
      </div>
    </div>
    <p className="fid-status" aria-live="polite">{status}</p>
    {error ? <>
      <p className="fid-error" role="alert">{error}</p>
      <button type="button" className="button secondary fid-retry" disabled={busy}
        onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16} /> Retry camera</button>
    </> : <ul className="fid-tips" aria-label="Tips">
      <li><Sun size={14} /> Good light</li>
      <li><User size={14} /> Only your face</li>
      <li><Eye size={14} /> Look at the camera</li>
    </ul>}
    <button type="button" className="button primary" disabled={!ready || busy}
      onClick={() => void capture()}>{busy ? "Verifying photo…" : "Capture and verify"}</button>
    <button type="button" className="button secondary fid-back" disabled={busy} onClick={onCancel}><ArrowLeft size={16} /> Back to sign in</button>
    <p className="fid-note">We compare this photo with your saved profile photo. It is only used for this check and is not saved.</p>
  </section>;
}
