// Samples an existing video element. This module never opens a camera stream.
export function createFeedPhotoVerifier({ getVideo, request, apiBase, onChange }) {
  let sessionId = null;
  let enabled = null;
  let ready = false;
  let active = false;
  let busy = false;
  let generation = 0;
  let timer = null;
  let controller = null;
  let lastVerifiedAt = 0;
  let currentState = "pending";
  let currentMessage = "";
  const intervalMs = 15000;

  function notify(state, message) {
    if (state !== undefined) currentState = state;
    if (message !== undefined) currentMessage = message;
    onChange({ state: currentState, message: currentMessage, enabled, busy, ready });
  }
  function frame() {
    const video = getVideo();
    const tracks = video?.srcObject?.getVideoTracks?.() || [];
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight ||
        !tracks.some((track) => track.readyState === "live" && track.enabled && !track.muted))
      throw new Error("Waiting for a clear frame from your camera.");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not capture a camera frame.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capture = canvas.toDataURL("image/jpeg", 0.85);
    canvas.width = canvas.height = 0;
    return capture;
  }

  async function fetchJson(path, options = {}) {
    const ownedController = new AbortController();
    controller = ownedController;
    const timeout = setTimeout(() => ownedController.abort(), 20000);
    try {
      const response = await request(`${apiBase}/api/interview/${encodeURIComponent(sessionId)}/${path}`,
        { ...options, signal: ownedController.signal });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.detail?.message || data.detail || "Camera verification is unavailable. Please retry.");
        error.code = data.detail?.code;
        throw error;
      }
      return data;
    } finally { clearTimeout(timeout); if (controller === ownedController) controller = null; }
  }

  async function load(id) {
    sessionId = id;
    enabled = null;
    ready = false;
    const ticket = generation;
    busy = true;
    notify("loading", "Loading photo verification…");
    try {
      const data = await fetchJson("photo-verification");
      if (ticket !== generation) return;
      if (typeof data.enabled !== "boolean") throw new Error("Photo verification settings could not be loaded.");
      enabled = data.enabled;
      ready = !enabled || data.verified === true;
      notify(enabled ? "pending" : "disabled", enabled
        ? "Capture a starting photo. We’ll verify it against your saved photo and compare later camera frames with it."
        : "");
    } catch (error) {
      if (ticket === generation) notify("unavailable", error.message);
    } finally {
      if (ticket === generation) { busy = false; notify(); }
    }
  }

  async function check(establish = false) {
    if (enabled === false) return true;
    if (busy || enabled !== true) return false;
    const ticket = generation;
    busy = true;
    ready = false;
    notify("checking", "Checking camera photo…");
    try {
      const data = await fetchJson(establish ? "photo-reference" : "photo-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webcam_photo: frame() }),
      });
      if (ticket !== generation) return false;
      ready = data.verified === true;
      if (ready) lastVerifiedAt = Date.now();
      notify(ready ? "matched" : "mismatch", ready
        ? "Photo verified. Camera frames will be checked during the interview."
        : data.message || "Photo does not match the starting frame. Face the camera for another check.");
      return ready;
    } catch (error) {
      if (ticket === generation) {
        ready = false;
        notify(error.code === "PHOTO_MISMATCH" ? "mismatch" : "unavailable", error.message);
      }
      return false;
    } finally {
      if (ticket === generation) { busy = false; notify(); }
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (!active || enabled !== true) return;
    timer = setTimeout(async () => { await check(false); schedule(); }, intervalMs);
  }

  return {
    captureFrame: frame,
    load,
    isReady: () => enabled === false || ready,
    isBusy: () => busy,
    async captureReference() {
      if (enabled === null) await load(sessionId);
      return check(true);
    },
    async verifyBeforeJoin() {
      if (enabled === false) return true;
      // A just-completed capture is still within the server's 60-second gate.
      if (ready && Date.now() - lastVerifiedAt < 5000) return true;
      return check(true);
    },
    start() { active = true; schedule(); },
    stop() {
      active = false;
      generation++;
      clearTimeout(timer);
      controller?.abort();
      busy = false;
    },
    invalidate() {
      generation++;
      controller?.abort();
      busy = false;
      ready = enabled === false;
      lastVerifiedAt = 0;
      if (enabled !== false) notify("pending", "Camera changed or disconnected. Verify a fresh frame to continue.");
      schedule();
    },
  };
}
