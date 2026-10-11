import { useEffect, useState, type RefObject } from "react";
import { CheckCircle2, Lightbulb, ScanFace, Sun, UserRound } from "lucide-react";

// Live guidance while a student takes their profile photo. The server makes
// the final decision; these checks use the same lighting limits so most
// problems are fixed before the photo is taken.
type Light = { tone: "ok" | "warn" | "wait"; message: string };
const MIN_FACE = 70, MAX_FACE = 215, MAX_BACKLIGHT = 55;

function luminance(data: Uint8ClampedArray) {
  let sum = 0;
  for (let index = 0; index < data.length; index += 4) sum += 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
  return sum / (data.length / 4);
}

export function usePhotoLight(video: RefObject<HTMLVideoElement>, active: boolean): Light {
  const [light, setLight] = useState<Light>({ tone: "wait", message: "Starting your camera…" });
  useEffect(() => {
    if (!active) return;
    const canvas = document.createElement("canvas");
    canvas.width = 160; canvas.height = 120;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const timer = window.setInterval(() => {
      const element = video.current;
      if (!context || !element || element.readyState < 2 || !element.videoWidth) return;
      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      const frame = luminance(context.getImageData(0, 0, canvas.width, canvas.height).data);
      // The centre of the face outline below.
      const face = luminance(context.getImageData(56, 30, 48, 50).data);
      setLight(face < MIN_FACE ? { tone: "warn", message: "Too dark: face a window or lamp" }
        : face > MAX_FACE ? { tone: "warn", message: "Too bright: move away from direct light" }
        : frame - face > MAX_BACKLIGHT ? { tone: "warn", message: "Light behind you: turn to face the light" }
        : { tone: "ok", message: "Good light. Line up your face and capture" });
    }, 500);
    return () => window.clearInterval(timer);
  }, [active, video]);
  return light;
}

export function PhotoTips() {
  return <ul className="photo-tips" aria-label="Tips for a clear photo">
    <li><Sun size={16} /><span><strong>Even, front light</strong>Face a window or lamp; avoid a bright window behind you.</span></li>
    <li><ScanFace size={16} /><span><strong>Face inside the outline</strong>Look straight at the camera with your head level.</span></li>
    <li><UserRound size={16} /><span><strong>Only you, clearly visible</strong>No cap, mask or sunglasses; keep your whole face in view.</span></li>
    <li><Lightbulb size={16} /><span><strong>Sharp, not blurry</strong>Hold still and wipe the camera lens if it looks hazy.</span></li>
  </ul>;
}

export function LightBadge({ light }: { light: Light }) {
  return <p className={`photo-light ${light.tone}`} role="status" aria-live="polite">
    {light.tone === "ok" && <CheckCircle2 size={15} />}{light.message}
  </p>;
}
