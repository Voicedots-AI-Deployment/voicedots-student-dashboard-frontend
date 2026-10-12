/* VoiceDot AI — Live AI Panel Interview (Stage 5)
 * Google Meet style video call with AI Panelist stage, PiP candidate camera,
 * continuous live transcript sidebar, pre-join device verification (real mic analyzer),
 * talking ring animations, and post-call report compilation flow.
 */

import { createFeedPhotoVerifier } from "./feed-photo-verifier.js";

const _HTTP_BASE = window.__API_BASE__ || window.location.origin;
const WS_BASE = _HTTP_BASE.replace(/^http/, "ws");

const STT_SAMPLE_RATE = 16000;
const TTS_SAMPLE_RATE = 48000;
let currentTTSSampleRate = TTS_SAMPLE_RATE;
const PREBUFFER_SECONDS = 0.08;
// app.js's login flow only ever caches the logged-in student's profile under
// "vd_student_data" (set right after /api/auth/student-me succeeds). The
// similarly named vd_student_session is an HttpOnly cookie and therefore
// cannot be read from JavaScript. Real auth enforcement is that cookie on
// every API/WS call; this stored profile is only a client-side
// "do we already look logged in" hint for that redirect.
const STUDENT_SESSION_KEY = "vd_student_data";
function getStudentSession() {
  try { return JSON.parse(sessionStorage.getItem(STUDENT_SESSION_KEY)); } catch { return null; }
}

function studentAuthHeaders() {
  return {};
}

function getCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}

let studentCsrfToken = "";

async function studentFetch(url, options = {}) {
  const request = { ...options, credentials: "include" };
  const method = String(request.method || "GET").toUpperCase();
  const headers = new Headers(request.headers || {});
  headers.set("X-Portal-Role", "student");
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    if (!studentCsrfToken && !getCookie("vd_student_csrf")) {
      const identity = await fetch(`${_HTTP_BASE}/api/auth/student-me`, {
        credentials: "include", headers: { "X-Portal-Role": "student" },
      });
      if (!identity.ok) throw new Error("Your session expired. Please sign in again.");
      studentCsrfToken = (await identity.json()).csrf_token || "";
    }
    const csrf = studentCsrfToken || getCookie("vd_student_csrf");
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  request.headers = headers;
  return fetch(url, request);
}

// Elements - Prejoin
const prejoinScreen = document.getElementById("prejoin-screen");
const pjPanel1 = document.getElementById("pj-panel-1");
const pjPanel2 = document.getElementById("pj-panel-2");
const pjPanel3 = document.getElementById("pj-panel-3");
const lobbyVideoEl = document.getElementById("lobby-video");
const camErrorEl = document.getElementById("cam-error");
const faceCheckEl = document.getElementById("face-check");
const lightingCheckEl = document.getElementById("lighting-check");
const framingCheckEl = document.getElementById("framing-check");
const camSelectEl = document.getElementById("cam-select");
const micSelectEl = document.getElementById("mic-select");
const pjShareAllowBtn = document.getElementById("pj-share-allow");
const pjJoinBtn = document.getElementById("pj-join-btn");
const recordingConsentEl = document.getElementById("recording-consent");
const recordingStatusEl = document.getElementById("recording-status");
const callRecordingStatusEl = document.getElementById("call-recording-status");
const micStatusText = document.getElementById("mic-status-text");
const micOkWrap = document.getElementById("mic-ok-wrap");
const micErrorEl = document.getElementById("mic-error");
const shareOkEl = document.getElementById("share-ok");
const shareErrorEl = document.getElementById("share-error");

// Elements - Active Call
const callScreen = document.getElementById("call-screen");
const topbarRoundLabel = document.getElementById("topbar-round-label");
const liveChip = document.getElementById("live-chip");
const rndBadge = document.getElementById("rnd-badge");
const rndName = document.getElementById("rnd-name");
const rndStatus = document.getElementById("rnd-status");
const aiNameEl = document.getElementById("ai-name");
const aiRoleEl = document.getElementById("ai-role");
const captionTextEl = document.getElementById("caption-text");
const candidateVideoEl = document.getElementById("candidate-video");
const pipInitialsEl = document.getElementById("pip-initials");
const pipNameEl = document.getElementById("pip-name");
const transcriptEl = document.getElementById("interview-transcript");
const txCountEl = document.getElementById("tx-count");
const screenShareToggleBtn = document.getElementById("screenshare-restore-btn");
const endInterviewBtn = document.getElementById("end-interview-btn");
const endConfirmBackdropEl = document.getElementById("end-confirm-backdrop");
const endConfirmOkBtn = document.getElementById("end-confirm-ok");
const endConfirmCancelBtn = document.getElementById("end-confirm-cancel");
const screenVideoEl = document.getElementById("screen-video");
const integrityToastEl = document.getElementById("integrity-toast");
const integrityToastTextEl = document.getElementById("integrity-toast-text");
const integrityStrikesEl = document.getElementById("integrity-strikes");
const currentQuestionTextEl = document.getElementById("current-question-text");
const panelAgentEls = Array.from(document.querySelectorAll("[data-panel-round]"));
const panelAnimations = new Map();
const panelLipTimers = new WeakMap();
const panelBlinkTimers = new WeakMap();

// Elements - Report & Results
const reportScreen = document.getElementById("report-screen");
const resultsScreen = document.getElementById("results-screen");
const resultsScoreValue = document.getElementById("results-score-value");
const resultsReadiness = document.getElementById("results-readiness");
const resultsSummary = document.getElementById("results-summary");
const resultsCoreDims = document.getElementById("results-core-dimensions");
const resultsDomainDims = document.getElementById("results-domain-dimensions");
const resultsStrengths = document.getElementById("results-strengths");
const resultsImprovements = document.getElementById("results-improvements");
const resultsDownloadLink = document.getElementById("results-download-link");
const incompleteScreen = document.getElementById("incomplete-screen");
const resumeInterviewBtn = document.getElementById("resume-interview-btn");
const incompleteMessage = document.getElementById("incomplete-message");
const resultsAgentBreakdown = document.getElementById("results-agent-breakdown");
const resultsCommunication = document.getElementById("results-communication");
const resultsResumeAlignment = document.getElementById("results-resume-alignment");
const resultsLearningPlan = document.getElementById("results-learning-plan");
const resultsQuestionReviews = document.getElementById("results-question-reviews");
const resultsReportTitle = document.getElementById("results-report-title");
const resultsSavedNotice = document.getElementById("results-saved-notice");
const resultsSavedDetail = document.getElementById("results-saved-detail");
// Value to restore each section's `display` to when re-showing it — three of
// these sections set `display:grid` inline in interview.html, so blanking
// the JS override back to "" would fall through to the div default (block)
// and collapse their column layout instead of restoring it.
const RESULTS_DATA_SECTIONS = {
  "results-score-section": "grid",
  "results-dims-section": "grid",
  "results-strengths-section": "grid",
  "results-panel-section": "",
  "results-insights-section": "",
  "results-learning-section": "",
  "results-review-section": "",
};

// State
let currentSessionId = null;
let currentSubmissionId = null;
let ws = null;
let audioContext = null;
let playbackAudioContext = null;
let playbackAnalyser = null;
let recordingAudioDestination = null;
let recordingMicStream = null;
let interviewRecorder = null;
let recordingSegmentId = null;
let recordingChunkSequence = 0;
let recordingPersistenceQueue = Promise.resolve();
let recordingUploadQueue = Promise.resolve();
let recordingStartedAt = 0;
let recordingUploadFailed = false;
let recordingDataDropped = false;
let recordingMimeType = "video/webm";
let recordingExtension = "webm";
let recordingCanvasTimer = null;
let recordingCanvasStream = null;
let recordingPartMetadata = [];
let recordingPartNumber = 1;
let recordingServerClockOffsetMs = 0;
let recordingStopTask = null;
let userMediaStream = null;
let screenStream = null;
let micProcessor = null;
let micCaptureSource = null;
let micCaptureDestination = null;
let deviceSwitchGeneration = { audio: 0, video: 0 };
let micAnalyser = null;
let micAnimId = null;
let micLevelDetected = false;
let micSignalDetected = false;
let micTestContext = null;
let cameraTrackLive = false;
let microphoneTrackLive = false;
let preflightId = null;
let preflightBusy = false;
// Choosing a screen in the browser's share picker exits full screen, and the
// interview then started with no click left to re-enter it. The last
// preflight step now waits for one explicit click that requests full screen.
let awaitingFullscreen = false;
let fullscreenStartConfirmed = false;
const fullscreenSupported = () => document.fullscreenEnabled !== false && typeof document.documentElement.requestFullscreen === "function";
let interviewHasStarted = false;
let initialConnectionTimer = null;
let preflightStarted = false;
let preflightCancelled = false;
let servicesCheckedAt = 0;
let identityCheckedAt = 0;
const preflightChecks = { camera: "pending", microphone: "pending", noise: "pending", liveness: "pending", identity: "pending", network: "pending", screen: "pending" };
// Every check that must pass before screen sharing is requested.
const CORE_CHECKS = ["camera", "microphone", "noise", "liveness", "identity", "network"];
// Background noise is measured on a raw (unfiltered) microphone feed. The
// value is dBFS; the dB shown to students adds a nominal microphone offset,
// so it is an estimate, not a calibrated sound level.
const NOISE_MAX_DBFS = -24; // 70 on the displayed estimate (94 offset), not calibrated SPL.
const NOISE_DISPLAY_OFFSET = 94;
const NOISE_SAMPLE_MS = 3000;
let lastNoiseDb = null;
// Liveness: the head must turn toward two prompted sides, in a random order,
// so a still photo or a replayed recording cannot pass.
const LIVENESS_TURN_TIMEOUT_MS = 9000;
let latestFaceLandmarks = null;
let latestFaceLandmarksAt = 0;
let supportRetryState = "complete";
let currentAudioEpoch = 0;
let playbackTime = 0;
let playbackCompleteTimer = null;
let playbackEndingEpoch = null;
let processingStatusTimer = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
// True from a dropped connection until the resumed session sends real
// interview traffic; "authenticated" arrives before the server's lock check.
let resumingAfterDrop = false;
let resumePreviouslyStarted = false;
let busyResumeRetries = 0;
const MAX_BUSY_RESUME_RETRIES = 8;
let interviewStopRequested = false;
const MAX_RECONNECT_ATTEMPTS = 5;
const activePlaybackSources = new Set();
let aiSpeaking = false;
let currentAgentRole = "Interviewer"; // restored to ai-role between "Speaking..."/"Listening..." states
let micMuted = false;
let isScreenSharing = false;
let sessionCompletedCleanly = false;
// HR -> Domain -> Industry -> Manager (Priya/Arjun/Neha/Vikram). Meera the
// AI Proctor is a fifth panel tile but never a round -- see backend
// agent_profiles.py.
const TOTAL_INTERVIEW_ROUNDS = 4;
let requiredInterviewRounds = TOTAL_INTERVIEW_ROUNDS;
const completedRounds = new Set();
let reportGenerationStarted = false;
let exchangeCount = 0;
let integrityStrikeCount = 0;
let integritySequence = 0;
let integrityEndRequested = false;
let lastIntegrityEvent = { key: "", at: 0 };
let faceLandmarker = null;
let nativeFaceDetector = null;
let workerObjectFailed = false;
let objectDetector = null; // person-count backstop: catches a body facing away
                            // from the camera, which no face detector can see
let objectDetectorUnavailable = false;
let visionCheckUnavailable = false;
let visionDetectorLoadPromise = null;
let personDetectorLoadPromise = null;
let lastVisionDetectorAttemptAt = 0;
let cameraAnalysisStarted = false;
let cameraAnalysisPassing = false;
let faceCountDetected = 0;
let personBoxCountDetected = 0;
let corroboratedPersonCount = 0;
let personDetectionConfidence = null;
let lastPersonDetectionAt = 0;
let lastMultiplePeopleDetectedAt = 0;
let lastPhoneDetectedAt = 0;
let personCropToggle = 0;
// The object detector's own detectForVideo requires strictly increasing
// timestamps across calls on the SAME instance. It is now called twice per
// tick (full frame + a zoomed-in crop below), and two performance.now()
// reads back-to-back can land on the same millisecond, so both calls route
// through this counter instead of raw performance.now().
let objectDetectorTimestamp = 0;
let lightingPassing = false;
let framingPassing = false;
// Each malpractice signal gets its own wall-clock "Since" timestamp (not a
// frame count) so its warning threshold is accurate to the second regardless
// of how long each analysis tick actually takes. A frame-count approach (e.g.
// "4 bad ticks") silently drifts whenever a tick runs slow — running two
// detectors (face + person) per tick made a nominal "4 ticks @ 800ms = 3.2s"
// take visibly longer in practice (closer to 6s than the intended 5s), since
// the count only advances once each full detection pass finishes.
let absentFaceSince = null;
let multipleFaceSince = null;
let poorLightingSince = null;
let gazeOffCameraSince = null;
let phoneVisibleSince = null;
let phoneDetected = false;
let phoneEvidence = null;
// Calibrated on the Lite2 int8 worker model: phones held up to a webcam score
// 0.5-0.87 in either the full frame or the centre crop (also in dim rooms),
// while frames without a phone score 0. A sighting counts from 0.45; weaker
// sightings need three consistent observations, confident ones two.
const PHONE_EVIDENCE_MIN_SCORE = .45;
const PHONE_CONFIDENT_SCORE = .6;
const PHONE_EVIDENCE_MIN_MS = 500;
let cameraReminderTimes = {};
// Integrity signals are intentionally debounced to avoid false positives,
// but must still be visible quickly to the placement team.
const CANDIDATE_ABSENT_THRESHOLD_MS = 3000;
const MULTIPLE_PEOPLE_THRESHOLD_MS = 5000;
const POOR_LIGHTING_THRESHOLD_MS = 3500;
const GAZE_AWAY_THRESHOLD_MS = 3500;
// Phone evidence is already debounced by two consistent sightings, so a
// confirmed phone is reported on the same analysis tick.
const PHONE_VISIBLE_THRESHOLD_MS = 0;
let lastVisionWarningAt = {};
let visionRecoverySince = {};
let lastVisionObservationAt = 0;
let activePanelRound = 1;
// Meera has no data-panel-round tile (she's not a round -- see
// interview.html) and no photo-based lip-sync frames, so she is driven
// separately from panelAnimations/setActivePanelTalking's per-round logic.
let currentSpeakerIsProctor = false;
const proctorTileEl = document.querySelector('[data-agent-type="proctor"]');

function setRequiredInterviewRounds(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > TOTAL_INTERVIEW_ROUNDS) return;
  requiredInterviewRounds = parsed;
  document.querySelector(".interview-grid")?.setAttribute("data-panel-count", String(requiredInterviewRounds));
  panelAgentEls.forEach((element) => {
    const round = Number(element.dataset.panelRound || 0);
    element.hidden = round < 1 || round > requiredInterviewRounds;
  });
}

// Pinned and served from our own origin. The previously referenced 0.10.22
// stable package does not exist on npm, which is why precheck reported
// "Person check unavailable" even with a person clearly on camera.
const VISION_MODULE_URL = "/vendor/mediapipe/vision_bundle.mjs";
const VISION_WASM_URL = "/vendor/mediapipe/wasm";
const FACE_MODEL_URL = "/vendor/mediapipe/face_landmarker.task";
const OBJECT_MODEL_URL = "/vendor/mediapipe/efficientdet_lite0.tflite"; // Fast fallback for browsers without worker inference.
const VISION_RETRY_INTERVAL_MS = 15000;
const PERSON_DETECTION_INTERVAL_MS = 800;
const MULTIPLE_PERSON_HOLD_MS = 3000;
// A lightweight on-device object detector does not catch a held-up phone on
// every single 800ms tick (angle/glare/partial occlusion by the hand vary
// frame to frame). Without a hold, one missed tick reset phoneVisibleSince
// to null and the 2s accumulation below restarted from zero — in practice
// this meant a phone held steadily for several seconds could still never
// cross PHONE_VISIBLE_THRESHOLD_MS. Mirrors MULTIPLE_PERSON_HOLD_MS above.
const PHONE_DETECTION_HOLD_MS = 3000;

const photoCaptureBtn = document.getElementById("pj-photo-capture");
const photoVerifier = createFeedPhotoVerifier({
  getVideo: () => _isCallScreenActive() ? candidateVideoEl : lobbyVideoEl,
  request: studentFetch,
  apiBase: _HTTP_BASE,
  onChange: ({ message, enabled, ready, state }) => {
    const panel = document.getElementById("pj-photo-verification");
    const status = document.getElementById("pj-photo-status");
    const liveStatus = document.getElementById("call-photo-status");
    if (panel && _isCallScreenActive()) panel.hidden = true;
    if (status && message !== undefined) status.textContent = message;
    if (liveStatus) {
      liveStatus.hidden = enabled === false;
      liveStatus.textContent = ready ? "Photo matched" : state === "mismatch" ? "Photo mismatch"
        : state === "unavailable" ? "Photo check unavailable" : "Photo check pending";
      liveStatus.title = status?.textContent || "";
    }
    updatePrejoinReadiness();
  },
});
window.addEventListener("pagehide", () => {
  preflightCancelled = true;
  clearTimeout(initialConnectionTimer);
  photoVerifier.stop();
  stopMicLevelTest();
  if (interviewRecorder?.state === "recording") interviewRecorder.stop();
  userMediaStream?.getTracks().forEach(track => track.stop());
  screenStream?.getTracks().forEach(track => track.stop());
});

// ============================================================
// INITIALIZATION
// ============================================================

// Keeps this student's session counted as "open" while the interview room
// is on screen, so closing the tab frees the account for the next sign-in
// within a few minutes instead of hours.
// Only while the room is on screen and recently used (speaking counts via
// the live call), so a forgotten tab still reaches the normal idle timeout.
const PRESENCE_INTERVAL_MS = 60000;
const PRESENCE_ACTIVE_FOR_MS = 60 * 60000;
function startPresencePing() {
  let lastActivity = Date.now();
  ["pointerdown", "keydown", "touchstart"].forEach(name => window.addEventListener(name, () => { lastActivity = Date.now(); }, { passive: true }));
  const timer = window.setInterval(() => {
    const inCall = document.getElementById("call-screen")?.offsetParent != null;
    if (!getStudentSession() || document.visibilityState !== "visible") return;
    if (!inCall && Date.now() - lastActivity > PRESENCE_ACTIVE_FOR_MS) return;
    void studentFetch(`${_HTTP_BASE}/api/auth/student-presence`, { method: "POST" })
      .then(response => { if (response.status === 401) window.clearInterval(timer); })
      .catch(() => {});
  }, PRESENCE_INTERVAL_MS);
}

document.addEventListener("DOMContentLoaded", async () => {
  startPresencePing();
  if (!getStudentSession()) {
    // A deep link opened in a fresh tab has no display cache. Restore the
    // identity from the existing HttpOnly session before showing device checks.
    try {
      const response = await studentFetch(`${_HTTP_BASE}/api/auth/student-me`);
      const identity = response.ok ? await response.json() : null;
      if (!identity?.student?.id) throw new Error("Student sign-in required");
      sessionStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(identity.student));
    } catch {
      window.location.href = "/login";
      return;
    }
  }
  setupStudentProfileInfo();
  initializePanelAnimations();
  setupPrejoinFlow();
  setupDeviceMonitoring();

  const urlParams = new URLSearchParams(window.location.search);
  currentSubmissionId = urlParams.get("id") || sessionStorage.getItem("current_submission_id");
  // /upload already creates a Stage 5 session and returns its session_id —
  // reuse it here instead of always POSTing /interview again, which used to
  // create a redundant second session (and silently orphan the first one via
  // is_current=false, storage.py's create_stage5_session). Same
  // query-param-with-sessionStorage-fallback pattern submission_id already
  // uses above.
  currentSessionId = urlParams.get("session_id") || (sessionStorage.getItem("current_submission_id") === currentSubmissionId ? sessionStorage.getItem("current_session_id") : null);
  if (currentSessionId && sessionStorage.getItem(`vd_interview_recording_consent_${currentSessionId}`) === "true") {
    recordingConsentEl.checked = true;
    renderPreflight();
  }

  if (!currentSubmissionId) {
    alert("No interview session found. Redirecting to student portal...");
    window.location.href = "/";
    return;
  }

  // A student who closes the browser/laptop right after their call ends
  // (before the report finished loading) previously landed back at the full
  // camera/mic/screen-share pre-join flow on their next visit, even though
  // the interview was already done — this checks completion first so they
  // go straight to their report/readiness instead of repeating consent
  // screens for an interview that's already over.
  if (await tryResumeCompletedSessionOnLoad()) return;
  renderPreflight();
});

async function tryResumeCompletedSessionOnLoad() {
  if (!currentSessionId) return false;
  try {
    const response = await studentFetch(`${_HTTP_BASE}/api/interview/${currentSessionId}`);
    if (!response.ok) return false;
    const record = await response.json();
    if (record.status !== "completed") {
      // The authenticated session view confirms this is a resume after reload.
      resumePreviouslyStarted = Boolean(record.started_at);
      if (resumePreviouslyStarted) resumingAfterDrop = true;
      return false;
    }
    const agents = new Set((record.turns || []).map((turn) => turn.agent_type).filter(Boolean));
    if (!agents.size || agents.size > TOTAL_INTERVIEW_ROUNDS) return false;
    setRequiredInterviewRounds(agents.size);
    for (let round = 1; round <= requiredInterviewRounds; round += 1) completedRounds.add(round);
    sessionCompletedCleanly = true;
    await restorePendingInterviewRecording().catch(error => console.warn("Local video recovery unavailable", error));
    if (prejoinScreen) prejoinScreen.style.display = "none";
    if (callScreen) callScreen.style.display = "none";
    finishAndGenerateReport();
    return true;
  } catch {
    return false;
  }
}

function initializePanelAnimations() {
  document.querySelectorAll("[data-frame-avatar]").forEach((frameStage) => {
    const tile = frameStage.closest("[data-panel-round]");
    const round = Number(tile?.dataset.panelRound || 0);
    if (!round) return;
    const idleFrame = frameStage.querySelector('[data-frame-state="idle"]');
    const blinkFrame = frameStage.querySelector('[data-frame-state="blink"]');
    const talkingFrames = Array.from(frameStage.querySelectorAll('[data-frame-state="talk"]'));
    if (!idleFrame || !talkingFrames.length) return;

    const frameImages = [idleFrame, blinkFrame, ...talkingFrames].filter(Boolean);
    const controller = {
      frameImages,
      idleFrame,
      blinkFrame,
      talkingFrames,
      frameIndex: -1,
      visibleFrame: null,
      agentType: String(tile.dataset.agentType || ""),
    };
    panelAnimations.set(round, controller);
    showPanelFrame(controller, idleFrame);
    startPanelBlinkLoop(controller);
  });
}

function showPanelFrame(controller, frame) {
  if (!frame || controller.visibleFrame === frame) return;
  controller.frameImages.forEach((image) => image.classList.toggle("is-visible", image === frame));
  controller.visibleFrame = frame;
}

function setActivePanelTalking(talking) {
  proctorTileEl?.classList.toggle("speaking", Boolean(talking && currentSpeakerIsProctor));
  panelAnimations.forEach((controller, round) => {
    // While Meera is the one speaking, the current interviewer's own tile
    // must stay idle -- otherwise both would appear to talk over each other.
    const active = Boolean(talking && round === activePanelRound && !currentSpeakerIsProctor);
    if (active) startPanelLipLoop(controller);
    else stopPanelLipLoop(controller);
  });
}

function startPanelLipLoop(controller) {
  if (panelLipTimers.has(controller)) return;
  stopPanelBlinkLoop(controller);
  const waveform = playbackAnalyser ? new Uint8Array(playbackAnalyser.fftSize) : null;
  let openness = 0;
  controller.frameIndex = -1;

  // Follow the amplitude of the audio that is actually reaching the user's
  // speakers. This avoids the robotic fixed-rate open/close loop and keeps
  // silence, pauses, and syllables visually aligned with playback.
  const animate = () => {
    let target = 0;
    if (playbackAnalyser && waveform) {
      playbackAnalyser.getByteTimeDomainData(waveform);
      let sumSquares = 0;
      for (let i = 0; i < waveform.length; i += 1) {
        const sample = (waveform[i] - 128) / 128;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / waveform.length);
      target = Math.max(0, Math.min(1, (rms - 0.012) / 0.105));
    }
    const response = target > openness ? 0.58 : 0.3;
    openness += (target - openness) * response;
    const nextFrame = openness < 0.055
      ? -1
      : Math.min(Math.floor(openness * controller.talkingFrames.length), controller.talkingFrames.length - 1);
    if (nextFrame !== controller.frameIndex) {
      controller.frameIndex = nextFrame;
      showPanelFrame(controller, nextFrame < 0 ? controller.idleFrame : controller.talkingFrames[nextFrame]);
    }
    const animationFrame = window.requestAnimationFrame(animate);
    panelLipTimers.set(controller, animationFrame);
  };
  panelLipTimers.set(controller, window.requestAnimationFrame(animate));
}

function stopPanelLipLoop(controller) {
  const animationFrame = panelLipTimers.get(controller);
  if (animationFrame !== undefined) {
    window.cancelAnimationFrame(animationFrame);
    panelLipTimers.delete(controller);
  }
  controller.frameIndex = -1;
  showPanelFrame(controller, controller.idleFrame);
  startPanelBlinkLoop(controller);
}

function startPanelBlinkLoop(controller) {
  if (!(controller.idleFrame && controller.blinkFrame) || panelBlinkTimers.has(controller)) return;
  const state = { waitTimer: null, closeTimer: null };
  panelBlinkTimers.set(controller, state);
  const schedule = () => {
    // Keep blinks occasional and brief. Talking frames always have open eyes,
    // so speech can no longer trigger repeated or held-eye blinks.
    const delay = 6500 + Math.random() * 5000;
    state.waitTimer = window.setTimeout(() => {
      showPanelFrame(controller, controller.blinkFrame);
      state.closeTimer = window.setTimeout(() => {
        showPanelFrame(controller, controller.idleFrame);
        if (panelBlinkTimers.get(controller) === state) schedule();
      }, 105);
    }, delay);
  };
  schedule();
}

function stopPanelBlinkLoop(controller) {
  const state = panelBlinkTimers.get(controller);
  if (state) {
    if (state.waitTimer !== null) window.clearTimeout(state.waitTimer);
    if (state.closeTimer !== null) window.clearTimeout(state.closeTimer);
    panelBlinkTimers.delete(controller);
  }
  showPanelFrame(controller, controller.idleFrame);
}

async function requestInterviewFullscreen() {
  if (document.fullscreenElement) return true;
  if (navigator.userActivation && !navigator.userActivation.isActive) return false;
  try {
    await document.documentElement.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

async function acquireEntireScreenShare() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "monitor" },
    audio: false,
    preferCurrentTab: false,
    selfBrowserSurface: "exclude",
    surfaceSwitching: "exclude",
  });
  const track = stream.getVideoTracks()[0];
  const displaySurface = track?.getSettings?.().displaySurface;
  if (!track || displaySurface !== "monitor") {
    stream.getTracks().forEach((item) => item.stop());
    throw new Error("Select your entire screen. Browser tabs and application windows are not allowed.");
  }
  // The stream exists only for integrity monitoring. Rendering it inside
  // the captured page creates the infinite mirror/projection shown in the
  // bug report, so this preview must remain permanently hidden.
  if (screenVideoEl) {
    screenVideoEl.srcObject = stream;
    screenVideoEl.style.setProperty("display", "none", "important");
  }
  return { stream, track };
}

const questionCard = document.querySelector(".question-focus");
if (questionCard && typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => {
    callScreen.style.setProperty("--question-height", `${Math.ceil(questionCard.getBoundingClientRect().height)}px`);
  }).observe(questionCard);
}

function setupStudentProfileInfo() {
  try {
    const raw = sessionStorage.getItem("vd_student_data");
    if (raw) {
      const student = JSON.parse(raw);
      const name = student.full_name || "Candidate";
      const inits = name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
      if (pipNameEl) pipNameEl.textContent = `${name.split(" ")[0]} (You)`;
      if (pipInitialsEl) pipInitialsEl.textContent = inits;
    }
  } catch {}
}

function setupPrejoinFlow() {
  for (const [id, choice] of [["support-retry-yes", "retry"], ["support-retry-no", "continue"]]) {
    document.getElementById(id)?.addEventListener("click", () => {
      if (supportRetryState !== "awaiting_choice" || !ws || ws.readyState !== WebSocket.OPEN) return;
      supportRetryState = "submitted";
      document.querySelectorAll(".support-retry-actions button").forEach(button => { button.disabled = true; });
      ws.send(JSON.stringify({ type: "support_retry_choice", choice }));
    });
  }
  pjJoinBtn?.addEventListener("click", () => {
    void requestInterviewFullscreen();
    void runPreflight();
  });
  recordingConsentEl?.addEventListener("change", renderPreflight);
  document.getElementById("pj-cam-retry")?.addEventListener("click", () => void retryPreflight("camera"));
  document.getElementById("pj-mic-retry")?.addEventListener("click", () => void retryPreflight("microphone"));
  photoCaptureBtn?.addEventListener("click", () => void retryPreflight("identity"));
  document.getElementById("pj-network-retry")?.addEventListener("click", () => void retryPreflight("network"));
  document.getElementById("pj-noise-retry")?.addEventListener("click", () => void retryPreflight("noise"));
  document.getElementById("pj-liveness-retry")?.addEventListener("click", () => void retryPreflight("liveness"));
  pjShareAllowBtn?.addEventListener("click", () => void retryPreflight("screen"));
  document.getElementById("pj-fullscreen-start")?.addEventListener("click", async () => {
    // Must run inside this click: full screen needs a live user gesture.
    const entered = await requestInterviewFullscreen();
    const error = document.getElementById("pj-fullscreen-error");
    if (!entered) {
      if (error) error.textContent = "Your browser did not allow full screen. Allow it for this site, then click again.";
      return;
    }
    if (error) error.textContent = "";
    awaitingFullscreen = false;
    fullscreenStartConfirmed = true;
    void runPreflight();
  });

}

function showPrejoinError(element, message) {
  if (!element) return;
  element.textContent = message;
  element.style.display = "block";
}

function renderPreflight() {
  const panels = { camera: pjPanel1, microphone: pjPanel2, noise: document.getElementById("pj-noise-panel"), liveness: document.getElementById("pj-liveness-panel"), identity: document.getElementById("pj-photo-verification"), network: document.getElementById("pj-network-panel"), screen: pjPanel3 };
  const firstFailed = PREFLIGHT_ORDER.find(key => preflightChecks[key] === "failed");
  for (const [key, panel] of Object.entries(panels)) {
    if (panel) panel.classList.toggle("active", key === firstFailed ||
      (preflightStarted && key === "screen" && preflightChecks[key] !== "passed" &&
       CORE_CHECKS.every(item => preflightChecks[item] === "passed")));
    panel?.querySelectorAll("button,select").forEach(element => { element.disabled = preflightBusy; });
  }
  const fullscreenPanel = document.getElementById("pj-fullscreen-panel");
  fullscreenPanel?.classList.toggle("active", awaitingFullscreen);
  fullscreenPanel?.querySelectorAll("button").forEach(element => { element.disabled = preflightBusy; });
  document.getElementById("preflight-loading").hidden = !preflightBusy;
  pjJoinBtn.disabled = preflightBusy || !recordingConsentEl?.checked;
  pjJoinBtn.hidden = awaitingFullscreen || Object.values(preflightChecks).includes("failed") ||
    (preflightStarted && CORE_CHECKS.every(key => preflightChecks[key] === "passed") && preflightChecks.screen !== "passed");
  renderPreflightSteps();
  pjJoinBtn.textContent = preflightBusy ? "Preparing Interview…" : "Start AI Interview";
  document.getElementById("preflight-title").textContent = preflightStarted ? "Preparing Interview" : "Start AI Interview";
}

function preflightStatus(message) {
  document.getElementById("preflight-status").textContent = message;
}

function failPreflight(key, message) {
  preflightChecks[key] = "failed";
  const errors = { camera: camErrorEl, microphone: micErrorEl, noise: document.getElementById("pj-noise-error"), liveness: document.getElementById("pj-liveness-error"), identity: document.getElementById("pj-photo-status"), network: document.getElementById("pj-network-error"), screen: shareErrorEl };
  showPrejoinError(errors[key], message);
  renderPreflight();
}

async function waitForPreflight(check, message, timeout = 15000) {
  const until = Date.now() + timeout;
  while (!check()) {
    if (preflightCancelled) throw new Error("Preparation cancelled.");
    if (Date.now() > until) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function checkReadiness() {
  if (!preflightId) {
    const response = await studentFetch(`${_HTTP_BASE}/api/resume/${currentSubmissionId}/preflight`, { method: "POST", signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Could not prepare this interview.");
    preflightId = data.preflight_id;
  }
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(`${WS_BASE}/ws/interview-preflight/${currentSubmissionId}?preflight_id=${encodeURIComponent(preflightId)}`);
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true; clearTimeout(timeout); socket.close();
      if (error) reject(error); else resolve();
    };
    const timeout = setTimeout(() => finish(new Error("Connection check timed out. Retry the readiness check.")), 15000);
    socket.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ready") { servicesCheckedAt = Date.now(); finish(); }
        else if (data.type === "error") {
          if (String(data.detail).includes("expired")) { preflightId = null; preflightChecks.identity = "pending"; }
          finish(new Error(data.detail || "Interview services are unavailable."));
        }
      } catch (error) { finish(error); }
    };
    socket.onerror = () => finish(new Error("Could not connect to the interview service. Retry the readiness check."));
    socket.onclose = () => finish(new Error("Connection check stopped. Check your sign-in and retry."));
  });
}

async function verifyPreflightIdentity() {
  preflightStatus("Verifying your identity across several camera frames. Look toward the camera and blink naturally.");
  const captures = [];
  for (let index = 0; index < 6; index++) {
    if (preflightCancelled || !hasLiveTrack("video")) throw new Error("Camera unavailable. Retry verification.");
    captures.push(photoVerifier.captureFrame());
    if (index < 5) await new Promise(resolve => setTimeout(resolve, 500));
  }
  const response = await studentFetch(`${_HTTP_BASE}/api/resume/${currentSubmissionId}/preflight/${preflightId}/identity`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ captures }), signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || !data.verified) throw new Error(data.detail?.message || data.detail || "Identity verification failed. Please retry.");
  identityCheckedAt = Date.now();
}

// Windows lists the same microphone up to three times ("Default - X",
// "Communications - X" and "X"). Keep one entry per physical device.
function uniqueDevices(list) {
  const seen = new Map();
  for (const device of list) {
    if (device.deviceId === "default" || device.deviceId === "communications") continue;
    const key = device.groupId ? `${device.groupId}|${device.label.replace(/^(Default|Communications)\s*-\s*/i, "")}` : device.deviceId;
    if (!seen.has(key)) seen.set(key, device);
  }
  return [...seen.values()];
}

// Uses the system default microphone; if it picks up no sound, tries each
// other microphone in turn and keeps the first one that does.
async function findWorkingMicrophone() {
  const heard = async (timeout) => {
    startMicLevelTest();
    await micTestContext?.resume();
    try {
      await waitForPreflight(() => hasLiveTrack("audio") && micTestContext?.state === "running" && micSignalDetected, "", timeout);
      return true;
    } catch (error) {
      if (preflightCancelled) throw error;
      return false;
    }
  };
  preflightStatus("Say a few words so we can hear your microphone.");
  if (await heard(6000)) return;
  const current = userMediaStream?.getAudioTracks()[0]?.getSettings?.() || {};
  const { mics } = await populateDeviceSelects();
  for (const mic of mics) {
    // Skip the microphone that was just tested (the default resolves to it).
    if (mic.deviceId === current.deviceId || (current.groupId && mic.groupId === current.groupId)) continue;
    preflightStatus(`Trying ${mic.label || "another microphone"}… say a few words.`);
    if (!await attachDeviceTrack("audio", mic.deviceId)) continue;
    if (micSelectEl) micSelectEl.value = mic.deviceId;
    if (await heard(4000)) return;
  }
  throw new Error("No microphone audio was detected. Say a few words, check that your microphone is not muted, then retry or choose another microphone.");
}

function showNoiseLevel(db) {
  const row = document.querySelector('#pf-steps [data-check="noise"]');
  if (!row) return;
  const estimate = Math.max(20, Math.round(db + NOISE_DISPLAY_OFFSET));
  row.style.setProperty("--level", `${Math.max(4, Math.min(100, (db + 80) / 60 * 100))}%`);
  row.dataset.loud = db > NOISE_MAX_DBFS ? "true" : "false";
  row.querySelector("small").textContent = `Measuring… about ${estimate} dB`;
}

// Measures background noise for a few seconds on an unfiltered feed and
// blocks the interview while the room is too loud.
async function measureBackgroundNoise() {
  preflightStatus("Thanks! Now stay quiet for 3 seconds while we measure the background noise.");
  const deviceId = userMediaStream?.getAudioTracks()[0]?.getSettings?.().deviceId;
  const raw = await navigator.mediaDevices.getUserMedia({
    audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : { deviceId: { ideal: "default" } }), echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    video: false,
  });
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextCtor();
  try {
    await context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(raw).connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    const samples = [];
    const until = Date.now() + NOISE_SAMPLE_MS;
    // Give the student a moment to stop speaking after the microphone check.
    await new Promise(resolve => setTimeout(resolve, 1000));
    const sampleUntil = Math.max(until, Date.now() + NOISE_SAMPLE_MS - 1000);
    while (Date.now() < sampleUntil) {
      if (preflightCancelled) throw new Error("Preparation cancelled.");
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const value of buffer) sum += value * value;
      const db = 20 * Math.log10(Math.max(Math.sqrt(sum / buffer.length), 1e-6));
      samples.push(db);
      showNoiseLevel(db);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // The median ignores a single cough or click.
    const median = samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    lastNoiseDb = Math.max(20, Math.round(median + NOISE_DISPLAY_OFFSET));
    if (median > NOISE_MAX_DBFS) {
      throw new Error(`Your room is too noisy (about ${lastNoiseDb} dB). Move somewhere quieter, close doors or windows, then measure again.`);
    }
  } finally {
    raw.getTracks().forEach(track => track.stop());
    void context.close().catch(() => {});
  }
}

// Mirrored like the preview: < 0.5 means the head turned toward the
// student's left (the left of the screen).
function headTurnRatio() {
  const landmarks = latestFaceLandmarks;
  if (!landmarks || Date.now() - latestFaceLandmarksAt > 1500) return null;
  const nose = landmarks[1], eyeA = landmarks[33], eyeB = landmarks[263];
  if (!nose || !eyeA || !eyeB) return null;
  const a = 1 - eyeA.x, b = 1 - eyeB.x, n = 1 - nose.x;
  const span = Math.abs(a - b);
  return span > 0.01 ? (n - Math.min(a, b)) / span : null;
}

function showLivenessPrompt(side) {
  const prompt = document.getElementById("pf-liveness");
  if (!prompt) return;
  prompt.hidden = !side;
  if (!side) return;
  prompt.dataset.side = side;
  prompt.querySelector(".pf-arrow").textContent = side === "left" ? "←" : side === "right" ? "→" : "•";
  document.getElementById("pf-liveness-text").textContent =
    side === "center" ? "Now look back at the camera" : `Slowly turn your head ${side}`;
}

async function checkLiveness() {
  // Without face landmarks (an older browser), the multi-frame identity
  // check that follows is the remaining guard.
  if (!faceLandmarker) return;
  const sides = Math.random() < 0.5 ? ["left", "right"] : ["right", "left"];
  try {
    for (const [step, side] of [...sides, "center"].entries()) {
      showLivenessPrompt(side);
      document.querySelectorAll(".pf-turn-progress i").forEach((dot, index) => {
        dot.classList.toggle("done", index < step); dot.classList.toggle("active", index === step);
      });
      preflightStatus(side === "center" ? "Look back at the camera." : `Follow the arrow: slowly turn your head ${side}.`);
      await waitForPreflight(() => {
        if (faceCountDetected !== 1) return false;
        const ratio = headTurnRatio();
        if (ratio == null) return false;
        return side === "left" ? ratio < 0.36 : side === "right" ? ratio > 0.64 : ratio > 0.4 && ratio < 0.6;
      }, "We couldn't confirm a live person. Keep only your face in view, follow the arrow, then try again.", LIVENESS_TURN_TIMEOUT_MS);
    }
  } finally {
    showLivenessPrompt(null);
  }
}

const PREFLIGHT_STEP_TEXT = {
  camera: { checking: "Checking your camera and lighting…", passed: "Camera ready", failed: "Needs attention" },
  microphone: { checking: "Say a few words…", passed: "We can hear you", failed: "Needs attention" },
  noise: { checking: "Stay quiet for 3 seconds…", passed: "", failed: "Too noisy" },
  liveness: { checking: "Follow the arrow on the camera", passed: "Live person confirmed", failed: "Try again" },
  identity: { checking: "Matching your profile photo…", passed: "Verified", failed: "Not verified" },
  network: { checking: "Connecting to the interview service…", passed: "Connected", failed: "Not connected" },
  screen: { checking: "Waiting for your entire screen…", passed: "Sharing", failed: "Share again" },
};

// One focused step at a time: which check the student should look at now.
const PREFLIGHT_ORDER = ["camera", "microphone", "noise", "liveness", "identity", "network", "screen"];
const PREFLIGHT_TITLES = { camera: "Camera", microphone: "Microphone", noise: "Quiet room", liveness: "Liveness", identity: "Identity", network: "Connection", screen: "Screen sharing" };
const PREFLIGHT_ICONS = {
  camera: '<svg viewBox="0 0 24 24"><path d="M15 10l4.5-2.6v9.2L15 14"/><rect x="3" y="6.5" width="12" height="11" rx="2.5"/></svg>',
  microphone: '<i class="pf-ring-a"></i><i class="pf-ring-b"></i><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  noise: '<svg viewBox="0 0 24 24"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/></svg>',
  liveness: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="10" rx="5.5" ry="7"/><path d="M5 21c1.2-3 4-4.5 7-4.5s5.8 1.5 7 4.5"/></svg>',
  identity: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  network: '<svg viewBox="0 0 24 24"><path d="M4 9a12 12 0 0 1 16 0M7 12.5a7.5 7.5 0 0 1 10 0M10 16a3 3 0 0 1 4 0"/><circle cx="12" cy="19" r="1"/></svg>',
  screen: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
};

function currentPreflightFocus() {
  const failed = PREFLIGHT_ORDER.find(key => preflightChecks[key] === "failed");
  if (failed) return failed;
  // Steps that need the student come first, then background ones.
  const active = ["microphone", "noise", "liveness", "identity", "camera", "network"].find(key => preflightChecks[key] === "checking");
  if (active) return active;
  if (preflightStarted && CORE_CHECKS.every(key => preflightChecks[key] === "passed")) return "screen";
  return PREFLIGHT_ORDER.find(key => preflightChecks[key] !== "passed") || "screen";
}

function renderPreflightFocus() {
  const focus = document.getElementById("pf-focus");
  if (!focus) return;
  focus.hidden = !preflightStarted;
  if (!preflightStarted) return;
  const key = currentPreflightFocus();
  const state = key === "screen" && preflightChecks.screen === "pending" ? "action" : preflightChecks[key];
  if (focus.dataset.step !== key) {
    focus.dataset.step = key;
    document.getElementById("pf-focus-art").innerHTML = PREFLIGHT_ICONS[key] || "";
    focus.classList.remove("pf-focus-enter"); void focus.offsetWidth; focus.classList.add("pf-focus-enter");
  }
  focus.dataset.state = state;
  const done = PREFLIGHT_ORDER.filter(item => preflightChecks[item] === "passed").length;
  document.getElementById("pf-focus-count").textContent = `Step ${PREFLIGHT_ORDER.indexOf(key) + 1} of ${PREFLIGHT_ORDER.length} · ${done} done`;
  document.getElementById("pf-focus-title").textContent = PREFLIGHT_TITLES[key];
  document.getElementById("pf-focus-state").textContent = state === "action" ? "Click Share entire screen to continue"
    : key === "noise" && state === "passed" ? `Quiet enough${lastNoiseDb ? ` · about ${lastNoiseDb} dB` : ""}`
    : PREFLIGHT_STEP_TEXT[key]?.[state] || "Getting ready…";
}

function renderPreflightSteps() {
  const list = document.getElementById("pf-steps");
  if (!list) return;
  list.hidden = !preflightStarted;
  for (const row of list.querySelectorAll("li[data-check]")) {
    const key = row.dataset.check;
    let state = preflightChecks[key];
    if (key === "screen" && state === "pending" && preflightStarted && CORE_CHECKS.every(item => preflightChecks[item] === "passed")) state = "action";
    if (row.dataset.state === state && !(key === "noise" && state === "passed")) continue;
    row.dataset.state = state;
    row.title = `${PREFLIGHT_TITLES[key]}: ${state === "passed" ? "done" : state === "failed" ? "needs attention" : state === "checking" ? "checking" : "waiting"}`;
    const text = state === "action" ? "Click Share entire screen below"
      : key === "noise" && state === "passed" ? `Quiet enough${lastNoiseDb ? ` · about ${lastNoiseDb} dB` : ""}`
      : PREFLIGHT_STEP_TEXT[key]?.[state] || "Waiting";
    row.querySelector("small").textContent = text;
  }
  renderPreflightFocus();
}

async function checkPreflightItem(key, action) {
  if (preflightChecks[key] === "passed") return;
  preflightChecks[key] = "checking";
  renderPreflightSteps();
  try { await action(); preflightChecks[key] = "passed"; renderPreflightSteps(); }
  catch (error) { failPreflight(key, error.message); }
}

async function retryPreflight(key) {
  if (preflightBusy) return;
  preflightChecks[key] = "pending";
  preflightBusy = true;
  renderPreflight();
  if (key === "camera") {
    preflightChecks.identity = "pending";
    preflightChecks.liveness = "pending";
    await attachDeviceTrack("video", camSelectEl.value);
  }
  if (key === "liveness") preflightChecks.identity = "pending";
  if (key === "microphone") {
    await attachDeviceTrack("audio", micSelectEl.value);
    micLevelDetected = false;
  }
  if (key === "screen") {
    preflightBusy = true; renderPreflight();
    await checkPreflightItem("screen", prepareScreenShare);
    preflightBusy = false;
    if (preflightChecks.screen === "failed") { renderPreflight(); return; }
  }
  preflightBusy = false;
  await runPreflight();
}

async function prepareScreenShare() {
  const capture = await acquireEntireScreenShare();
  if (preflightCancelled) { capture.stream.getTracks().forEach(track => track.stop()); throw new Error("Preparation cancelled."); }
  screenStream = capture.stream;
  isScreenSharing = true;
  bindScreenShareEnded(capture.track);
}

async function runPreflight() {
  if (preflightBusy || preflightCancelled) return;
  preflightBusy = true;
  const first = !preflightStarted;
  preflightStarted = true;
  renderPreflight();
  document.getElementById("cam-preview").hidden = false;
  preflightStatus("Checking your default camera and microphone. Say a few words while we verify your connection.");
  const devices = first ? initCameraCheck() : Promise.resolve();
  try {
    const cameraCheck = checkPreflightItem("camera", async () => {
        await devices;
        await waitForPreflight(() => hasLiveTrack("video") && cameraAnalysisPassing,
          "A clear camera feed with one person is required. Check your camera and lighting.", 25000);
      });
    const networkCheck = checkPreflightItem("network", checkReadiness);
    // Camera and connection checks run in the background; the steps that
    // need the student (speak, stay quiet, turn your head) go one at a time
    // so the instructions never compete.
    const soundChecks = checkPreflightItem("microphone", async () => {
      await devices;
      await waitForPreflight(() => hasLiveTrack("audio"), "Your default microphone is unavailable. Allow access or select a working microphone.", 5000);
      await findWorkingMicrophone();
    }).then(async () => {
      if (preflightChecks.microphone === "passed") await checkPreflightItem("noise", measureBackgroundNoise);
    });
    await Promise.all([
      cameraCheck,
      networkCheck,
      soundChecks,
      Promise.all([cameraCheck, networkCheck, soundChecks]).then(async () => {
        if (preflightChecks.camera === "passed" && preflightId) {
          await checkPreflightItem("liveness", checkLiveness);
          if (preflightChecks.liveness === "passed") await checkPreflightItem("identity", verifyPreflightIdentity);
        }
      }),
    ]);
    if (CORE_CHECKS.some(key => preflightChecks[key] !== "passed")) return;
    if (preflightChecks.screen !== "passed") {
      preflightStatus("Click Share entire screen below. Select Entire Screen in the browser picker.");
      return; // getDisplayMedia must run directly from its own user click.
    }
    if (Date.now() - identityCheckedAt > 240000) {
      preflightChecks.identity = "pending";
      await checkPreflightItem("identity", verifyPreflightIdentity);
    }
    if (Date.now() - servicesCheckedAt > 45000) {
      preflightChecks.network = "pending";
      await checkPreflightItem("network", checkReadiness);
    }
    if (Object.values(preflightChecks).some(value => value !== "passed")) return;
    if (!hasLiveTrack("video") || !cameraAnalysisPassing) { failPreflight("camera", "Camera check needs attention. Retry camera."); return; }
    if (!hasLiveTrack("audio")) { failPreflight("microphone", "Microphone disconnected. Retry microphone."); return; }
    if (!screenStream?.getVideoTracks().some(track => track.readyState === "live" && !track.muted && track.getSettings().displaySurface === "monitor")) {
      failPreflight("screen", "Your entire screen must remain shared. Share Screen Again."); return;
    }
    if (fullscreenSupported() && !document.fullscreenElement && !fullscreenStartConfirmed) {
      awaitingFullscreen = true;
      preflightStatus("All checks passed. Click Enter full screen and start to begin your interview.");
      return;
    }
    awaitingFullscreen = false;
    preflightStatus("Starting interview…");
    const response = await studentFetch(`${_HTTP_BASE}/api/resume/${currentSubmissionId}/interview`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ preflight_id: preflightId, camera: true, microphone: true, display_surface: "monitor" }),
    });
    const data = await response.json();
    if (!response.ok || !data.session_id) throw new Error(data.detail?.message || data.detail || "Could not start the interview. Retry readiness.");
    currentSessionId = data.session_id;
    sessionStorage.setItem("current_session_id", currentSessionId);
    sessionStorage.setItem("current_submission_id", currentSubmissionId);
    await photoVerifier.load(currentSessionId);
    if (!photoVerifier.isReady()) throw new Error("Identity verification could not be confirmed. Retry verification.");
    stopMicLevelTest();
    // Fullscreen must be requested from a click, never after network setup.
    // The join button already requested it while user activation was live.
    prejoinScreen.style.display = "none";
    callScreen.style.display = "block";
    liveChip.style.display = "inline-flex";
    await startInterview(currentSubmissionId);
  } catch (error) {
    const kind = preflightFailureKind(error.message);
    failPreflight(kind, error.message);
  } finally {
    preflightBusy = false;
    if (!preflightCancelled) {
      renderPreflight();
      if (Object.values(preflightChecks).includes("failed")) preflightStatus("Fix the item below to continue. Your other checks are preserved.");
    }
  }
}

async function acquireMediaStream(constraints) {
  try {
    return { stream: await navigator.mediaDevices.getUserMedia(constraints), hasVideo: true };
  } catch {
    const results = await Promise.allSettled([
      navigator.mediaDevices.getUserMedia({ video: constraints.video, audio: false }),
      navigator.mediaDevices.getUserMedia({ audio: constraints.audio, video: false }),
    ]);
    const tracks = results.flatMap(result => result.status === "fulfilled" ? result.value.getTracks() : []);
    return { stream: new MediaStream(tracks), hasVideo: tracks.some(track => track.kind === "video") };
  }
}

async function populateDeviceSelects() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    const mics = devices.filter((d) => d.kind === "audioinput");
    const fill = (select, list, kind) => {
      if (!select) return;
      const current = select.value;
      const physical = uniqueDevices(list);
      const defaultLabel = (list.find(d => d.deviceId === "default")?.label || "").replace(/^Default\s*-\s*/i, "");
      select.innerHTML = list.length
        ? (kind === "Microphone" ? `<option value="">System default${defaultLabel ? ` (${escHtml(defaultLabel)})` : " microphone"}</option>` : "") + physical.map((d, i) => `<option value="${d.deviceId}">${escHtml(d.label || (kind + " " + (i + 1)))}</option>`).join("")
        : `<option value="">No ${kind} found</option>`;
      if (current && list.some((d) => d.deviceId === current)) select.value = current;
      else if (kind === "Microphone") select.value = "";
    };
    fill(camSelectEl, cams, "Camera");
    fill(micSelectEl, mics, "Microphone");
    return { cams, mics: uniqueDevices(mics) };
  } catch (err) {
    console.warn("Could not enumerate devices:", err);
    return { cams: [], mics: [] };
  }
}

function hasLiveTrack(kind) {
  if (!userMediaStream) return false;
  const tracks = kind === "video" ? userMediaStream.getVideoTracks() : userMediaStream.getAudioTracks();
  return tracks.some((track) => track.readyState === "live" && track.enabled && !track.muted);
}

function syncCameraPreview() {
  const overlay = document.getElementById("cam-overlay");
  if (!overlay) return;
  const ready = hasLiveTrack("video") && lobbyVideoEl?.readyState >= 2 && lobbyVideoEl.videoWidth > 0;
  overlay.hidden = ready;
  overlay.style.setProperty("display", ready ? "none" : "flex", "important");
  if (!ready) overlay.textContent = hasLiveTrack("video") ? "Connecting camera…" : "Connect a camera to continue.";
}
for (const name of ["loadeddata", "playing", "emptied"]) lobbyVideoEl?.addEventListener(name, syncCameraPreview);

function updatePrejoinReadiness() {
  syncCameraPreview();
  cameraTrackLive = hasLiveTrack("video");
  microphoneTrackLive = hasLiveTrack("audio");
  if (!preflightStarted || _isCallScreenActive()) return;
  if (!cameraTrackLive && preflightChecks.camera === "passed") {
    preflightChecks.identity = "pending";
    preflightChecks.liveness = "pending";
    failPreflight("camera", "Camera disconnected. Select a camera and retry.");
  }
  if (!microphoneTrackLive && preflightChecks.microphone === "passed") failPreflight("microphone", "Microphone disconnected. Select a microphone and retry.");
  if (!isScreenSharing && preflightChecks.screen === "passed") failPreflight("screen", "Screen sharing stopped. Share Screen Again.");
}

function bindMediaTrackEnded(track) {
  if (!track) return;
  track.addEventListener("ended", () => {
    // A device switch removes the old track before stopping it. Ignore that
    // expected ended event instead of treating the replacement as a loss.
    if (!userMediaStream?.getTracks().includes(track)) return;
    const isVideo = track.kind === "video";
    if (isVideo) {
      photoVerifier.invalidate();
      cameraTrackLive = false;
      showPrejoinError(camErrorEl, "Camera disconnected. Reconnect it; this page will detect it automatically.");
      if (_isCallScreenActive()) {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "required_media_state", media: "camera", state: "lost" }));
        recordIntegrityViolation("camera_lost", "Camera disconnected during the interview.");
      }
    } else {
      microphoneTrackLive = false;
      micLevelDetected = false;
      micSignalDetected = false;
      if (micOkWrap) micOkWrap.style.display = "none";
      showPrejoinError(micErrorEl, "Microphone disconnected. Reconnect it; this page will detect it automatically.");
      if (_isCallScreenActive()) {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "required_media_state", media: "microphone", state: "lost" }));
        recordIntegrityViolation("microphone_lost", "Microphone disconnected during the interview.");
        microphoneCaptureStatus("Microphone disconnected. Reconnecting audio…");
        void recoverMicrophoneCapture(true);
      }
    }
    updatePrejoinReadiness();
  }, { once: true });

  // 'mute' fires when a track stops delivering frames without being fully
  // torn down (some OS-level camera/mic privacy switches do this instead of
  // ending the track outright). Routed through recordIntegrityViolation like
  // every other signal, so it also passes through the hard-loss clustering
  // below and isn't double-penalized alongside a same-instant 'ended'.
  track.addEventListener("mute", () => {
    if (!_isCallScreenActive() || !userMediaStream?.getTracks().includes(track)) return;
    const isVideo = track.kind === "video";
    if (!isVideo) {
      // Browsers also emit `mute` for temporary device/OS interruptions.
      // Give the device a moment to recover; if it remains silent, replace
      // the track and let the server pause/resume the answer capture.
      window.setTimeout(() => {
        if (!track.muted || interviewStopRequested || !userMediaStream?.getTracks().includes(track)) return;
        microphoneTrackLive = false;
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "required_media_state", media: "microphone", state: "lost" }));
        microphoneCaptureStatus("Microphone signal paused. Reconnecting audio…");
        void recoverMicrophoneCapture(true);
      }, 750);
      return;
    }
    recordIntegrityViolation(
      "camera_disable_attempt",
      "Camera stopped delivering video.",
    );
  });
}

function setupDeviceMonitoring() {
  if (!navigator.mediaDevices?.addEventListener) return;
  navigator.mediaDevices.addEventListener("devicechange", async () => {
    if (!preflightStarted) return;
    const { cams, mics } = await populateDeviceSelects();
    if (!hasLiveTrack("video") && cams.length) await attachDeviceTrack("video", cams[0].deviceId);
    if (!hasLiveTrack("audio") && mics.length) await attachDeviceTrack("audio", micSelectEl?.value || "");
    updatePrejoinReadiness();
  });
}

async function attachDeviceTrack(kind, deviceId) {
  const generation = ++deviceSwitchGeneration[kind];
  try {
    const constraints = kind === "video"
      ? { video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
      : { audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : { deviceId: { ideal: "default" } }), echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 } }, video: false };
    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = kind === "video" ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0];
    if (!newTrack) { newStream.getTracks().forEach(track=>track.stop()); return false; }
    if (preflightCancelled || interviewStopRequested || generation !== deviceSwitchGeneration[kind]) { newStream.getTracks().forEach(track => track.stop()); return false; }
    if (!userMediaStream) userMediaStream = new MediaStream();
    const oldTracks = kind === "video" ? userMediaStream.getVideoTracks() : userMediaStream.getAudioTracks();
    oldTracks.forEach((track) => { userMediaStream.removeTrack(track); track.stop(); });
    userMediaStream.addTrack(newTrack);
    bindMediaTrackEnded(newTrack);
    if (kind === "video") {
      cameraAnalysisPassing = false;
      if (!interviewHasStarted || proctoringActive) {
        preflightChecks.identity = "pending";
        photoVerifier.invalidate();
      }
      if (lobbyVideoEl) lobbyVideoEl.srcObject = userMediaStream;
      if (candidateVideoEl) candidateVideoEl.srcObject = userMediaStream;
      if (camErrorEl) camErrorEl.style.display = "none";
      await startCameraAnalysis();
      if (_isCallScreenActive() && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "required_media_state", media: "camera", state: "restored" }));
      }
    } else {
      if (audioContext && micProcessor) {
        micCaptureSource?.disconnect();
        micCaptureSource = audioContext.createMediaStreamSource(new MediaStream([newTrack]));
        micCaptureSource.connect(micProcessor);
        if (micCaptureDestination) micCaptureSource.connect(micCaptureDestination);
      }
      micLevelDetected = false;
      micSignalDetected = false;
      if (micErrorEl) micErrorEl.style.display = "none";
      if (preflightStarted && !_isCallScreenActive()) startMicLevelTest();
      if (_isCallScreenActive() && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "required_media_state", media: "microphone", state: "restored" }));
      }
    }
    updatePrejoinReadiness();
    return true;
  } catch (err) {
    console.warn(`Could not attach ${kind} device:`, err);
    return false;
  }
}

for (const [select, kind, errorEl] of [[micSelectEl, "audio", micErrorEl], [camSelectEl, "video", camErrorEl]]) {
  select?.addEventListener("change", async () => {
    select.disabled = true;
    preflightStatus(`Connecting selected ${kind === "audio" ? "microphone" : "camera"}…`);
    const changed = await attachDeviceTrack(kind, select.value);
    select.disabled = false;
    if (!changed) showPrejoinError(errorEl, "Could not connect this device. Your previous device remains active. Choose another device or retry.");
    else {
      preflightStatus("Device connected.");
      if (kind === "video" && !interviewHasStarted) void retryPreflight("identity");
    }
  });
}

async function initCameraCheck() {
  try {
    const result = await acquireMediaStream({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { deviceId: { ideal: "default" }, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 } },
    });
    if (preflightCancelled) { result.stream.getTracks().forEach(track => track.stop()); return; }
    userMediaStream = result.stream;
    userMediaStream.getTracks().forEach(bindMediaTrackEnded);

    if (result.hasVideo) {
      if (lobbyVideoEl) lobbyVideoEl.srcObject = userMediaStream;
      const overlay = document.getElementById("cam-overlay");
      if (overlay) overlay.style.display = "none";
      void startCameraAnalysis();
    } else {
      const overlay = document.getElementById("cam-overlay");
      if (overlay) overlay.innerHTML = '<span>No camera detected — connect a camera to continue.</span>';
      showPrejoinError(camErrorEl, "A working camera is required. Connect one and it will appear automatically.");
    }
    await populateDeviceSelects();
    updatePrejoinReadiness();
  } catch (err) {
    console.warn("Camera check warning:", err);
    showPrejoinError(camErrorEl, "Camera and microphone access is required. Allow both permissions, then reconnect or refresh once.");
    await populateDeviceSelects();
    updatePrejoinReadiness();
  }
}

function setVisionCheck(element, state, text) {
  if (!element) return;
  element.dataset.state = state;
  element.textContent = text;
}

async function loadFaceDetector() {
  if (faceLandmarker || nativeFaceDetector) return true;
  if (visionDetectorLoadPromise) return visionDetectorLoadPromise;
  lastVisionDetectorAttemptAt = Date.now();
  visionCheckUnavailable = false;
  visionDetectorLoadPromise = (async () => {
    try {
      const vision = await import(VISION_MODULE_URL);
      const fileset = await vision.FilesetResolver.forVisionTasks(VISION_WASM_URL);
      fileset.wasmLoaderPath += "?v=proctor-log-routing-20261010";
      let lastError = null;
      for (const delegate of ["GPU", "CPU"]) {
        try {
          faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
            runningMode: "VIDEO",
            numFaces: 2,
            // Favor clear face evidence over low-confidence patterns in
            // clothing/furniture; uncertain body evidence remains review-only.
            minFaceDetectionConfidence: 0.65,
            minFacePresenceConfidence: 0.65,
            minTrackingConfidence: 0.6,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
          });
          visionCheckUnavailable = false;
          return true;
        } catch (error) {
          lastError = error;
          console.warn(`MediaPipe ${delegate} face check failed.`, error);
        }
      }
      if (lastError) throw lastError;
    } catch (error) {
      console.warn("MediaPipe face check unavailable; trying browser detector.", error);
    }
    try {
      if ("FaceDetector" in window) {
        nativeFaceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 });
        visionCheckUnavailable = false;
        return true;
      }
    } catch (error) {
      console.warn("Browser face detector unavailable.", error);
    }
    visionCheckUnavailable = true;
    return false;
  })().finally(() => { visionDetectorLoadPromise = null; });
  return visionDetectorLoadPromise;
}

// Backstop for the face-only check above: a face detector needs eyes/nose/
// mouth visible and cannot see a person whose back is turned to the camera
// (e.g. someone crouched behind the candidate). This runs a general "person"
// object detector so a body is still counted even with no face visible.
async function createWorkerObjectDetector() {
  if (workerObjectFailed || !window.Worker || !window.createImageBitmap || !window.OffscreenCanvas) return null;
  const worker = new Worker("/proctor-object-worker.js?v=cpu-int8-20261010");
  const pending = new Map();
  let sequence = 0;
  const fail = error => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  };
  worker.onerror = () => {
    workerObjectFailed = true; objectDetector = null; lastPersonDetectionAt = 0; cameraAnalysisPassing = false;
    worker.terminate(); fail(new Error("Object inference worker failed."));
  };
  worker.onmessage = ({data}) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id); clearTimeout(request.timer);
    if (data.error) request.reject(new Error(data.error)); else request.resolve(data.result);
  };
  const request = (type, extra = {}, transfer = []) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Object inference timed out.")); }, type === "init" ? 60000 : 15000);
    pending.set(id, {resolve, reject, timer});
    try { worker.postMessage({id, type, ...extra}, transfer); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
  try { await request("init"); }
  catch (error) { worker.terminate(); fail(error); throw error; }
  return {
    async detectForVideo(source, timestamp) {
      const frame = await createImageBitmap(source);
      try { return await request("detect", {frame, timestamp}, [frame]); }
      catch (error) {
        worker.terminate(); fail(error); workerObjectFailed = true;
        objectDetector = null; lastPersonDetectionAt = 0; cameraAnalysisPassing = false;
        throw error; // Next analysis tick loads the fast fallback, never stale passing data.
      }
    },
    close() { worker.terminate(); fail(new Error("Object detector closed.")); },
  };
}

async function loadPersonDetector() {
  if (objectDetector || objectDetectorUnavailable) return !!objectDetector;
  if (personDetectorLoadPromise) return personDetectorLoadPromise;
  personDetectorLoadPromise = (async () => {
    try {
      try {
        objectDetector = await createWorkerObjectDetector();
        if (objectDetector) return true;
      } catch (error) { workerObjectFailed = true; console.warn("Worker object check unavailable; using the fast detector.", error); }
      const vision = await import(VISION_MODULE_URL);
      const fileset = await vision.FilesetResolver.forVisionTasks(VISION_WASM_URL);
      fileset.wasmLoaderPath += "?v=proctor-log-routing-20261010";
      let lastError = null;
      for (const delegate of ["GPU", "CPU"]) {
        try {
          objectDetector = await vision.ObjectDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: OBJECT_MODEL_URL, delegate },
            runningMode: "VIDEO",
            maxResults: 20,
            // Keep the body backstop sensitive to a smaller or partly turned
            // away person; the face detector remains authoritative for entry.
            // "cell phone" is a native COCO class on this same model, so a
            // phone held up to camera is caught with no second model to load.
            // The pre-join image is a wide webcam frame. A second person in
            // the background occupies far fewer pixels than the foreground
            // candidate, so the old 0.20 cutoff could discard exactly the
            // case this detector exists to catch. Require temporal stability
            // below instead of using a high single-frame confidence cutoff.
            // Lowered further (was 0.12) after reports of a clearly-visible
            // background person and a held-up phone both going undetected —
            // The fast fallback keeps older browsers responsive; worker-capable browsers use Lite2.
            // has weak recall on small/partly-occluded objects; recall matters
            // more than precision for a proctoring backstop that already
            // requires 1.5-3s of temporal stability before it warns.
            scoreThreshold: 0.08,
            categoryAllowlist: ["person", "cell phone"],
          });
          return true;
        } catch (error) {
          lastError = error;
          console.warn(`MediaPipe ${delegate} person check failed.`, error);
        }
      }
      if (lastError) throw lastError;
    } catch (error) {
      console.warn("MediaPipe person (object) detector unavailable; falling back to face-only count.", error);
      objectDetectorUnavailable = true;
    }
    return false;
  })().finally(() => { personDetectorLoadPromise = null; });
  return personDetectorLoadPromise;
}

function nextObjectDetectorTimestamp() {
  const ts = Math.max(performance.now(), objectDetectorTimestamp + 1);
  objectDetectorTimestamp = ts;
  return ts;
}

// A second/background person is often just too small in a wide prejoin or
// call frame to survive MediaPipe's internal downscale to the object
// detector's fixed 320x320 input — the model never gets enough pixels on
// them regardless of how low scoreThreshold is set. Cropping to one half of
// the frame and drawing it at full 320x320 gives that same person roughly
// double the effective resolution, which is what actually recovers them.
// Alternates halves each tick (rather than scanning both every tick) to
// keep the extra inference cost to one pass instead of two.
async function cropDetectPersons(video, region) {
  const canvas = cropDetectPersons.canvas || (cropDetectPersons.canvas = document.createElement("canvas"));
  const vw = video.videoWidth || video.width;
  const vh = video.videoHeight || video.height;
  if (!vw || !vh) return null;
  const outSize = 448;
  canvas.width = outSize;
  canvas.height = outSize;
  const sx = region.x * vw;
  const sy = region.y * vh;
  const sw = region.w * vw;
  const sh = region.h * vh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outSize, outSize);
  const detections = (await objectDetector.detectForVideo(canvas, nextObjectDetectorTimestamp())).detections || [];
  return { detections, sx, sy, sw, sh, outSize };
}

// Maps a bounding box returned for a cropped/scaled canvas back into the
// original video frame's pixel space so it can be compared (via IoU) against
// full-frame detections.
function translateCropBox(box, crop) {
  const scaleX = crop.sw / crop.outSize;
  const scaleY = crop.sh / crop.outSize;
  return {
    originX: crop.sx + box.originX * scaleX,
    originY: crop.sy + box.originY * scaleY,
    width: box.width * scaleX,
    height: box.height * scaleY,
  };
}

function boxIoU(a, b) {
  const ax2 = a.originX + a.width;
  const ay2 = a.originY + a.height;
  const bx2 = b.originX + b.width;
  const by2 = b.originY + b.height;
  const ix1 = Math.max(a.originX, b.originX);
  const iy1 = Math.max(a.originY, b.originY);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

// A crop can detect only the candidate's shoulder/torso. IoU is small
// for a contained partial box, so compare overlap with the smaller box too.
function samePersonBox(a, b) {
  if (boxIoU(a, b) > 0.3) return true;
  const overlapWidth = Math.max(0, Math.min(a.originX+a.width,b.originX+b.width)-Math.max(a.originX,b.originX));
  const overlapHeight = Math.max(0, Math.min(a.originY+a.height,b.originY+b.height)-Math.max(a.originY,b.originY));
  const smallerArea = Math.min(a.width*a.height,b.width*b.height);
  return smallerArea > 0 && overlapWidth*overlapHeight/smallerArea >= 0.7;
}

let prejoinMultipleEvidence = null;
function multiplePeopleCorroborated(now = Date.now()) {
  return !cameraQualityIssue && faceCountDetected > 1 && corroboratedPersonCount > 1 && now-lastPersonDetectionAt < 2500;
}
function distinctFaceLandmarks(faces) {
  const accepted = [], boxes = [];
  for (const points of faces) {
    // Test/native fallback may not expose geometry. Real MediaPipe faces do.
    if (!points) { accepted.push(points); continue; }
    if (points.length < 264 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue;
    const left=points[33], right=points[263], nose=points[1], mouth=points[13], chin=points[152];
    const eyeY=(left.y+right.y)/2;
    if (Math.abs(left.x-right.x) < .012 || nose.y < eyeY-.025 || mouth.y < nose.y || chin.y < mouth.y) continue;
    const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
    const box={originX:Math.min(...xs),originY:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
    if (box.width < .025 || box.height < .035 || boxes.some(known=>boxIoU(box,known)>=.5)) continue;
    boxes.push(box); accepted.push(points);
  }
  return accepted;
}

let faceQualityRegion = null;
function faceRegion(landmarks) {
  if (!landmarks?.length) return null;
  const xs=landmarks.map(p=>p.x),ys=landmarks.map(p=>p.y);
  const x=Math.max(0,Math.min(...xs)),y=Math.max(0,Math.min(...ys));
  const w=Math.min(1,Math.max(...xs))-x,h=Math.min(1,Math.max(...ys))-y;
  return w>.05&&h>.05 ? {x,y,w,h} : null;
}
function frameLighting(video) {
  const canvas = frameLighting.canvas || (frameLighting.canvas = document.createElement("canvas"));
  canvas.width = 160;
  canvas.height = 90;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const r=faceQualityRegion || {x:.25,y:.15,w:.5,h:.7};
  context.drawImage(video, video.videoWidth*r.x, video.videoHeight*r.y, video.videoWidth*r.w, video.videoHeight*r.h, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let total = 0;
  let samples = 0;
  for (let i = 0; i < pixels.length; i += 16) {
    total += pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
    samples += 1;
  }
  return samples ? total / samples : 0;
}

function frameSharpness(video) {
  const canvas = frameSharpness.canvas || (frameSharpness.canvas = document.createElement("canvas"));
  canvas.width = canvas.height = 160;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const r=faceQualityRegion || {x:.25,y:.15,w:.5,h:.7};
  context.drawImage(video, video.videoWidth*r.x, video.videoHeight*r.y, video.videoWidth*r.w, video.videoHeight*r.h, 0, 0, 160, 160);
  const pixels = context.getImageData(0, 0, 160, 160).data;
  const gray = index => pixels[index*4]*.2126 + pixels[index*4+1]*.7152 + pixels[index*4+2]*.0722;
  let sum=0, squares=0, count=0;
  for(let y=1;y<159;y+=2) for(let x=1;x<159;x+=2){const i=y*160+x;const value=4*gray(i)-gray(i-1)-gray(i+1)-gray(i-160)-gray(i+160);sum+=value;squares+=value*value;count++;}
  return count?squares/count-(sum/count)**2:0;
}
let cameraQualityIssue = null;
let lastCameraQualityNoticeAt = null;
let pendingCameraQualityIssue = null;
let pendingCameraQualitySince = 0;
function cameraQualityTransition(issue, now = Date.now()) {
  if (pendingCameraQualityIssue !== issue) {
    pendingCameraQualityIssue = issue;
    pendingCameraQualitySince = now;
  }
  if (now - pendingCameraQualitySince < (issue ? 4000 : 3000)) return null;
  if (issue) {
    cameraQualityIssue = issue;
    if (lastCameraQualityNoticeAt !== null && now - lastCameraQualityNoticeAt < 60000) return null;
    lastCameraQualityNoticeAt = now;
    return issue;
  }
  if (!cameraQualityIssue) return null;
  cameraQualityIssue = null;
  return "camera_quality_restored";
}
function assessCameraLighting(luminance) {
  const passing = luminance >= 32 && luminance <= 242;
  return {
    passing,
    state: passing ? "pass" : "warn",
    message: passing
      ? "✓ Lighting is clear"
      : luminance < 32
        ? "Face looks dim; add light in front if available. You can continue."
        : "Reduce direct light behind you if possible. You can continue.",
  };
}

function cameraEntryChecksPass({ sharpness, exactlyOneFace, exactlyOnePerson, framingPassing,
  visionCheckUnavailable, objectDetectorUnavailable, fullPersonCheckReady, phoneDetected }) {
  // Lighting remains advisory: it should never override a clear face and
  // valid person/framing checks.
  return sharpness >= 12 && exactlyOneFace && exactlyOnePerson && framingPassing &&
    !visionCheckUnavailable && !objectDetectorUnavailable && fullPersonCheckReady && !phoneDetected;
}

function landmarkGazeOffCamera(landmarks) {
  if (!landmarks || landmarks.length < 478) return false;
  const ratio = (iris, a, b) => {
    const lo = Math.min(a.x, b.x);
    const width = Math.max(0.0001, Math.abs(a.x - b.x));
    return (iris.x - lo) / width;
  };
  const left = ratio(landmarks[468], landmarks[33], landmarks[133]);
  const right = ratio(landmarks[473], landmarks[362], landmarks[263]);
  const cheekLeft = landmarks[234];
  const cheekRight = landmarks[454];
  const nose = landmarks[1];
  const faceRatio = (nose.x - Math.min(cheekLeft.x, cheekRight.x)) /
    Math.max(0.0001, Math.abs(cheekRight.x - cheekLeft.x));
  return left < 0.16 || left > 0.84 || right < 0.16 || right > 0.84 || faceRatio < 0.32 || faceRatio > 0.68;
}

// A phone stays "visible" between detector runs: the window follows how
// often the object detector actually runs on this device (up to ~2 s).
let phoneFreshMs = 2500;

// A phone moves in a hand between detector runs; treat a nearby box as the
// same phone rather than demanding a tight overlap.
function samePhoneBox(a, b) {
  if (boxIoU(a, b) >= .1) return true;
  const dx = (a.originX + a.width / 2) - (b.originX + b.width / 2);
  const dy = (a.originY + a.height / 2) - (b.originY + b.height / 2);
  return Math.hypot(dx, dy) <= 1.5 * Math.max(b.width, b.height, a.width, a.height);
}

function phoneSighting(detections, corroborating) {
  const phoneScore = d => Number((d.categories || []).find(c => c.categoryName === "cell phone")?.score);
  const views = [
    ...detections.filter(d => phoneScore(d) >= PHONE_EVIDENCE_MIN_SCORE && d.boundingBox?.width >= 8 && d.boundingBox?.height >= 8)
      .map(d => ({box: d.boundingBox, score: phoneScore(d), full: true})),
    ...corroborating.filter(box => Number(box.confidence) >= PHONE_EVIDENCE_MIN_SCORE)
      .map(box => ({box, score: Number(box.confidence), full: false})),
  ].sort((a, b) => b.score - a.score);
  if (!views.length) return null;
  const best = views[0];
  // A second independent view of the same phone (full frame and a crop, or
  // two crops) is as good as a confident single view.
  const corroborated = views.some(view => view !== best && boxIoU(view.box, best.box) >= .2);
  return {...best, requiredCount: corroborated || best.score >= PHONE_CONFIDENT_SCORE ? 2 : 3};
}

function updatePhoneEvidence(detections, corroborating, now) {
  const sighting = phoneSighting(detections, corroborating);
  if (!sighting) {
    if (phoneEvidence && now - phoneEvidence.last > phoneFreshMs) phoneEvidence = null;
    return false;
  }
  const {box, score: confidence, requiredCount} = sighting;
  if (!phoneEvidence || now - phoneEvidence.last > Math.max(8000, phoneFreshMs * 2) || !samePhoneBox(phoneEvidence.box, box)) {
    phoneEvidence = {since:now,last:now,count:1,box,confidence,requiredCount};
  } else {
    if (now <= phoneEvidence.last) return false;
    phoneEvidence.last=now;phoneEvidence.count++;phoneEvidence.box=box;
    // The weakest requirement seen so far applies once a confident view arrives.
    phoneEvidence.requiredCount=Math.min(phoneEvidence.requiredCount,requiredCount);
    phoneEvidence.confidence=Math.max(phoneEvidence.confidence,confidence);
  }
  return phoneEvidence.count >= (phoneEvidence.requiredCount || 2) && now - phoneEvidence.since >= PHONE_EVIDENCE_MIN_MS;
}

function warnVisionSignal(type, message, details) {
  if (!proctoringActive || integrityEndRequested || sessionCompletedCleanly || lastVisionWarningAt[type] !== undefined) return;
  lastVisionWarningAt[type] = Date.now();
  if (["poor_lighting", "camera_blurry", "multiple_people_unconfirmed"].includes(type)) {
    if (Date.now() - (cameraReminderTimes[type] || 0) < 60000) return;
    cameraReminderTimes[type] = Date.now();
    _sendIntegrityEvent(type, "info", details);
    showIntegrityNotice(type === "multiple_people_unconfirmed" ? message : message + " Adjust your camera. This does not count as misconduct.", true);
    return;
  }
  recordIntegrityViolation(type, message, details);
}

function clearVisionSignal(type, recovered, now) {
  if (!recovered || lastVisionWarningAt[type] === undefined) {
    delete visionRecoverySince[type];
    return false;
  }
  const previous = visionRecoverySince[type];
  const since = previous && now - previous.last <= 3000 ? previous.since : now;
  visionRecoverySince[type] = { since, last: now };
  if (now - since < 2000) return false;
  delete lastVisionWarningAt[type];
  delete visionRecoverySince[type];
  return true;
}

// The pre-join lobby is display:none for the whole live interview, and a
// <video> in a non-rendered subtree stops handing new MediaStream frames to
// drawImage/detectForVideo -- every proctoring signal (face count, gaze,
// lighting, sharpness, extra people, phone) was being computed from a frozen
// lobby frame as soon as the call screen opened. The call screen's own
// element carries the same userMediaStream and IS rendered, so analysis
// follows the visible element, exactly as the photo verifier already does.
function proctorVideoSource() {
  const live = _isCallScreenActive() ? candidateVideoEl : lobbyVideoEl;
  if (live && live.readyState >= 2 && live.videoWidth > 0) return live;
  const fallback = live === candidateVideoEl ? lobbyVideoEl : candidateVideoEl;
  return fallback && fallback.readyState >= 2 && fallback.videoWidth > 0 ? fallback : null;
}

async function analyzeCameraFrame() {
  const sourceVideo = proctorVideoSource();
  if (!sourceVideo || !cameraTrackLive) return;
  if (!faceLandmarker && !nativeFaceDetector && Date.now() - lastVisionDetectorAttemptAt >= VISION_RETRY_INTERVAL_MS) {
    setVisionCheck(faceCheckEl, "warn", "Retrying person check…");
    void loadFaceDetector();
  }
  if (!objectDetector && !objectDetectorUnavailable) void loadPersonDetector();
  let landmarks = null;
  if (faceLandmarker) {
    const result = faceLandmarker.detectForVideo(sourceVideo, performance.now());
    const faces = distinctFaceLandmarks(result.faceLandmarks || []);
    faceCountDetected = faces.length;
    landmarks = faces[0] || null;
  } else if (nativeFaceDetector) {
    const faces = await nativeFaceDetector.detect(sourceVideo);
    const distinct = [];
    for (const face of faces) {
      const r = face.boundingBox;
      const box = r && {originX:r.x, originY:r.y, width:r.width, height:r.height};
      if (!box || !distinct.some(known => known && boxIoU(box, known) >= .5)) distinct.push(box);
    }
    faceCountDetected = distinct.length;
  } else {
    faceCountDetected = 0;
  }

  latestFaceLandmarks = faceCountDetected === 1 ? landmarks : null;
  latestFaceLandmarksAt = Date.now();
  faceQualityRegion = faceRegion(landmarks);
  const luminance = frameLighting(sourceVideo);
  const lighting = assessCameraLighting(luminance);
  lightingPassing = lighting.passing;
  setVisionCheck(lightingCheckEl, lighting.state, lighting.message);

  const sharpness = frameSharpness(sourceVideo);
  const qualityIssue = sharpness < 12 ? "camera_blurry" : !lightingPassing ? "poor_lighting" : null;
  if (qualityIssue) {
    if (qualityIssue === "camera_blurry") cameraAnalysisPassing = false;
    absentFaceSince = multipleFaceSince = gazeOffCameraSince = null;
    lastMultiplePeopleDetectedAt = 0;
    if (!proctoringActive) { phoneVisibleSince = null; lastPhoneDetectedAt = 0; }
    const guidance = qualityIssue === "poor_lighting" ? lighting.message : "Your camera image looks blurry. Clean the lens, focus the camera and keep your face clearly visible.";
    setVisionCheck(lightingCheckEl, "warn", guidance);
    updatePrejoinReadiness();
    if (proctoringActive && cameraQualityTransition(qualityIssue) === qualityIssue) {
      _sendIntegrityEvent(qualityIssue, "info", { luminance: Math.round(luminance), sharpness: Math.round(sharpness), message: guidance });
      showIntegrityNotice(guidance + " This is a camera quality reminder, not a misconduct warning.", true);
    }
    if (!proctoringActive && qualityIssue === "camera_blurry") return;
  }
  if (!qualityIssue && cameraQualityTransition(null) === "camera_quality_restored") {
    if (proctoringActive) _sendIntegrityEvent("camera_quality_restored", "info", {});
    absentFaceSince = multipleFaceSince = phoneVisibleSince = gazeOffCameraSince = null;
    delete lastVisionWarningAt.candidate_not_visible;
    delete lastVisionWarningAt.gaze_off_camera;
  }

  // Face detection alone misses a person whose back/side is turned to the
  // camera (no eyes/nose/mouth visible). The person/object detector counts
  // bodies instead of faces, so it still catches that case; take whichever
  // signal saw more people this frame.
  let now = Date.now();
  const objectCooldown=Math.min(2000, Math.max(PERSON_DETECTION_INTERVAL_MS, (analyzeCameraFrame.lastInferenceMs || 0)*2));
  if (objectDetector && now - lastPersonDetectionAt >= objectCooldown) {
    const inferenceStarted=performance.now();
    // Every crop uses the same captured frame. Asynchronous inference must not
    // count a moving person twice by comparing snapshots from different times.
    const objectFrame = analyzeCameraFrame.objectFrame || (analyzeCameraFrame.objectFrame = document.createElement("canvas"));
    objectFrame.width = sourceVideo.videoWidth; objectFrame.height = sourceVideo.videoHeight;
    objectFrame.getContext("2d").drawImage(sourceVideo, 0, 0);
    const detections = (await objectDetector.detectForVideo(objectFrame, nextObjectDetectorTimestamp())).detections || [];
    // categoryAllowlist now includes "cell phone" alongside "person" (same
    // model, no extra load), so detections must be split by category rather
    // than counted as a flat length, or a phone in frame would inflate the
    // person count.
    const personDetections = [];
    for (const detection of detections) {
      if ((detection.categories || [])[0]?.categoryName === "person" &&
          !personDetections.some(known => samePersonBox(detection.boundingBox, known.boundingBox))) personDetections.push(detection);
    }
    const phoneDetections = detections.filter((d) => (d.categories || [])[0]?.categoryName === "cell phone");
    const scores = personDetections.flatMap((detection) =>
      (detection.categories || []).map((category) => Number(category.score)).filter(Number.isFinite)
    );
    personDetectionConfidence = scores.length ? Math.max(...scores) : null;
    const corroboratingPhones = [];

    // Supplementary zoomed-in pass on one half of the frame (alternating
    // sides each tick) — see cropDetectPersons above for why this is what
    // actually catches a smaller/farther-back second person that full-frame
    // detection structurally cannot see. Any box found here that does not
    // overlap an already-counted full-frame person is a genuinely distinct
    // extra person (or an extra phone) rather than a duplicate.
    personCropToggle = (personCropToggle + 1) % 2;
    const region = personCropToggle === 0
      ? { x: 0, y: 0, w: 0.55, h: 1 }
      : { x: 0.45, y: 0, w: 0.55, h: 1 };
    const fullPhoneVisible=phoneDetections.some(d=>Number(d.categories?.[0]?.score)>=PHONE_CONFIDENT_SCORE);
    const crop = fullPhoneVisible && faceCountDetected <= 1 ? null : await cropDetectPersons(objectFrame, region);
    if (crop) {
      for (const det of crop.detections) {
        const category = (det.categories || [])[0]?.categoryName;
        if (category !== "person" && category !== "cell phone") continue;
        const box = translateCropBox(det.boundingBox, crop);
        if (category === "cell phone") {
          if (Number(det.categories?.[0]?.score) >= PHONE_EVIDENCE_MIN_SCORE) corroboratingPhones.push({...box, confidence: Number(det.categories[0].score)});
          continue;
        }
        const overlapsKnown = personDetections.some(known => samePersonBox(box, known.boundingBox));
        if (overlapsKnown) continue;
        personDetections.push({ boundingBox: box, categories: det.categories });
      }
    }
    const phoneCrop = await cropDetectPersons(objectFrame, { x: .2, y: .2, w: .6, h: .8 });
    for (const det of phoneCrop?.detections || []) {
      if (det.categories?.[0]?.categoryName === "cell phone" && Number(det.categories[0].score) >= PHONE_EVIDENCE_MIN_SCORE) corroboratingPhones.push({...translateCropBox(det.boundingBox, phoneCrop), confidence: Number(det.categories[0].score)});
    }
    analyzeCameraFrame.lastInferenceMs=performance.now()-inferenceStarted;
    now = Date.now();
    lastPersonDetectionAt = now;
    phoneDetected = updatePhoneEvidence(phoneDetections, corroboratingPhones, now);
    if (phoneDetected) lastPhoneDetectedAt = now;
    personBoxCountDetected = personDetections.length;
    corroboratedPersonCount = personDetections.filter(d => Number(d.categories?.[0]?.score) >= .7).length;
    if (personBoxCountDetected > 1) lastMultiplePeopleDetectedAt = now;
  }
  // Only a corroborated sequence can indicate a phone; an isolated detection
  // or a stale worker result never accumulates into a misconduct warning.
  phoneFreshMs = Math.max(2500, objectCooldown * 1.6);
  phoneDetected = !!phoneEvidence && phoneEvidence.count >= (phoneEvidence.requiredCount || 2) && now - phoneEvidence.since >= PHONE_EVIDENCE_MIN_MS && now - phoneEvidence.last < phoneFreshMs;
  // Do not flash back to "one person" when the smaller background detection
  // drops for a frame. Keep the multi-person result briefly so the candidate
  // must present a consistently clear single-person frame before proceeding.
  const recentlyDetectedMultiplePeople =
    lastMultiplePeopleDetectedAt > 0 && now - lastMultiplePeopleDetectedAt < MULTIPLE_PERSON_HOLD_MS;
  const peopleCountDetected = Math.max(
    faceCountDetected,
    personBoxCountDetected,
    recentlyDetectedMultiplePeople ? 2 : 0,
  );

  const exactlyOneFace = faceCountDetected === 1;
  const exactlyOnePerson = faceCountDetected === 1;
  const fullPersonCheckReady = !!objectDetector && lastPersonDetectionAt > 0;
  framingPassing = faceCountDetected === 1 && (!landmarks || !landmarkGazeOffCamera(landmarks));
  let personCheckState = "fail";
  let personCheckText = "Full person check unavailable — refresh";
  if (visionCheckUnavailable) {
    personCheckState = "warn";
    personCheckText = "Face check unavailable — retrying";
  } else if (!objectDetectorUnavailable && !fullPersonCheckReady) {
    personCheckState = "warn";
    personCheckText = "Scanning full frame for people…";
  } else if (peopleCountDetected === 0) {
    personCheckText = "No person detected";
  } else if (faceCountDetected > 1) {
    const prior = prejoinMultipleEvidence;
    prejoinMultipleEvidence = prior && now-prior.last < 1800
      ? {since:prior.since, last:now, count:prior.count+1} : {since:now,last:now,count:1};
    const confirmed = multiplePeopleCorroborated(now) && prejoinMultipleEvidence.count >= 3 && now-prejoinMultipleEvidence.since >= 2000;
    personCheckState = confirmed ? "fail" : "warn";
    personCheckText = confirmed ? "Multiple people detected — keep only yourself in frame" : "Person check uncertain — adjust your camera and keep your face visible";
  } else if (phoneDetected) {
    // Live-call phone tracking (phoneVisibleSince/warnVisionSignal, further
    // below) only runs once _isCallScreenActive() is true -- before that,
    // during this pre-join check, a phone held up to the camera was detected
    // (phoneDetected is already debounced by PHONE_DETECTION_HOLD_MS above)
    // but nothing surfaced it or blocked Continue. This is the pre-join
    // equivalent: block joining and say why, the same as the person checks
    // around it.
    personCheckText = "Phone detected in frame — put it away before continuing";
  } else if (faceCountDetected === 0) {
    personCheckText = "Face not recognizable — face the camera";
  } else {
    personCheckState = "pass";
    personCheckText = "✓ One person detected";
  }
  if (faceCountDetected <= 1) prejoinMultipleEvidence = null;
  setVisionCheck(
    faceCheckEl,
    personCheckState,
    personCheckText,
  );
  setVisionCheck(
    framingCheckEl,
    framingPassing ? "pass" : "warn",
    framingPassing ? "✓ Looking forward" : "Center your face",
  );

  // A face-only result is insufficient for proctoring: it cannot rule out a
  // turned-away/background person. Continue stays disabled until both models
  // have produced a result for the live frame.
  cameraAnalysisPassing = cameraEntryChecksPass({
    sharpness, exactlyOneFace, exactlyOnePerson, framingPassing,
    visionCheckUnavailable, objectDetectorUnavailable, fullPersonCheckReady, phoneDetected,
  });
  updatePrejoinReadiness();

  if (!proctoringActive || now - lastVisionObservationAt > 8000) {
    absentFaceSince = multipleFaceSince = phoneVisibleSince = poorLightingSince = gazeOffCameraSince = null;
    visionRecoverySince = {};
  }
  lastVisionObservationAt = now;
  if (_isCallScreenActive() && proctoringActive) {
    // A visible torso is not enough: the candidate's face must be in frame.
    // The body detector remains useful for distinguishing "person present"
    // from "nobody present" and for the multiple-person signal, but it must
    // not suppress the missing-face flag.
    const faceMissing = !visionCheckUnavailable && faceCountDetected === 0;
    clearVisionSignal("candidate_not_visible", !visionCheckUnavailable && faceCountDetected > 0, now);
    absentFaceSince = _trackSince(absentFaceSince, faceMissing, now);
    if (absentFaceSince !== null) {
      const ms = now - absentFaceSince;
      if (ms >= CANDIDATE_ABSENT_THRESHOLD_MS) {
        warnVisionSignal("candidate_not_visible", `No face detected for ${Math.round(ms / 1000)}s. Stay in frame.`, { duration_ms: ms });
      }
    }

    if (clearVisionSignal("multiple_people_visible", !visionCheckUnavailable && faceCountDetected === 1, now)) {
      _sendIntegrityEvent("multiple_people_cleared", "info", { people_count: peopleCountDetected });
    }
    // Body/crop detections can mistake furniture or clothing for a person.
    // Preserve them for review; misconduct requires sustained face evidence
    // corroborated by two confident, fresh body detections.
    if (faceCountDetected > 1 && !multiplePeopleCorroborated(now)) {
      warnVisionSignal("multiple_people_unconfirmed", "The camera check is uncertain. Keep your face clearly visible. This is not a misconduct warning.", { face_count: faceCountDetected, body_count: personBoxCountDetected });
    } else clearVisionSignal("multiple_people_unconfirmed", faceCountDetected === 1, now);
    multipleFaceSince = _trackSince(multipleFaceSince, !visionCheckUnavailable && multiplePeopleCorroborated(now), now);
    if (multipleFaceSince !== null) {
      const ms = now - multipleFaceSince;
      if (ms >= MULTIPLE_PEOPLE_THRESHOLD_MS) {
        warnVisionSignal(
          "multiple_people_visible",
          `More than one person detected for ${Math.round(ms / 1000)}s. Only the candidate may be visible.`,
          { confidence: personDetectionConfidence, duration_ms: ms, people_count: faceCountDetected, face_count: faceCountDetected, confirmed_by: "face_sequence", body_count: corroboratedPersonCount },
        );
      }
    }

    clearVisionSignal("phone_usage_detected", !objectDetectorUnavailable && fullPersonCheckReady && !phoneDetected, now);
    phoneVisibleSince = _trackSince(phoneVisibleSince, !objectDetectorUnavailable && fullPersonCheckReady && phoneDetected, now);
    if (phoneVisibleSince !== null) {
      const ms = now - phoneVisibleSince;
      if (ms >= PHONE_VISIBLE_THRESHOLD_MS) {
        warnVisionSignal("phone_usage_detected", `A phone has been visible on camera for ${Math.round(ms / 1000)}s.`, { duration_ms: now - phoneEvidence.since, confirmed_by: "phone_sequence", observation_count: phoneEvidence.count, confidence: phoneEvidence.confidence });
      }
    }

    const gazeAway = !!(landmarks && landmarkGazeOffCamera(landmarks));
    clearVisionSignal("gaze_off_camera", !!landmarks && !gazeAway, now);
    gazeOffCameraSince = _trackSince(gazeOffCameraSince, gazeAway, now);
    if (gazeOffCameraSince !== null) {
      const ms = now - gazeOffCameraSince;
      if (ms >= GAZE_AWAY_THRESHOLD_MS) {
        warnVisionSignal("gaze_off_camera", `Gaze away from camera for ${Math.round(ms / 1000)}s. Keep attention on screen.`, { duration_ms: ms });
      }
    }
  }
}

// Shared wall-clock tracker for every camera malpractice signal: starts the
// timestamp the first tick a condition becomes true, clears it the instant
// the condition is no longer true. Using elapsed real time (not a tick count)
// keeps every threshold accurate to the second regardless of how long an
// analysis pass takes — a tick count silently drifts under this kind of
// per-frame ML inference cost.
function _trackSince(since, conditionActive, now) {
  if (!conditionActive) return null;
  return since === null ? now : since;
}

async function startCameraAnalysis() {
  if (cameraAnalysisStarted) return;
  cameraAnalysisStarted = true;
  setVisionCheck(faceCheckEl, "warn", "Loading person check…");
  // Both models are mandatory for a passing pre-join result. The face model
  // verifies the candidate is visible; the body model rules out a second
  // person whose smaller or turned-away face is not recognizable.
  await Promise.allSettled([loadFaceDetector(), loadPersonDetector()]);
  const tick = async () => {
    if (preflightCancelled || sessionCompletedCleanly || (interviewHasStarted && !proctoringActive)) { cameraAnalysisStarted = false; return; }
    try { await analyzeCameraFrame(); } catch (error) { console.warn("Camera analysis frame failed.", error); }
    setTimeout(tick, 800);
  };
  tick();
}

function startMicLevelTest() {
  if (!userMediaStream) return;
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    stopMicLevelTest();
    micSignalDetected = false;
    micLevelDetected = false;
    micTestContext = new AudioContextCtor();
    void micTestContext.resume();
    const source = micTestContext.createMediaStreamSource(userMediaStream);
    micAnalyser = micTestContext.createAnalyser();
    micAnalyser.fftSize = 64;
    source.connect(micAnalyser);

    const meter = document.getElementById("mic-activity");
    const wave = meter?.querySelector(".pf-mic-wave");
    if (wave && !wave.children.length) {
      for (let i = 0; i < 24; i++) {
        const bar = document.createElement("span"); bar.className = "pf-mic-bar"; wave.append(bar);
      }
    }
    if (meter) meter.hidden = false;
    const bars = wave?.querySelectorAll(".pf-mic-bar") || [];
    const label = document.getElementById("mic-activity-label");
    const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);
    const waveform = new Uint8Array(micAnalyser.fftSize);
    let level = 0;

    function updateBars() {
      if (!micAnalyser) return;
      micAnalyser.getByteFrequencyData(dataArray);
      micAnalyser.getByteTimeDomainData(waveform);
      const rms = Math.sqrt(waveform.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / waveform.length);
      const target = Math.max(0, Math.min(1, (rms - .004) / .12));
      level += (target - level) * (target > level ? .4 : .14);
      document.getElementById("pf-focus")?.style.setProperty("--mic-level", level.toFixed(3));
      const signal = level > .04 ? "active" : "quiet";
      if (meter && meter.dataset.signal !== signal) {
        meter.dataset.signal = signal;
        if (label) label.textContent = signal === "active" ? "Voice detected" : "Listening for your voice";
      }

      let sum = dataArray.reduce((total,value) => total+value,0);
      bars.forEach((bar, idx) => {
        const shape = Math.sin(Math.PI * (idx + 1) / (bars.length + 1));
        const band = .65 + (dataArray[idx % dataArray.length] || 0) / 255;
        bar.style.height = `${(4 + level * (8 + 20 * shape) * Math.min(1, band)).toFixed(1)}px`;
      });

      if (sum > 60 && !micSignalDetected) {
        micLevelDetected = true;
        micSignalDetected = true;
        if (micStatusText) micStatusText.textContent = "Microphone audio detected.";
        if (micErrorEl) micErrorEl.style.display = "none";
        updatePrejoinReadiness();
      }

      micAnimId = requestAnimationFrame(updateBars);
    }
    updateBars();
  } catch (err) {
    console.warn("Mic test error:", err);
    if (micErrorEl) micErrorEl.style.display = "block";
  }
}

function stopMicLevelTest() {
  if (micAnimId) {
    cancelAnimationFrame(micAnimId);
    micAnimId = null;
  }
  micAnalyser = null;
  const meter = document.getElementById("mic-activity");
  if (meter) {
    meter.dataset.signal = "off";
    meter.querySelectorAll(".pf-mic-bar").forEach(bar => { bar.style.height = "4px"; });
    const label = document.getElementById("mic-activity-label");
    if (label) label.textContent = "Microphone check complete";
  }
  if (micTestContext) {
    micTestContext.close().catch(() => {});
    micTestContext = null;
  }
}

// ============================================================
// TRANSCRIPT & CAPTION HELPERS
// ============================================================

function addTranscriptLine(role, text) {
  if (!transcriptEl || !text || !text.trim()) return;

  const sysLine = transcriptEl.querySelector(".tx-line-sys");
  if (sysLine) sysLine.remove();

  const line = document.createElement("div");
  line.className = `tx-line ${role === "ai" ? "tx-line-ai" : "tx-line-you"}`;

  const speakerName = role === "ai" ? (aiNameEl?.textContent || "AI Panelist") : "You";
  line.innerHTML = `<strong>${speakerName}</strong>${escHtml(text)}`;

  transcriptEl.appendChild(line);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;

  exchangeCount++;
  if (txCountEl) txCountEl.textContent = `${exchangeCount} line${exchangeCount !== 1 ? "s" : ""}`;
}

function setLiveCaption(text) {
  if (!captionTextEl) return;
  if (!text || !text.trim()) {
    captionTextEl.classList.remove("show");
    return;
  }
  captionTextEl.classList.add("show");
  captionTextEl.textContent = text;
}

function clearLiveCaption() {
  if (captionTextEl) captionTextEl.classList.remove("show");
}

// ============================================================
// ACTIVE CALL CONTROLS
// ============================================================

function setupCallControls() {
  if (callScreen.dataset.controlsBound) return;
  callScreen.dataset.controlsBound = "true";
  // Strict interview: camera and microphone are locked on for the whole
  // session with no user-facing toggle at all (no button to attach a
  // handler to). Only screen-share recovery and ending the call are
  // exposed as controls.

  // Shown only when the browser's native "Stop sharing" control has fired
  // (see bindScreenShareEnded) — recovery after that is still recorded as
  // an integrity strike, it just isn't a permanent on-screen icon.
  if (screenShareToggleBtn) {
    screenShareToggleBtn.addEventListener("click", async () => {
      if (isScreenSharing) return;
      try {
        // Fullscreen is requested from this direct button gesture and again
        // after the native picker returns. This restores the immersive call
        // even when stopping the previous share also exited fullscreen.
        const capture = await acquireEntireScreenShare();
        screenStream = capture.stream;
        isScreenSharing = true;
        screenShareToggleBtn.style.setProperty("display", "none", "important");
        bindScreenShareEnded(capture.track);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "required_media_state", media: "screen_share", state: "restored" }));
        }
        if (navigator.userActivation?.isActive) await requestInterviewFullscreen();
      } catch (err) {
        isScreenSharing = false;
        showIntegrityNotice(err.message || "Screen sharing must be restored.");
      }
    });
  }

  setupIntegrityMonitoring();

  if (resumeInterviewBtn && !resumeInterviewBtn.dataset.bound) {
    resumeInterviewBtn.dataset.bound = "true";
    resumeInterviewBtn.addEventListener("click", () => window.location.reload());
  }

  const errorToastEnd = document.getElementById("error-toast-end");
  if (errorToastEnd) {
    errorToastEnd.textContent = "Return to dashboard";
    errorToastEnd.addEventListener("click", () => { window.location.href = "/"; });
  }

  // End Interview — custom modal instead of the native browser confirm().
  if (endInterviewBtn && endConfirmBackdropEl) {
    endInterviewBtn.addEventListener("click", () => {
      endConfirmBackdropEl.style.display = "flex";
    });
    endConfirmCancelBtn?.addEventListener("click", () => {
      endConfirmBackdropEl.style.display = "none";
    });
    endConfirmBackdropEl.addEventListener("click", (e) => {
      if (e.target === endConfirmBackdropEl) endConfirmBackdropEl.style.display = "none";
    });
    endConfirmOkBtn?.addEventListener("click", () => {
      endConfirmBackdropEl.style.display = "none";
      requestInterviewEnd("candidate_requested");
    });
  }
}

let screenShareWatchdog = null;
function bindScreenShareEnded(track) {
  if (screenShareWatchdog !== null) { clearInterval(screenShareWatchdog); screenShareWatchdog = null; }
  if (!track) return;
  let lossHandled = false;
  const handleLoss = () => {
    if (lossHandled) return;
    lossHandled = true;
    if (screenShareWatchdog !== null) { clearInterval(screenShareWatchdog); screenShareWatchdog = null; }
    isScreenSharing = false;
    if (screenStream && !screenStream.getVideoTracks().some((item) => item.readyState === "live")) {
      screenStream = null;
    }
    if (screenShareToggleBtn && _isCallScreenActive()) {
      // The native browser Stop sharing control ends the track without
      // dispatching a click in our UI. Force the recovery control visible so
      // it cannot remain hidden due to an inline/CSS display rule.
      screenShareToggleBtn.style.setProperty("display", "flex", "important");
      screenShareToggleBtn.title = "Restore required screen sharing";
    }
    if (pjShareAllowBtn) {
      pjShareAllowBtn.disabled = false;
      pjShareAllowBtn.textContent = "Share Screen Again";
    }
    if (pjJoinBtn) pjJoinBtn.disabled = true;
    if (shareOkEl) shareOkEl.style.display = "none";
    if (screenVideoEl) screenVideoEl.style.setProperty("display", "none", "important");
    if (_isCallScreenActive()) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "required_media_state", media: "screen_share", state: "lost" }));
      }
      recordIntegrityViolation("screen_share_ended", "Screen sharing stopped. Restore it immediately.");
    } else {
      showPrejoinError(shareErrorEl, "Screen sharing stopped. Share your entire screen again before joining.");
      updatePrejoinReadiness();
    }
  };
  track.addEventListener("ended", handleLoss, { once: true });
  // Browser/OS capture failures do not always dispatch ended. Verify the
  // same active monitor track, without inferring other apps or captures.
  let mutedSince = null;
  screenShareWatchdog = setInterval(() => {
    if (sessionCompletedCleanly || preflightCancelled || !screenStream?.getVideoTracks().includes(track)) {
      clearInterval(screenShareWatchdog); screenShareWatchdog = null; return;
    }
    const settings = track.getSettings?.() || {};
    if (track.readyState !== "live" || (settings.displaySurface && settings.displaySurface !== "monitor")) { handleLoss(); return; }
    mutedSince = track.muted ? (mutedSince ?? Date.now()) : null;
    if (mutedSince !== null && Date.now()-mutedSince >= 1500) handleLoss();
  }, 500);
  // Some browsers temporarily mute a display track before firing `ended`,
  // and a few never deliver `ended` after an OS-level capture failure. A
  // short confirmation window catches that loss without flagging a single
  // dropped frame.
  track.addEventListener("mute", () => {
    setTimeout(() => {
      if (track.muted || track.readyState !== "live") handleLoss();
    }, 1000);
  });
}

function requestInterviewEnd(reason) {
  if (integrityEndRequested || sessionCompletedCleanly) return;
  integrityEndRequested = true;
  photoVerifier.stop();
  // Release browser-owned presentation state immediately. Waiting for the
  // server's session_complete message left fullscreen and monitor capture
  // active during slow network/report transitions.
  stopScreenShareCapture();
  exitInterviewFullscreen();
  if (rndStatus) rndStatus.textContent = "Ending interview…";
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "end_interview", reason }));
    setTimeout(() => {
      if (!sessionCompletedCleanly) showIncompleteInterview(reason, completedRounds.size, requiredInterviewRounds);
    }, 15000);
  } else {
    showIncompleteInterview(reason, completedRounds.size, requiredInterviewRounds);
  }
}

function showIncompleteInterview(reason, completed = 0, required = TOTAL_INTERVIEW_ROUNDS, detail = "") {
  stopInterview();
  if (callScreen) callScreen.style.display = "none";
  if (reportScreen) reportScreen.style.display = "none";
  if (resultsScreen) resultsScreen.style.display = "none";
  if (liveChip) liveChip.style.display = "none";
  if (incompleteScreen) incompleteScreen.style.display = "flex";
  if (incompleteMessage) {
    const candidateEnded = reason === "candidate_requested" || reason === "candidate_ended" || reason === "proctor_terminated";
    if (candidateEnded && completed > 0) void showInterviewExperienceFeedback();
    incompleteMessage.textContent = candidateEnded
      ? (detail || (reason === "proctor_terminated"
        ? `This placement interview ended under the AI-proctor policy after ${completed} of ${required} required rounds. Your completed responses were saved. Placement staff can review the recorded event.`
        : `You ended this interview after ${completed} of ${required} required rounds. Your completed responses were saved, but this attempt is now closed and cannot be resumed. A full score and report may not be available.`))
      : `We can't generate a report yet — you completed ${completed} of ${required} required interview rounds. Your completed answers were saved. Resume this same interview to finish the remaining rounds; a score and report are created only after all ${required} rounds are complete.`;
    if (resumeInterviewBtn) resumeInterviewBtn.style.display = candidateEnded ? "none" : "inline-block";
  }
}

function showFatalError(detail) {
  photoVerifier.stop();
  const toast = document.getElementById("error-toast");
  const text = document.getElementById("error-toast-text");
  if (text) {
    text.textContent = `The interview service stopped unexpectedly: ${detail} Your saved answers are available when you resume this attempt.`;
  }
  if (toast) toast.classList.add("show");
  if (rndStatus) rndStatus.textContent = "Interview service interrupted";
}

// ============================================================
// INTEGRITY / ANTI-MALPRACTICE SIGNALS
// ============================================================
let _integrityMonitoringActive = false;
// Backend-authoritative: set only by the "interview_started" WS message,
// never by UI screen visibility. Prejoin/setup checks run before this is
// ever true, so they can never count.
let proctoringActive = false;
// Bounded — a WS outage must not lose events, but also must not grow
// unbounded if it stays down a long time.
const _MAX_PENDING_INTEGRITY_EVENTS = 50;
let pendingIntegrityEvents = [];

function _sendIntegrityEvent(eventType, severity = "warning", details = {}) {
  const message = {
    type: "integrity_event",
    // Unlike the page-local sequence counter, this remains unique when a
    // candidate reloads the page and the counter starts over. It is retained
    // unchanged if the queued message is resent after a WebSocket reconnect.
    event_id: crypto.randomUUID(),
    event_type: eventType,
    severity,
    sequence: ++integritySequence,
    details,
    timestamp: new Date(Date.now() + recordingServerClockOffsetMs).toISOString(),
  };
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pendingIntegrityEvents.push(message);
    if (pendingIntegrityEvents.length > _MAX_PENDING_INTEGRITY_EVENTS) pendingIntegrityEvents.shift();
    return;
  }
  ws.send(JSON.stringify(message));
}

function _flushPendingIntegrityEvents() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const queued = pendingIntegrityEvents;
  pendingIntegrityEvents = [];
  // Same `event_id` as when originally queued, so a resend never double-counts.
  queued.forEach((message) => ws.send(JSON.stringify(message)));
}

function showIntegrityNotice(message, reminder = false) {
  if (integrityToastTextEl) integrityToastTextEl.textContent = message;
  if (integrityStrikesEl) { integrityStrikesEl.hidden = reminder; integrityStrikesEl.textContent = `${integrityStrikeCount} warning${integrityStrikeCount === 1 ? "" : "s"}`; }
  if (integrityToastEl) {
    integrityToastEl.classList.add("show");
    clearTimeout(showIntegrityNotice._timer);
    showIntegrityNotice._timer = setTimeout(() => integrityToastEl.classList.remove("show"), 7000);
  }
}

// A laptop going to sleep (lid close, power button, OS-triggered idle sleep)
// produces the exact same raw signals as deliberate malpractice: the tab goes
// hidden AND the camera track ends AND the mic track ends, all within about a
// second of each other. Scoring those as 3-4 separate high-point violations
// punishes an accidental sleep exactly as hard as someone deliberately hiding
// the tab while covering the camera. These five types are the ones that can
// plausibly fire together as one system-level event rather than as five
// independent choices, so they get buffered briefly and correlated before
// being scored.
const HARD_LOSS_TYPES = new Set([
  "tab_hidden", "camera_lost", "microphone_lost",
  "camera_disable_attempt", "microphone_disable_attempt",
]);
const HARD_LOSS_CLUSTER_WINDOW_MS = 2000;
const FOCUS_DEPARTURE_NOTICE_MS = 1500;
const FOCUS_DEPARTURE_VIOLATION_MS = 5000;
const SUSPEND_RECOVERY_GRACE_MS = 30000;
let _pendingHardLoss = null; // { types: Map<eventType, {message, details}>, timer }
let _suspendRecoveryTimer = null;
let _suspendActiveSince = null;

function recordIntegrityViolation(eventType, message, details = {}) {
  if (!proctoringActive || integrityEndRequested || sessionCompletedCleanly) return;
  if (HARD_LOSS_TYPES.has(eventType)) {
    _bufferHardLossSignal(eventType, message, details);
    return;
  }
  _recordViolationNow(eventType, message, details);
}

function _recordViolationNow(eventType, message, details = {}) {
  const now = Date.now();
  const key = eventType.replace(/^(tab_hidden|window_blur_observed|fullscreen_exit)$/, "focus_departure");
  if (lastIntegrityEvent.key === key && now - lastIntegrityEvent.at < 1500) return;
  lastIntegrityEvent = { key, at: now };
  // Local count shown optimistically until the backend's authoritative
  // "integrity_event_recorded" reply overwrites it (see handleControlMessage).
  integrityStrikeCount += 1;
  _sendIntegrityEvent(eventType, "violation", { ...details, strike: integrityStrikeCount });
  showIntegrityNotice(`${message} This has been flagged for review (warning ${integrityStrikeCount}).`);
}

function _bufferHardLossSignal(eventType, message, details) {
  if (!_pendingHardLoss) {
    _pendingHardLoss = { types: new Map(), timer: setTimeout(_resolveHardLossCluster, HARD_LOSS_CLUSTER_WINDOW_MS) };
  }
  if (!_pendingHardLoss.types.has(eventType)) {
    _pendingHardLoss.types.set(eventType, { message, details });
  }
}

function _resolveHardLossCluster() {
  const cluster = _pendingHardLoss;
  _pendingHardLoss = null;
  if (!cluster) return;
  if (cluster.types.size >= 2) {
    // Two or more of these fired within the same instant: this is the
    // signature of a system/screen sleep, not a deliberate action. Log it as
    // an informational timeline entry (never scored) and watch for recovery
    // instead of stacking every signal as its own violation.
    _sendIntegrityEvent("system_suspend", "info", { signals: [...cluster.types.keys()] });
    showIntegrityNotice("Connection or device interruption detected. Continuing to monitor.");
    _startSuspendRecoveryWatch();
  } else {
    // Only one signal in the window: nothing correlated it, so it is scored
    // exactly as before.
    const [eventType, payload] = [...cluster.types.entries()][0];
    _recordViolationNow(eventType, payload.message, payload.details);
  }
}

function _startSuspendRecoveryWatch() {
  _suspendActiveSince = Date.now();
  if (_suspendRecoveryTimer) clearTimeout(_suspendRecoveryTimer);
  _suspendRecoveryTimer = setTimeout(() => {
    const recovered = !document.hidden && hasLiveTrack("video") && hasLiveTrack("audio");
    const ms = Date.now() - (_suspendActiveSince || Date.now());
    _suspendActiveSince = null;
    if (recovered) {
      // Woke back up on its own within the grace window: a normal sleep/wake
      // blip. Worth a timeline note for context, worth zero points.
      _sendIntegrityEvent("system_suspend_recovered", "info", { duration_ms: ms });
    } else {
      // Still gone after 30s: this no longer looks like a brief sleep, it
      // looks like an unexplained extended absence, so it now earns a real,
      // scored violation.
      _recordViolationNow(
        "prolonged_device_loss",
        `Camera, microphone or tab has been unavailable for over ${Math.round(ms / 1000)}s.`,
        { duration_ms: ms },
      );
    }
  }, SUSPEND_RECOVERY_GRACE_MS);
}

function _isCallScreenActive() {
  return !!(callScreen && getComputedStyle(callScreen).display !== "none");
}

function setupIntegrityMonitoring() {
  if (_integrityMonitoringActive) return; // guard against double-binding on a retry
  _integrityMonitoringActive = true;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && _isCallScreenActive()) {
      recordIntegrityViolation("tab_hidden", "The interview tab was left or hidden.");
    }
  });

  // Leaving the interview window for another app (Alt+Tab, Task View, a
  // second window) keeps the tab visible, so only focus reveals it. A brief
  // blur, such as clicking Hide on Chrome's own sharing banner, is a reminder
  // only; staying away for FOCUS_DEPARTURE_VIOLATION_MS is a warning.
  let blurTimer, departureTimer, departureStartedAt = 0;
  const stillAway = () => proctoringActive && _isCallScreenActive() && !document.hidden && !document.hasFocus();
  window.addEventListener("blur", () => {
    clearTimeout(blurTimer); clearTimeout(departureTimer);
    departureStartedAt = Date.now();
    blurTimer = setTimeout(() => {
      if (!stillAway()) return;
      _sendIntegrityEvent("window_blur_observed", "info", { review_only: true });
      showIntegrityNotice("You moved away from the interview window. Click back into the interview to continue.", true);
    }, FOCUS_DEPARTURE_NOTICE_MS);
    departureTimer = setTimeout(() => {
      // Leaving full screen or hiding the tab during the same departure has
      // already been recorded; one departure is one warning.
      if (!stillAway() || (lastIntegrityEvent.key === "focus_departure" && lastIntegrityEvent.at >= departureStartedAt)) return;
      _recordViolationNow("window_blur_observed", "You switched away from the interview window.",
        { confirmed_by: "focus_sequence", duration_ms: Date.now() - departureStartedAt });
    }, FOCUS_DEPARTURE_VIOLATION_MS);
  });
  window.addEventListener("focus", () => { clearTimeout(blurTimer); clearTimeout(departureTimer); });

  // Browser side panels cannot be named from a page. Observe only a
  // sustained width obstruction, normalized by height so browser zoom
  // and display scaling do not look like a panel. Review evidence only.
  let layoutSamples = 0, layoutObstructed = false;
  setInterval(() => {
    if (!proctoringActive || !_isCallScreenActive() || !document.fullscreenElement || sessionCompletedCleanly) {
      layoutSamples = 0; return;
    }
    const screenRatio = window.screen.width / window.screen.height;
    const viewportRatio = window.innerWidth / window.innerHeight;
    const restricted = Number.isFinite(screenRatio) && screenRatio > 0 &&
      viewportRatio / screenRatio < .85 && window.innerHeight > 300;
    layoutSamples = restricted ? layoutSamples + 1 : 0;
    if (layoutSamples >= 3 && !layoutObstructed) {
      layoutObstructed = true;
      _sendIntegrityEvent("screen_layout_obstructed", "info", {review_only:true,screen_ratio:screenRatio,viewport_ratio:viewportRatio});
      showIntegrityNotice("Close any browser side panel or split view and keep the interview across the full screen.", true);
    } else if (!restricted && layoutObstructed) {
      layoutObstructed = false;
      _sendIntegrityEvent("screen_layout_restored", "info", {review_only:true});
    }
  }, 500);

  const fullscreenReturn = document.getElementById("fullscreen-return");
  fullscreenReturn?.addEventListener("click", () => void requestInterviewFullscreen());
  document.addEventListener("fullscreenchange", () => {
    const outside = !document.fullscreenElement && _isCallScreenActive() && !sessionCompletedCleanly;
    // Leaving full screen is still recorded; the student also gets a direct
    // way back instead of having to find a browser shortcut.
    if (fullscreenReturn) fullscreenReturn.hidden = !outside;
    if (outside) {
      recordIntegrityViolation("fullscreen_exit", "Fullscreen interview mode was exited.");
    }
  });

  const blockClipboardEvent = (eventName, integrityType) => {
    document.addEventListener(eventName, (e) => {
      if (!_isCallScreenActive()) return;
      e.preventDefault();
      recordIntegrityViolation(integrityType, `${eventName[0].toUpperCase() + eventName.slice(1)} is disabled during the interview.`);
    });
  };
  blockClipboardEvent("copy", "copy_blocked");
  blockClipboardEvent("cut", "cut_blocked");
  blockClipboardEvent("paste", "paste_blocked");
}

// ============================================================
// AUDIO STREAMING (PCM WebSockets)
// ============================================================

function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

async function startMediaCapture() {
  if (!userMediaStream) {
    const result = await acquireMediaStream({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { deviceId: { ideal: "default" }, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 } },
    });
    userMediaStream = result.stream;
  }

  if (candidateVideoEl) {
    candidateVideoEl.srcObject = userMediaStream;
  }

  // AudioWorkletNode replaces the deprecated ScriptProcessorNode. The
  // worklet module (pcm-worklet-processor.js) does the low-pass-filtered
  // downsample to STT_SAMPLE_RATE on the audio render thread and posts back
  // fixed-size Float32Array chunks; this callback just converts to 16-bit
  // PCM and sends it, same output contract to the backend as before.
  await audioContext.audioWorklet.addModule("pcm-worklet-processor.js");
  const micSource = audioContext.createMediaStreamSource(new MediaStream(userMediaStream.getAudioTracks()));
  micCaptureSource = micSource;
  const micRecorderDestination = audioContext.createMediaStreamDestination();
  micCaptureDestination = micRecorderDestination;
  micSource.connect(micRecorderDestination);
  recordingMicStream = micRecorderDestination.stream;
  if (recordingAudioDestination) {
    playbackAudioContext.createMediaStreamSource(recordingMicStream).connect(recordingAudioDestination);
  }
  installMicrophoneProcessor();
  startMicrophoneWatchdog();
}

let microphoneWatchdog = null;
let microphoneRecoveryTask = null;
let lastMicrophoneFrameAt = 0;
let lastMicrophoneRecoveryAt = 0;
let microphoneSilentGain = null;

function microphoneCaptureStatus(message) {
  let status = document.getElementById("live-microphone-status");
  if (!status && callScreen) {
    status = document.createElement("div"); status.id = "live-microphone-status";
    status.setAttribute("role", "status");
    status.style.cssText = "margin:12px auto;padding:12px;max-width:720px;border-radius:12px;background:#292334;color:#fff;display:flex;gap:12px;align-items:center;justify-content:space-between";
    const text = document.createElement("span"); status.appendChild(text);
    const retry = document.createElement("button"); retry.type = "button"; retry.className = "btn btn-secondary";
    retry.textContent = "Retry microphone"; retry.onclick = () => void recoverMicrophoneCapture(true);
    status.appendChild(retry); callScreen.prepend(status);
  }
  if (status) { status.hidden = !message; status.style.display = message ? "flex" : "none"; status.firstElementChild.textContent = message; }
}

function installMicrophoneProcessor() {
  if (micProcessor && micCaptureSource) { try { micCaptureSource.disconnect(micProcessor); } catch {} }
  micProcessor?.disconnect(); microphoneSilentGain?.disconnect();
  micProcessor = new AudioWorkletNode(audioContext, "pcm-capture-processor", {
    processorOptions: { targetSampleRate: STT_SAMPLE_RATE },
  });
  lastMicrophoneFrameAt = Date.now();
  micProcessor.port.onmessage = (e) => {
    lastMicrophoneFrameAt = Date.now();
    if (!playbackAudioContext || playbackAudioContext.state === "running") microphoneCaptureStatus("");
    if (!ws || ws.readyState !== WebSocket.OPEN || !interviewHasStarted || micMuted || aiSpeaking) return;
    const pcmData = floatTo16BitPCM(e.data);
    // Bound buffered input so a transport outage cannot queue minutes of stale
    // speech and replay it as the answer to a later question.
    if (ws.bufferedAmount > 160000) { microphoneCaptureStatus("The interview connection is recovering. Your recording remains active."); return; }
    ws.send(pcmData.buffer);
  };
  micProcessor.onprocessorerror = () => {
    microphoneCaptureStatus("Microphone processing stopped. Reconnecting your microphone…");
    void recoverMicrophoneCapture(true);
  };
  micCaptureSource.connect(micProcessor);
  microphoneSilentGain = audioContext.createGain(); microphoneSilentGain.gain.value = 0;
  micProcessor.connect(microphoneSilentGain); microphoneSilentGain.connect(audioContext.destination);
}

async function recoverMicrophoneCapture(force = false) {
  if (microphoneRecoveryTask) return microphoneRecoveryTask;
  if (!audioContext || interviewStopRequested || (!force && Date.now() - lastMicrophoneRecoveryAt < 5000)) return;
  lastMicrophoneRecoveryAt = Date.now();
  microphoneRecoveryTask = (async () => {
    try {
      if (!hasLiveTrack("audio")) {
        const selected = micSelectEl?.value || "";
        let restored = await attachDeviceTrack("audio", selected);
        if (!restored && selected) {
          restored = await attachDeviceTrack("audio", "");
          if (restored && micSelectEl) micSelectEl.value = "";
        }
        if (!restored) throw new Error("Select a working microphone and retry.");
      }
      if (interviewStopRequested || !audioContext) return;
      await Promise.race([resumeInterviewAudio(), new Promise((_, reject) => setTimeout(() => reject(new Error("Click Retry microphone to resume microphone access.")), 4000))]);
      if (interviewStopRequested || !audioContext) return;
      if (audioContext.state !== "running") throw new Error("Click Retry microphone to enable audio capture.");
      if (force || Date.now() - lastMicrophoneFrameAt > 3000) installMicrophoneProcessor();
    } catch (error) { if (!interviewStopRequested) microphoneCaptureStatus(error.message || "Microphone audio is unavailable. Retry microphone."); }
  })().finally(() => { microphoneRecoveryTask = null; });
  return microphoneRecoveryTask;
}

function startMicrophoneWatchdog() {
  if (microphoneWatchdog) clearInterval(microphoneWatchdog);
  audioContext.onstatechange = () => { if (audioContext?.state === "suspended" || audioContext?.state === "interrupted") void recoverMicrophoneCapture(); };
  microphoneWatchdog = setInterval(() => {
    if (!interviewHasStarted || interviewStopRequested || !audioContext) return;
    if (audioContext.state !== "running" || Date.now() - lastMicrophoneFrameAt > 3000) void recoverMicrophoneCapture();
    if (playbackAudioContext && playbackAudioContext.state !== "running") void resumeInterviewAudio().catch(error => microphoneCaptureStatus(error.message));
  }, 1000);
}

function preflightFailureKind(message) {
  if (/microphone|audio|worklet|capture/i.test(message)) return "microphone";
  if (/camera|video/i.test(message)) return "camera";
  if (/identity|liveness|face|photo|verification/i.test(message)) return "identity";
  return "network";
}

function schedulePCMChunk(pcmBytes, epoch = currentAudioEpoch) {
  if (!playbackAudioContext) return;
  const int16 = new Int16Array(pcmBytes);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }

  const buffer = playbackAudioContext.createBuffer(1, float32.length, currentTTSSampleRate);
  buffer.getChannelData(0).set(float32);

  const source = playbackAudioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(playbackAnalyser || playbackAudioContext.destination);
  activePlaybackSources.add(source);
  source.onended = () => {
    activePlaybackSources.delete(source);
    if (playbackEndingEpoch === epoch && epoch === currentAudioEpoch && !activePlaybackSources.size) completePlayback(epoch);
  };

  const now = playbackAudioContext.currentTime;
  if (playbackTime < now) playbackTime = now + PREBUFFER_SECONDS;

  const audibleStartTime = playbackTime;
  if (!schedulePCMChunk._lipEpochs) schedulePCMChunk._lipEpochs = new Set();
  if (!schedulePCMChunk._lipEpochs.has(epoch)) {
    schedulePCMChunk._lipEpochs.add(epoch);
    const acknowledgeAudibleStart = () => {
      if (epoch !== currentAudioEpoch || !aiSpeaking) return;
      if (playbackAudioContext && (!playbackAudioContext.state || (playbackAudioContext.state === "running" && playbackAudioContext.currentTime >= audibleStartTime))) {
        setActivePanelTalking(true);
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "playback_started", audio_epoch: epoch }));
      } else setTimeout(acknowledgeAudibleStart, 20);
    };
    setTimeout(acknowledgeAudibleStart, 0);
  }
  source.start(playbackTime);
  playbackTime += buffer.duration;
}

function resetPlaybackQueue() {
  playbackEndingEpoch = null;
  activePlaybackSources.forEach((source) => {
    try { source.stop(); } catch {}
  });
  activePlaybackSources.clear();
  playbackTime = playbackAudioContext ? playbackAudioContext.currentTime : 0;
  if (schedulePCMChunk._lipEpochs) schedulePCMChunk._lipEpochs.clear();
}

function stopScreenShareCapture() {
  if (screenShareWatchdog !== null) { clearInterval(screenShareWatchdog); screenShareWatchdog = null; }
  if (screenStream) {
    screenStream.getTracks().forEach((track) => {
      try { track.stop(); } catch {}
    });
    screenStream = null;
  }
  isScreenSharing = false;
  if (screenVideoEl) {
    screenVideoEl.pause?.();
    screenVideoEl.srcObject = null;
    screenVideoEl.style.setProperty("display", "none", "important");
  }
  if (screenShareToggleBtn) screenShareToggleBtn.style.setProperty("display", "none", "important");
}

function exitInterviewFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function completePlayback(epoch) {
  if (epoch !== currentAudioEpoch || playbackEndingEpoch !== epoch) return;
  playbackEndingEpoch = null;
  if (playbackCompleteTimer !== null) clearTimeout(playbackCompleteTimer);
  playbackCompleteTimer = null;
  schedulePCMChunk._lipEpochs?.delete(epoch);
  aiSpeaking = false;
  setActivePanelTalking(false);
  if (aiRoleEl) aiRoleEl.textContent = currentAgentRole;
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "playback_complete", audio_epoch: epoch }));
}

async function resumeInterviewAudio() {
  const contexts = [audioContext, playbackAudioContext].filter(context => context && context.state !== "closed");
  await Promise.all(contexts.map(context => context.resume()));
  if (contexts.some(context => context.state !== "running")) throw new Error("Click Retry microphone to enable interview audio.");
}

function finishPlaybackAfterQueue(epoch) {
  if (playbackCompleteTimer !== null) clearTimeout(playbackCompleteTimer);
  playbackEndingEpoch = epoch;
  const check = () => {
    playbackCompleteTimer = null;
    if (epoch !== currentAudioEpoch || playbackEndingEpoch !== epoch) return;
    // The audio clock stops during suspension. Wall-clock timers must never
    // unmute the candidate while a question is still queued or audible.
    if (!playbackAudioContext || !activePlaybackSources.size ||
        (playbackAudioContext.state === "running" && playbackAudioContext.currentTime >= playbackTime)) {
      completePlayback(epoch);
      return;
    }
    if (playbackAudioContext.state && playbackAudioContext.state !== "running") {
      void resumeInterviewAudio().catch(error => microphoneCaptureStatus(error.message));
    }
    playbackCompleteTimer = setTimeout(check, 50);
  };
  // Test doubles without an audio clock retain the legacy duration contract.
  if (playbackAudioContext && !playbackAudioContext.state) {
    playbackCompleteTimer = setTimeout(() => completePlayback(epoch), Math.max(0, (playbackTime - playbackAudioContext.currentTime) * 1000) + 40);
  } else check();
}

function clearProcessingStatus() {
  if (processingStatusTimer !== null) {
    clearTimeout(processingStatusTimer);
    processingStatusTimer = null;
  }
}

function showProcessingStatus(detail) {
  clearProcessingStatus();
  if (aiRoleEl) aiRoleEl.textContent = detail || "Reviewing your answer…";
  processingStatusTimer = setTimeout(() => {
    processingStatusTimer = null;
    if (aiRoleEl && !aiSpeaking) aiRoleEl.textContent = "Still preparing the next question…";
  }, 9000);
}

function handleBinaryFrame(data) {
  if (data.byteLength < 4) return;
  const view = new DataView(data);
  const epoch = view.getUint32(0, false);
  if (epoch !== currentAudioEpoch) return;

  const pcm = data.slice(4);

  if (!aiSpeaking) {
    aiSpeaking = true;
  }

  schedulePCMChunk(pcm, epoch);
}

function setRecordingStatus(message, error = false) {
  const completedStatus = document.getElementById("results-recording-status");
  if (completedStatus) { completedStatus.hidden = !message || !interviewRecordingEnabled; completedStatus.textContent = message; }
  if (recordingStatusEl) {
    recordingStatusEl.hidden = !message;
    recordingStatusEl.textContent = message;
    recordingStatusEl.style.color = error ? "#b42336" : "";
  }
  if (callRecordingStatusEl) {
    callRecordingStatusEl.hidden = !message || !_isCallScreenActive();
    callRecordingStatusEl.textContent = error ? "Recording issue" : message.includes("finalizing") ? "Saving recording…" : message.includes("saved securely") ? "Recording saved" : message.includes("Recording in progress") ? "Recording" : "Recording update";
    callRecordingStatusEl.title = message || "";
  }
}

async function markRecordingFailed() {
  if (!currentSessionId) return;
  try { await studentFetch(`${_HTTP_BASE}/api/student/interview/${encodeURIComponent(currentSessionId)}/recording/fail`, { method: "POST" }); }
  catch (error) { console.warn("Could not update recording status", error); }
}

const RECORDING_PART_BYTES = 5 * 1024 * 1024;
const RECORDING_QUEUE_MAX_BYTES = 160 * 1024 * 1024;
function recordingDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("voicedots-interview-recording-v1", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Local recording queue is unavailable."));
  });
}
async function recordingDbRequest(storeName, mode, run) {
  const db = await recordingDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = run(transaction.objectStore(storeName));
    transaction.oncomplete = () => { db.close(); resolve(request?.result); };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error || request?.error); };
  });
}
async function recordingDbTransaction(storeNames, run) {
  const db = await recordingDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, "readwrite");
    run(transaction);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}
function recordingQueueId(sequence) { return `${currentSessionId}:${recordingSegmentId}:${sequence}`; }
async function saveRecordingChunk(blob, sequence) {
  const all = await recordingDbRequest("chunks", "readonly", store => store.getAll());
  const bytes = (all || []).reduce((sum, row) => sum + row.blob.size, 0);
  if (bytes + blob.size > RECORDING_QUEUE_MAX_BYTES) throw new Error("The local recording retry queue is full. Reconnect to the internet before continuing.");
  const item = { id: recordingQueueId(sequence), session: currentSessionId, segment: recordingSegmentId, sequence, blob, createdAt: Date.now() };
  await recordingDbRequest("chunks", "readwrite", store => store.put(item));
}
async function pendingRecordingChunks() {
  const all = await recordingDbRequest("chunks", "readonly", store => store.getAll());
  return (all || []).filter(row => row.session === currentSessionId && row.segment === recordingSegmentId)
    .sort((a, b) => a.sequence - b.sequence);
}
async function uploadRecordingPart(chunks) {
  const partNumber = recordingPartNumber;
  const blob = new Blob(chunks.map(row => row.blob), { type: recordingMimeType });
  const authorize = await studentFetch(`${_HTTP_BASE}/api/student/interview/${encodeURIComponent(currentSessionId)}/recording/parts/${encodeURIComponent(recordingSegmentId)}/${partNumber}/authorize`, { method: "POST" });
  const authData = await authorize.json().catch(() => ({}));
  if (!authorize.ok || !authData.url) throw new Error(authData.detail || "Recording part upload could not be authorized.");
  let etag;
  try {
    const uploaded = await fetch(authData.url, { method: "PUT", headers: { "Content-Type": recordingMimeType }, body: blob, credentials: "omit", signal: AbortSignal.timeout(30000) });
    if (uploaded.ok) etag = uploaded.headers.get("ETag");
  } catch (_) { /* Storage CORS can prevent direct upload. */ }
  if (!etag) {
    const uploaded = await studentFetch(`${_HTTP_BASE}/api/student/interview/${encodeURIComponent(currentSessionId)}/recording/parts/${encodeURIComponent(recordingSegmentId)}/${partNumber}`, {
      method: "PUT", headers: { "Content-Type": recordingMimeType }, body: blob,
    });
    const result = await uploaded.json().catch(() => ({}));
    if (!uploaded.ok || !result.ETag) throw new Error(result.detail || "Recording part upload was not confirmed. Please retry.");
    etag = result.ETag;
  }
  const part = { PartNumber: partNumber, ETag: etag };
  const nextParts = [...recordingPartMetadata, part];
  const nextPartNumber = partNumber + 1;
  const metaId = `${currentSessionId}:${recordingSegmentId}`;
  await recordingDbTransaction(["meta", "chunks"], transaction => {
    transaction.objectStore("meta").put({ id: metaId, session: currentSessionId,
      segment: recordingSegmentId, startedAt: recordingStartedAt, mimeType: recordingMimeType, duration: recordingFinalDuration, nextPart: nextPartNumber, parts: nextParts });
    for (const row of chunks) transaction.objectStore("chunks").delete(row.id);
  });
  recordingPartMetadata = nextParts;
  recordingPartNumber = nextPartNumber;
}
async function flushRecordingQueue(force = false) {
  const queued = await pendingRecordingChunks();
  let batch = [], bytes = 0;
  for (const row of queued) {
    batch.push(row); bytes += row.blob.size;
    if (bytes >= RECORDING_PART_BYTES) {
      await uploadRecordingPart(batch);
      batch = []; bytes = 0;
    }
  }
  if (force && batch.length) await uploadRecordingPart(batch);
}
async function retryRecordingFlush(force = false) {
  let lastError;
  for (let attempt = 0; attempt < 7; attempt++) {
    try { await flushRecordingQueue(force); recordingUploadFailed = recordingDataDropped; return; }
    catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, Math.min(30000, 800 * (2 ** attempt))));
    }
  }
  recordingUploadFailed = true;
  setRecordingStatus("Recording upload is delayed. Your interview can continue; keep this page open and reconnect to retry.", true);
  throw lastError;
}
async function clearRecordingQueue() {
  const chunks = await pendingRecordingChunks();
  for (const row of chunks) await recordingDbRequest("chunks", "readwrite", store => store.delete(row.id));
  await recordingDbRequest("meta", "readwrite", store => store.delete(`${currentSessionId}:${recordingSegmentId}`));
}

async function restorePendingInterviewRecording() {
  // Recover this completed session only; never attach another student's queue.
  const metas = await recordingDbRequest("meta", "readonly", store => store.getAll());
  const chunks = (await recordingDbRequest("chunks", "readonly", store => store.getAll())) || [];
  const owned = chunks.filter(row => row.session === currentSessionId).sort((a,b)=>a.createdAt-b.createdAt);
  const meta = (metas || []).filter(row => row.session === currentSessionId)
    .sort((a,b) => b.startedAt - a.startedAt)[0];
  if (!meta && !owned.length) return;
  recordingSegmentId = meta?.segment || owned[owned.length - 1].segment;
  const remaining = owned.filter(row => row.segment === recordingSegmentId);
  if (!remaining.length && !meta?.parts?.length) return;
  recordingStartedAt = meta?.startedAt || Math.min(...remaining.map(row => row.createdAt));
  recordingMimeType = meta?.mimeType || remaining[0]?.blob.type || "video/webm";
  recordingPartMetadata = meta?.parts || [];
  recordingPartNumber = meta?.nextPart || 1;
  recordingFinalDuration = meta?.duration ?? Math.max(0,Math.floor((Math.max(recordingStartedAt,...remaining.map(row => row.createdAt)) - recordingStartedAt)/1000));
  recordingFinalizePending = true;
  setRecordingStatus("Interview ended · recovering the saved video upload…");
}

function selectInterviewRecordingMimeType(isSupported = type => MediaRecorder.isTypeSupported(type)) {
  return ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8", "video/webm", "video/mp4;codecs=h264,aac", "video/mp4"]
    .find(isSupported) || "";
}
function describeInterviewRecordingFormat(mimeType) {
  const contentType = String(mimeType || "").split(";")[0];
  return {
    mimeType: contentType,
    extension: contentType === "video/mp4" ? "mp4" : "webm",
    codec: mimeType.includes("vp8") ? "vp8,opus" : mimeType.includes("vp9") ? "vp9,opus" : mimeType.toLowerCase().includes("h264") ? "h264,aac" : null,
  };
}

let interviewRecordingEnabled = true;
let completionPersistencePending = false;
let recordingStartTask = null;
async function startInterviewRecording() {
  if (recordingStartTask) return recordingStartTask;
  recordingStartTask = initializeInterviewRecording().finally(() => { recordingStartTask = null; });
  return recordingStartTask;
}
async function initializeInterviewRecording() {
  if (!interviewRecordingEnabled) return;
  if (interviewRecorder || !currentSessionId || !userMediaStream || !recordingConsentEl?.checked) return;
  if (typeof MediaRecorder === "undefined" || !recordingAudioDestination) {
    setRecordingStatus("This browser cannot record the interview. Your interview can continue, but its recording will be unavailable.", true);
    return;
  }
  const videoTrack = userMediaStream.getVideoTracks().find(track => track.readyState === "live");
  const audioTrack = recordingAudioDestination.stream.getAudioTracks().find(track => track.readyState === "live");
  if (!videoTrack || !audioTrack) {
    setRecordingStatus("The camera or microphone recording track is unavailable. Your interview can continue.", true);
    return;
  }
  // Drain the previous page's persisted slices before the server seals its
  // old segment. Never replace or silently discard an earlier recording.
  let savedMetas;
  try { savedMetas = await recordingDbRequest("meta", "readonly", store => store.getAll()); }
  catch { setRecordingStatus("Recording storage is unavailable in this browser. Your interview can continue.", true); return; }
  const previousMeta = (savedMetas || []).filter(row => row.session === currentSessionId)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (previousMeta) {
    recordingSegmentId = previousMeta.segment;
    recordingPartNumber = previousMeta.nextPart || 1;
    recordingPartMetadata = previousMeta.parts || [];
    recordingMimeType = previousMeta.mimeType;
    recordingStartedAt = previousMeta.startedAt;
    try { await retryRecordingFlush(true); }
    catch { setRecordingStatus("Previous recording upload needs a retry before recording can resume. Keep this page open.", true); return; }
  }
  recordingSegmentId = crypto.randomUUID();
  recordingChunkSequence = 0;
  recordingPersistenceQueue = Promise.resolve();
  recordingUploadQueue = Promise.resolve();
  recordingStopTask = null;
  recordingUploadFailed = false;
  recordingDataDropped = false;
  recordingStartedAt = Date.now();
  recordingFinalDuration = null;
  recordingFinalizePending = false;
  recordingFinalizeRetries = 0;
  if (recordingFinalizeRetryTimer) { clearTimeout(recordingFinalizeRetryTimer); recordingFinalizeRetryTimer = null; }
  try {
    const mimeType = selectInterviewRecordingMimeType();
    if (!mimeType) throw new Error("This browser does not expose a supported video recording format.");
    const format = describeInterviewRecordingFormat(mimeType);
    recordingMimeType = format.mimeType;
    recordingExtension = format.extension;
    recordingPartMetadata = [];
    recordingPartNumber = 1;
    const existing = await recordingDbRequest("chunks", "readonly", store => store.getAll());
    const stale = (existing || []).filter(item => Date.now() - Number(item.createdAt || 0) > 7 * 24 * 60 * 60 * 1000);
    for (const item of stale) await recordingDbRequest("chunks", "readwrite", store => store.delete(item.id));
    const started = await studentFetch(`${_HTTP_BASE}/api/student/interview/${encodeURIComponent(currentSessionId)}/recording/start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: true, segment_id: recordingSegmentId, mime_type: recordingMimeType,
        extension: recordingExtension, codec: format.codec }),
    });
    if (!started.ok) throw new Error((await started.json().catch(() => ({}))).detail || "Recording could not be started.");
    const startedData = await started.json().catch(() => ({}));
    const serverStartedAt = Date.parse(String(startedData.server_now || startedData.started_at || ""));
    if (Number.isFinite(serverStartedAt)) recordingServerClockOffsetMs = serverStartedAt - Date.now();
    await recordingDbRequest("meta", "readwrite", store => store.put({
      id: `${currentSessionId}:${recordingSegmentId}`, session: currentSessionId,
      segment: recordingSegmentId, startedAt: recordingStartedAt, mimeType: recordingMimeType,
      nextPart: 1, parts: [], duration: null,
    }));
    sessionStorage.setItem(`vd_interview_recording_consent_${currentSessionId}`, "true");
    if (interviewStopRequested) return;
    // Capture a low-resolution recording-only camera track. The live proctor
    // pipeline keeps the original camera stream and its existing quality.
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 360;
    const context = canvas.getContext("2d");
    const videoElement = candidateVideoEl || lobbyVideoEl;
    recordingCanvasTimer = window.setInterval(() => {
      if (context && videoElement?.readyState >= 2) context.drawImage(videoElement, 0, 0, 640, 360);
    }, 67);
    recordingCanvasStream = canvas.captureStream(15);
    const lowResolutionVideo = recordingCanvasStream.getVideoTracks()[0];
    const media = new MediaStream([lowResolutionVideo, audioTrack]);
    const recorderOptions = { mimeType, videoBitsPerSecond: 250_000, audioBitsPerSecond: 32_000 };
    interviewRecorder = new MediaRecorder(media, recorderOptions);
    interviewRecorder.ondataavailable = event => {
      if (!event.data?.size || !recordingSegmentId) return;
      const sequence = recordingChunkSequence++;
      // Persist each media slice immediately. Multipart upload stays ordered,
      // but a slow R2 request must not hold subsequent chunks in JS memory.
      const persisted = recordingPersistenceQueue.then(() => saveRecordingChunk(event.data, sequence));
      recordingPersistenceQueue = persisted.catch(error => {
        recordingDataDropped = true;
        throw error;
      });
      recordingUploadQueue = recordingUploadQueue.then(async () => {
        await persisted;
        await retryRecordingFlush(false);
      }).catch(error => {
        recordingUploadFailed = true;
        setRecordingStatus(error?.message || "Recording data could not be queued locally. Your interview can continue, but this video may be incomplete.", true);
        console.warn("Interview recording remains incomplete", error);
      });
    };
    interviewRecorder.onerror = event => {
      recordingUploadFailed = true;
      void markRecordingFailed();
      setRecordingStatus("The interview recording encountered a browser error. Your interview can continue.", true);
      console.error("Interview MediaRecorder error", event);
    };
    interviewRecorder.start(10000);
  setRecordingStatus("Recording in progress · video and audio are being uploaded securely for placement review.");
  } catch (error) {
    if (recordingCanvasTimer) { clearInterval(recordingCanvasTimer); recordingCanvasTimer = null; }
    recordingCanvasStream?.getTracks().forEach(track => track.stop());
    recordingCanvasStream = null;
    recordingUploadFailed = true;
    void markRecordingFailed();
    setRecordingStatus("The interview recording could not be started. Your interview can continue without it.", true);
    console.error("Interview recording start failed", error);
  }
}

function stopInterviewRecording(finalize = false, afterCaptureStopped = () => {}) {
  if (recordingStopTask) return recordingStopTask;
  const recorder = interviewRecorder;
  if (!recorder) {
    afterCaptureStopped();
    return finalize && recordingFinalizePending ? finalizePendingInterviewRecording() : Promise.resolve();
  }
  if (finalize) {
    recordingFinalizePending = true;
    recordingFinalDuration ??= Math.floor((Date.now() - recordingStartedAt) / 1000);
    setRecordingStatus("Interview ended · saving the secure recording…");
  }
  recordingStopTask = (async () => {
    if (recorder.state !== "inactive") {
      await new Promise(resolve => {
        recorder.addEventListener("stop", resolve, { once: true });
        try { recorder.stop(); } catch { resolve(); }
      });
    }
    interviewRecorder = null;
    if (recordingCanvasTimer) { clearInterval(recordingCanvasTimer); recordingCanvasTimer = null; }
    recordingCanvasStream?.getTracks().forEach(track => track.stop());
    recordingCanvasStream = null;
    afterCaptureStopped();
    await recordingPersistenceQueue.catch(() => {});
    await recordingUploadQueue;
    if (finalize && recordingSegmentId) {
      await recordingDbRequest("meta", "readwrite", store => store.put({
        id: `${currentSessionId}:${recordingSegmentId}`, session: currentSessionId,
        segment: recordingSegmentId, startedAt: recordingStartedAt, mimeType: recordingMimeType,
        duration: recordingFinalDuration, nextPart: recordingPartNumber, parts: recordingPartMetadata,
      })).catch(() => {});
    }

    if (!finalize) return;
    if (recordingDataDropped) {
      await markRecordingFailed();
      setRecordingStatus("The interview ended, but the local recording queue could not save every media chunk.", true);
      return;
    }
    await finalizePendingInterviewRecording();
  })().finally(() => { recordingStopTask = null; });
  return recordingStopTask;
}

let recordingFinalDuration = null;
let recordingFinalizePending = false;
let recordingFinalizeTask = null;
let recordingFinalizeRetryTimer = null;
let recordingFinalizeRetries = 0;
function finalizePendingInterviewRecording() {
  if (recordingFinalizeTask) return recordingFinalizeTask;
  if (recordingFinalizeRetryTimer) { clearTimeout(recordingFinalizeRetryTimer); recordingFinalizeRetryTimer = null; }
  recordingFinalizeTask = savePendingInterviewRecording().finally(() => { recordingFinalizeTask = null; });
  return recordingFinalizeTask;
}
async function savePendingInterviewRecording() {
  const savingSession = currentSessionId;
  recordingFinalizePending = true;
  recordingFinalDuration ??= Math.floor((Date.now() - recordingStartedAt) / 1000);
  try {
    await retryRecordingFlush(true);
    setRecordingStatus("Interview ended · finalizing the secure recording…");
    let response;
    for (let attempt=0;attempt<6;attempt++) {
      response = await studentFetch(`${_HTTP_BASE}/api/student/interview/${encodeURIComponent(currentSessionId)}/recording/finalize`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({duration_seconds:recordingFinalDuration,parts:recordingPartMetadata}),
      });
      if (response.status!==409) break;
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if (!response?.ok) throw new Error((await response?.json().catch(()=>({})))?.detail || "Recording finalization failed.");
    await clearRecordingQueue();recordingFinalizePending=false;recordingFinalizeRetries=0;
    setRecordingStatus("Interview ended · securely processing the recording.");
  } catch(error) {
    // Keep both the upload and IndexedDB chunks retryable after a transient error.
    setRecordingStatus("Interview ended · video save is delayed. Keep this page open and retry when connected.",true);
    if(recordingStatusEl) {
      const retry=document.createElement("button");retry.type="button";retry.textContent="Retry video save";
      retry.className="btn btn-secondary";retry.style.marginLeft="12px";
      retry.onclick=()=>{retry.disabled=true;void finalizePendingInterviewRecording();};recordingStatusEl.appendChild(retry);
    }
    if (recordingFinalizeRetries < 3 && !recordingFinalizeRetryTimer) {
      recordingFinalizeRetries += 1;
      recordingFinalizeRetryTimer = setTimeout(() => {
        recordingFinalizeRetryTimer = null;
        if (recordingFinalizePending && currentSessionId === savingSession && !interviewRecorder) void finalizePendingInterviewRecording();
      }, 15000);
    }
    console.warn("Recording save remains retryable",error);
  }
}
window.addEventListener("online",()=>{if(recordingFinalizePending&&!recordingStopTask)void finalizePendingInterviewRecording();});
window.addEventListener("beforeunload", event => {
  if (!recordingFinalizePending && !interviewRecorder) return;
  event.preventDefault(); event.returnValue = "";
});
document.addEventListener("click", async event => {
  const link = event.target.closest?.("a[href]");
  if (!link || (!recordingFinalizePending && !recordingStopTask)) return;
  event.preventDefault();
  if (recordingStopTask) await recordingStopTask;
  else await finalizePendingInterviewRecording();
  if (!recordingFinalizePending) window.location.assign(link.href);
});

// ============================================================
// CONTROL MESSAGES
// ============================================================

function handleControlMessage(payload) {
  if (payload.type === "interview_started") {
    resumingAfterDrop = false; busyResumeRetries = 0; reconnectAttempts = 0;
    document.getElementById("error-toast")?.classList.remove("show");
  }
  switch (payload.type) {
    case "authenticated":
      // Authentication succeeds before the server acquires interview ownership.
      // Keep retry counters until interview_started confirms a live runner.
      if (rndStatus) rndStatus.textContent = "Connecting interview…";
      break;

    // Backend-authoritative proctoring boundary — prejoin/setup checks
    // never send this. Only from here on does a flag actually count, and
    // only from here on do queued pending events get flushed.
    case "interview_started":
      interviewRecordingEnabled = payload.recording_enabled !== false;
      if (Array.isArray(payload.agents) && payload.agents.length) {
        const animations = new Map(panelAnimations);
        panelAnimations.clear();
        panelAgentEls.forEach(tile => {
          const oldRound = Number(tile.dataset.panelRound);
          const index = payload.agents.findIndex(profile => profile.agent_type === tile.dataset.agentType);
          tile.dataset.panelRound = String(index + 1);
          tile.style.order = String(index < 0 ? 99 : index);
          if (index < 0) return;
          const profile = payload.agents[index];
          const name = tile.querySelector(".panel-agent-name");
          const role = tile.querySelector(".panel-agent-role");
          if (name) name.textContent = profile.name || "Interviewer";
          if (role) role.textContent = profile.role || "Interview round";
          if (animations.has(oldRound)) panelAnimations.set(index + 1, animations.get(oldRound));
        });
      }
      setRequiredInterviewRounds(payload.total_rounds);
      clearTimeout(initialConnectionTimer);
      interviewHasStarted = true;
      proctoringActive = payload.proctoring_enabled === true || (payload.proctoring_enabled === undefined && payload.recording_enabled === true);
      absentFaceSince = multipleFaceSince = phoneVisibleSince = gazeOffCameraSince = null;
      lastMultiplePeopleDetectedAt = 0;
      personBoxCountDetected = corroboratedPersonCount = 0;
      lastPersonDetectionAt = 0;
      phoneEvidence = null; phoneDetected = false; lastPhoneDetectedAt = 0; cameraReminderTimes = {};
      if (proctoringActive) photoVerifier.start();
      else { photoVerifier.stop(); const livePhotoStatus = document.getElementById("call-photo-status"); if (livePhotoStatus) livePhotoStatus.hidden = true; }
      _flushPendingIntegrityEvents();
      void startInterviewRecording();
      break;

    case "integrity_event_recorded":
      if (Number.isFinite(Number(payload.total_flags)) && Number(payload.total_flags) >= 0) integrityStrikeCount = Number(payload.total_flags);
      if (integrityStrikesEl) integrityStrikesEl.textContent = `${integrityStrikeCount} warning${integrityStrikeCount === 1 ? "" : "s"}`;
      break;

    case "resume_state": {
      (payload.completed_rounds || []).forEach((value) => completedRounds.add(Number(value)));
      panelAgentEls.forEach((element) => {
        const itemRound = Number(element.dataset.panelRound);
        if (!completedRounds.has(itemRound)) return;
        element.classList.remove("active");
        element.classList.add("complete");
        const state = element.querySelector(".panel-agent-state");
        if (state) state.textContent = "DONE";
      });
      if (rndStatus) rndStatus.textContent = `Reconnected — ${Number(payload.turns_completed || 0)} answers safely restored`;
      void startInterviewRecording();
      break;
    }

    case "audio_epoch":
      currentAudioEpoch = payload.audio_epoch;
      break;

    // Backend's actual message type is "barge_in" (session.py
    // _handle_barge_in), not "interrupt" — this case used to be named
    // "interrupt" and was therefore silently dead. Same caption-clear /
    // ring-reset logic as before, just under the right case name.
    case "barge_in":
      currentAudioEpoch = payload.audio_epoch;
      resetPlaybackQueue();
      aiSpeaking = false;
      setActivePanelTalking(false);
      clearLiveCaption();
      break;

    // Backend sends "round_begin" (pipeline.py, carrying a nested `profile`
    // object — see agent_profiles.public_profile), not "round_transition"
    // with flat agent_name/role_label fields. This case used to be named
    // "round_transition" and read fields the backend never sends, so the
    // round/agent-name/avatar UI never updated.
    case "round_begin": {
      const roundNumber = Number(payload.round_number || 1);
      const profile = payload.profile || {};
      setRequiredInterviewRounds(payload.total_rounds);
      activePanelRound = roundNumber;
      if (rndBadge) rndBadge.textContent = `Round ${roundNumber}/${requiredInterviewRounds}`;
      if (rndName) rndName.textContent = profile.round_label || "AI Panel Round";
      if (aiNameEl) aiNameEl.textContent = profile.name || "AI Panelist";
      currentAgentRole = profile.role || "Interviewer";
      if (aiRoleEl) aiRoleEl.textContent = currentAgentRole;
      if (topbarRoundLabel) topbarRoundLabel.textContent = profile.round_label || "Panel Interview";
      if (rndStatus) rndStatus.textContent = "Connected (Live)";
      panelAgentEls.forEach((element) => {
        const itemRound = Number(element.dataset.panelRound);
        element.classList.toggle("active", itemRound === roundNumber);
        element.classList.toggle("complete", itemRound < roundNumber);
        if (itemRound === roundNumber) {
          const name = element.querySelector(".panel-agent-name");
          const role = element.querySelector(".panel-agent-role");
          if (name && profile.name) name.textContent = profile.name;
          if (role && profile.role) role.textContent = profile.role;
        }
        const state = element.querySelector(".panel-agent-state");
        if (state) state.textContent = itemRound < roundNumber ? "DONE" : (itemRound === roundNumber ? "LIVE" : (itemRound === roundNumber + 1 ? "NEXT" : "WAIT"));
      });
      break;
    }

    case "round_complete": {
      const completedRound = Number(payload.round_number || 0);
      if (completedRound) completedRounds.add(completedRound);
      const item = panelAgentEls.find((element) => Number(element.dataset.panelRound) === completedRound);
      if (item) {
        item.classList.remove("active");
        item.classList.add("complete");
        const state = item.querySelector(".panel-agent-state");
        if (state) state.textContent = "DONE";
      }
      if (rndStatus) rndStatus.textContent = completedRound < requiredInterviewRounds ? "Preparing panel handoff…" : "Completing interview…";
      break;
    }

    // Backend sends "tts_begin" (carries the AI's question text), not
    // "question". Also flips the aiSpeaking flag as early as possible
    // (defense-in-depth mic gate, Feature 1) — deliberately NOT cleared on
    // the backend's "tts_end" (that fires once the voice provider finishes
    // GENERATING audio, well before the browser finishes actually playing
    // it; see session.py's speak() Phase 1 vs Phase 2 docstring). It's
    // cleared instead by schedulePCMChunk's own playback-completion timer
    // below, which is keyed to actual scheduled playback finishing.
    case "tts_begin":
      currentTTSSampleRate = [24000, 48000].includes(Number(payload.sample_rate)) ? Number(payload.sample_rate) : TTS_SAMPLE_RATE;
      clearProcessingStatus();
      currentSpeakerIsProctor = payload.speaker === "proctor";
      currentAudioEpoch = Number(payload.audio_epoch || currentAudioEpoch);
      if (playbackCompleteTimer !== null) {
        clearTimeout(playbackCompleteTimer);
        playbackCompleteTimer = null;
      }
      playbackEndingEpoch = null;
      aiSpeaking = true;
      if (playbackAudioContext?.state && playbackAudioContext.state !== "running") void resumeInterviewAudio().catch(error => microphoneCaptureStatus(error.message));
      if (aiRoleEl) aiRoleEl.textContent = "Speaking...";
      // The AI's line is committed straight to the chat feed — there's no
      // "partial" stage for it (tts_begin already carries the full text),
      // so it must NOT also go into the live caption bubble. That bubble is
      // reserved for the CANDIDATE's own in-progress speech only (see
      // partial_transcript below) — showing the same text in both at once
      // was rendering as an obvious duplicate right under the chat card.
      if (payload.retry) {
        // The previous provider connection delivered an incomplete
        // utterance. The backend assigns a new epoch and retries the full
        // question; remove the partial audio before the replacement starts
        // and do not duplicate the question in the transcript.
        resetPlaybackQueue();
        clearLiveCaption();
      } else if (payload.text) {
        addTranscriptLine("ai", payload.text);
      }
      if (payload.question_text && currentQuestionTextEl) currentQuestionTextEl.textContent = payload.question_text;
      clearLiveCaption();
      break;

    case "tts_end": {
      // The voice provider has now streamed every chunk for this epoch. Waiting for
      // this explicit boundary prevents a temporary network gap between
      // chunks from cutting a question off halfway through.
      const endedEpoch = Number(payload.audio_epoch || 0);
      if (endedEpoch === currentAudioEpoch) finishPlaybackAfterQueue(endedEpoch);
      break;
    }

    // Backend sends "partial_transcript" for in-progress STT, not
    // "transcript" — and a partial is not final, so it only ever updates
    // the live caption bar, never the committed transcript panel.
    case "partial_transcript":
      if (payload.text) {
        setLiveCaption(payload.text, true);
        if (aiRoleEl) aiRoleEl.textContent = "Listening...";
      }
      break;

    // Backend sends "final_transcript" once the provider reaches end of turn —
    // this is the candidate's own committed speech and is exactly what was
    // never being shown ("the agent speaks but I can't understand my
    // voice, it's not taking"), because the frontend was listening for a
    // "transcript" type the backend never sends.
    case "final_transcript":
      if (payload.text && payload.text.trim()) {
        addTranscriptLine("candidate", payload.text);
      }
      clearLiveCaption();
      if (aiRoleEl) aiRoleEl.textContent = currentAgentRole;
      break;

    case "support_retry": {
      supportRetryState = payload.state;
      const controls = document.getElementById("support-retry-controls");
      if (controls) controls.hidden = !["awaiting_choice", "submitted"].includes(payload.state);
      const status = document.getElementById("support-retry-status");
      if (status) status.textContent = payload.state === "awaiting_choice"
        ? "Say yes to start your answer again, or no to keep your answer. You can also choose below."
        : "Would you like to start your answer again?";
      document.querySelectorAll(".support-retry-actions button").forEach(button => {
        button.disabled = payload.state !== "awaiting_choice";
      });
      break;
    }

    case "transcription_recovery":
      clearProcessingStatus();
      if (aiRoleEl) aiRoleEl.textContent = payload.detail || "Restoring speech recognition…";
      break;

    case "microphone_recovery":
      microphoneCaptureStatus(payload.detail || "Reconnecting microphone audio…");
      void recoverMicrophoneCapture(true);
      break;

    case "listening":
      if (Number(payload.audio_epoch) === currentAudioEpoch && !activePlaybackSources.size) {
        aiSpeaking = false; setActivePanelTalking(false);
      }
      void recoverMicrophoneCapture();
      break;

    case "processing":
      showProcessingStatus(payload.detail);
      break;

    case "call_ended":
      completionPersistencePending = true;
      // fall through: both events carry the completed-round proof.
    case "session_complete":
      clearProcessingStatus();
      setRequiredInterviewRounds(payload.required_rounds);
      if (Number(payload.completed_rounds) === requiredInterviewRounds && completedRounds.size === requiredInterviewRounds) {
        sessionCompletedCleanly = true;
        finishAndGenerateReport();
      } else {
        showIncompleteInterview("rounds_missing", completedRounds.size, requiredInterviewRounds);
      }
      break;

    case "session_incomplete":
      clearProcessingStatus();
      showIncompleteInterview(payload.reason, Number(payload.completed_rounds) || completedRounds.size, Number(payload.required_rounds) || requiredInterviewRounds, payload.detail || "");
      break;

    case "integrity_warning_summary":
      showIntegrityNotice(payload.detail || "Integrity warnings are being recorded for placement-officer review.");
      break;

    case "integrity_termination":
      showIntegrityNotice(payload.detail || "The placement interview ended under the AI-proctor policy set by placement staff.");
      break;

    case "interview_paused": {
      // Name what was actually lost: camera, microphone or screen sharing.
      const media = { camera_required: "your camera", microphone_required: "your microphone", screen_share_required: "entire-screen sharing" }[payload.reason] || "the required device";
      if (rndStatus) rndStatus.textContent = `Paused — restore ${media}`;
      if (aiRoleEl) aiRoleEl.textContent = "Paused";
      showIntegrityNotice(payload.detail || `Interview paused. Restore ${media} to continue.`);
      break;
    }

    case "interview_resumed":
      if (rndStatus) rndStatus.textContent = "Connected (Live)";
      if (aiRoleEl) aiRoleEl.textContent = currentAgentRole;
      showIntegrityNotice("Everything is connected again. The interview will continue.");
      break;

    case "session_paused":
      // The sign-in expired mid-interview; answers so far are saved.
      showFatalError("Your sign-in expired, so the interview was paused. Your answers so far are saved. Sign in again and resume this interview.");
      break;

    case "answer_redirect":
      if (rndStatus) rndStatus.textContent = "Back to the question";
      break;

    case "capture_error":
      showFatalError(payload.message || "Speech recognition disconnected. Please reconnect the interview.");
      break;

    case "error":
      if (payload.code === "SESSION_ALREADY_ACTIVE" && (interviewHasStarted || resumePreviouslyStarted) && resumingAfterDrop && busyResumeRetries < MAX_BUSY_RESUME_RETRIES) {
        if (rndStatus) rndStatus.textContent = "Restoring your previous interview connection…";
        break; // onclose retries after the previous authenticated runner releases its locks.
      }
      if (!interviewHasStarted) {
        returnToPreflight(payload.detail || "Interview connection failed. Retry readiness.");
        break;
      }
      clearProcessingStatus();
      // The backend has already closed this session on its side (see
      // pipeline.py's catch-all) — this is fatal, not a transient status.
      // Show it as its own toast rather than clobbering rnd-status, which
      // otherwise leaves a dead "Error: ..." label sitting in the round
      // title forever with no way forward.
      showFatalError(payload.detail || "The interview session hit an internal error.");
      break;
  }
}

// ============================================================
// START & STOP INTERVIEW
// ============================================================

async function startInterview(submissionId) {
  if (rndStatus) rndStatus.textContent = "Connecting to AI Panel...";
  setupCallControls();

  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextCtor({ sampleRate: STT_SAMPLE_RATE, latencyHint: "interactive" });
    playbackAudioContext = new AudioContextCtor({ latencyHint: "interactive" });
    playbackAnalyser = playbackAudioContext.createAnalyser();
    playbackAnalyser.fftSize = 256;
    playbackAnalyser.smoothingTimeConstant = 0.42;
    playbackAudioContext.onstatechange = () => {
      if (!interviewStopRequested && ["suspended", "interrupted"].includes(playbackAudioContext?.state)) {
        void resumeInterviewAudio().catch(error => microphoneCaptureStatus(error.message));
      }
    };
    playbackAnalyser.connect(playbackAudioContext.destination);
    recordingAudioDestination = playbackAudioContext.createMediaStreamDestination();
    playbackAnalyser.connect(recordingAudioDestination);

    await Promise.race([
      Promise.all([audioContext.resume(), playbackAudioContext.resume()]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Audio permission is paused. Retry microphone to start audio capture.")), 5000)),
    ]);
    await startMediaCapture();

    interviewStopRequested = false;
    connectInterviewSocket();
  } catch (err) {
    returnToPreflight(err.message || "Could not connect to the interview.");
  }
}

function returnToPreflight(message) {
  if (microphoneWatchdog) { clearInterval(microphoneWatchdog); microphoneWatchdog = null; }
  clearTimeout(initialConnectionTimer);
  const socket = ws;
  ws = null;
  socket?.close();
  micProcessor?.disconnect();
  micProcessor = null;
  void audioContext?.close();
  audioContext = null;
  void playbackAudioContext?.close();
  playbackAudioContext = null;
  playbackAnalyser = null;
  callScreen.style.display = "none";
  liveChip.style.display = "none";
  prejoinScreen.style.display = "flex";
  const kind = preflightFailureKind(message);
  failPreflight(kind, message);
  preflightStatus("Fix the item below to continue. Your other checks are preserved.");
}

function connectInterviewSocket() {
  if (interviewStopRequested || sessionCompletedCleanly || integrityEndRequested || !currentSessionId) return;
  const socket = new WebSocket(`${WS_BASE}/ws/interview/${currentSessionId}?preflight_id=${encodeURIComponent(preflightId)}`);
  ws = socket;
  if (!interviewHasStarted) initialConnectionTimer = setTimeout(() => returnToPreflight("Interview connection timed out. Retry readiness."), 30000);
  socket.binaryType = "arraybuffer";
  let heartbeatTimer = null;
  socket.onopen = () => {
    const heartbeat = () => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "heartbeat" }));
    };
    heartbeat();
    heartbeatTimer = setInterval(heartbeat, 2000);
    if (rndStatus) rndStatus.textContent = reconnectAttempts ? "Reconnecting interview…" : "Authenticating interview…";
  };
  socket.onmessage = (event) => {
    if (typeof event.data === "string") {
      try { handleControlMessage(JSON.parse(event.data)); } catch {}
    } else {
      handleBinaryFrame(event.data);
    }
  };
  socket.onerror = () => console.error("Interview WebSocket error");
  socket.onclose = (event) => {
    clearInterval(heartbeatTimer);
    if (ws !== socket) return;
    ws = null;
    proctoringActive = false;
    aiSpeaking = false;
    setActivePanelTalking(false);
    resetPlaybackQueue();
    if (sessionCompletedCleanly || integrityEndRequested || interviewStopRequested) {
      if (rndStatus) rndStatus.textContent = "Interview Ended";
      return;
    }
    if (event.code === 4409) {
      recoverCompletedSession();
      return;
    }
    // During an automatic reconnect the server may still be releasing this
    // tab's previous connection for a few seconds, so "already active" is
    // retried with the normal backoff. On a first connection it really is
    // another browser.
    const resumeStillReleasing = event.code === 4429 && (interviewHasStarted || resumePreviouslyStarted) && resumingAfterDrop && busyResumeRetries < MAX_BUSY_RESUME_RETRIES;
    if (resumeStillReleasing) busyResumeRetries += 1;
    if (event.code === 4429 && !resumeStillReleasing) {
      showFatalError("This interview is already active in another browser. Close the other interview before resuming here.");
      return;
    }
    if (!interviewHasStarted && !resumeStillReleasing) {
      returnToPreflight("Could not start the interview connection. Retry readiness.");
      return;
    }
    if ([4401, 4403, 4404].includes(event.code)) {
      const reason = event.code === 4401
        ? "Your sign-in session expired. Sign in again to resume; your saved answers are preserved."
        : event.code === 4403
          ? "Interview verification or placement access needs attention. Reopen this attempt to resume; your saved answers are preserved."
          : "This interview session is no longer available. Your saved answers are preserved.";
      showFatalError(reason);
      return;
    }
    if (!resumeStillReleasing && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      showFatalError("The connection could not be restored after several attempts. Your completed answers are saved; reload this page to resume.");
      return;
    }
    const delayMs = resumeStillReleasing ? 2000 : Math.min(10000, 1000 * (2 ** reconnectAttempts));
    reconnectAttempts += 1;
    resumingAfterDrop = true;
    if (rndStatus) rndStatus.textContent = `Connection lost — resuming in ${Math.ceil(delayMs / 1000)}s…`;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectInterviewSocket();
    }, delayMs);
  };
}

async function recoverCompletedSession() {
  try {
    const response = await studentFetch(`${_HTTP_BASE}/api/interview/${currentSessionId}`);
    const record = await response.json();
    if (!response.ok || record.status !== "completed") throw new Error("Session is not complete.");
    const agents = new Set((record.turns || []).map((turn) => turn.agent_type).filter(Boolean));
    if (!agents.size || agents.size > TOTAL_INTERVIEW_ROUNDS) throw new Error("Completed round evidence is missing.");
    setRequiredInterviewRounds(agents.size);
    for (let round = 1; round <= requiredInterviewRounds; round += 1) completedRounds.add(round);
    sessionCompletedCleanly = true;
    finishAndGenerateReport();
  } catch {
    showFatalError("The interview connection closed and its completion state could not be confirmed. Reload to resume safely.");
  }
}

function stopInterview() {
  supportRetryState = "complete";
  const supportControls = document.getElementById("support-retry-controls");
  if (supportControls) supportControls.hidden = true;
  clearTimeout(initialConnectionTimer);
  photoVerifier.stop();
  interviewStopRequested = true;
  preflightCancelled = true;
  deviceSwitchGeneration.audio += 1;
  deviceSwitchGeneration.video += 1;
  stopMicLevelTest();
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (playbackCompleteTimer !== null) {
    clearTimeout(playbackCompleteTimer);
    playbackCompleteTimer = null;
  }
  aiSpeaking = false;
  setActivePanelTalking(false);
  if (ws) {
    ws.close();
    ws = null;
  }
  if (micProcessor) {
    micProcessor.disconnect();
    micProcessor = null;
  }
  // Stop and finalize even an interrupted/early-ended placement recording.
  // Stop the recorder before releasing capture devices. Its final buffered
  // slice can persist/upload after the live camera and microphone stop.
  void stopInterviewRecording(true, cleanupInterviewMedia);
  // Release devices in the stop callback, after the final recorder data event.
  stopScreenShareCapture();
  exitInterviewFullscreen();
}

function cleanupInterviewMedia() {
  if (microphoneWatchdog) { clearInterval(microphoneWatchdog); microphoneWatchdog = null; }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (playbackAudioContext) {
    playbackAudioContext.close();
    playbackAudioContext = null;
    playbackAnalyser = null;
  }
  recordingAudioDestination?.stream.getTracks().forEach(track => track.stop());
  recordingMicStream?.getTracks().forEach(track => track.stop());
  recordingAudioDestination = null;
  recordingMicStream = null;
  if (userMediaStream) {
    userMediaStream.getTracks().forEach(t => t.stop());
    userMediaStream = null;
  }
  if (lobbyVideoEl) lobbyVideoEl.srcObject = null;
  if (candidateVideoEl) candidateVideoEl.srcObject = null;
}

// ============================================================
// POST-CALL: ANIMATED REPORT GENERATION & SCORECARD
// ============================================================

async function finishAndGenerateReport() {
  if (reportGenerationStarted) return;
  if (!sessionCompletedCleanly || completedRounds.size !== requiredInterviewRounds) {
    showIncompleteInterview("rounds_missing", completedRounds.size, requiredInterviewRounds);
    return;
  }
  reportGenerationStarted = true;
  stopInterview();
  void showInterviewExperienceFeedback();
  if (callScreen) callScreen.style.display = "none";
  if (liveChip) liveChip.style.display = "none";
  if (interviewRecordingEnabled) {
    if (reportScreen) reportScreen.style.display = "none";
    if (resultsScreen) resultsScreen.style.display = "block";
    renderResponsesSaved({report_type: "placement_drive"});
    return;
  }
  if (reportScreen) reportScreen.style.display = "flex";
  await loadEvaluationResults();
}

const REPORT_STEP_IDS = ["rc-1", "rc-2", "rc-3", "rc-4", "rc-5"];

function markReportStepDone(id) {
  const el = document.getElementById(id);
  if (!el || el.classList.contains("done")) return;
  el.classList.add("done");
  el.dataset.state = "done";
  const next = document.getElementById(REPORT_STEP_IDS[REPORT_STEP_IDS.indexOf(id) + 1]);
  if (next && next.dataset.state === "pending") next.dataset.state = "checking";
  const done = REPORT_STEP_IDS.filter(step => document.getElementById(step)?.classList.contains("done")).length;
  document.querySelector(".rg-ring")?.style.setProperty("--progress", String(Math.round(done / REPORT_STEP_IDS.length * 100)));
}

async function loadEvaluationResults() {
  const endpoint = currentSessionId
    ? `${_HTTP_BASE}/api/interview/${currentSessionId}/evaluation`
    : `${_HTTP_BASE}/api/resume/${currentSubmissionId}/evaluation`;

  // Stage 6 runs as a single blocking call with no progress channel — this
  // steps through the checklist on a timer instead of flashing every item
  // "done" at once the instant the request resolves. Deliberately stops one
  // short of the last item: the real request duration is unknown up front,
  // and finishing the checklist before the response actually arrives would
  // be lying about what's done.
  let stepIdx = 0;
  const stepTimer = setInterval(() => {
    if (stepIdx >= REPORT_STEP_IDS.length - 1) return;
    markReportStepDone(REPORT_STEP_IDS[stepIdx]);
    stepIdx += 1;
  }, 2500);

  try {
    if (completionPersistencePending && currentSessionId) {
      const waitStartedAt = Date.now();
      let completed = false;
      while (Date.now() - waitStartedAt < 180000) {
        const state = await studentFetch(`${_HTTP_BASE}/api/interview/${currentSessionId}`);
        if (!state.ok) throw new Error("Could not confirm saved interview answers.");
        const record = await state.json();
        if (record.status === "completed") { completed = true; break; }
        if (["abandoned", "candidate_ended"].includes(record.status)) throw new Error("Interview persistence did not complete.");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      if (!completed) throw new Error("Interview answers are still being saved. Check your dashboard shortly.");
    }
    let res = await studentFetch(`${endpoint}?async_mode=true`, { method: "POST" });
    // Recording persistence may finish after the spoken goodbye.
    const persistenceStartedAt = Date.now();
    while (res.status === 409 && Date.now() - persistenceStartedAt < 180000) {
      const existing = await studentFetch(endpoint);
      if (existing.ok) { res = existing; break; }
      if (existing.status !== 404) { res = existing; break; }
      await new Promise(resolve => setTimeout(resolve, 2000));
      res = await studentFetch(`${endpoint}?async_mode=true`, {method: "POST"});
    }
    if (res.status === 202) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 180000) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        res = await studentFetch(endpoint);
        if (res.status !== 404) break;
      }
    }
    if (res.status === 409) res = await studentFetch(endpoint); // already evaluated — fetch the existing one
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      renderEvaluationUnavailable(body.detail || `Request failed (${res.status}).`);
      return;
    }
    const report = await res.json();
    REPORT_STEP_IDS.forEach(markReportStepDone);
    if (reportScreen) reportScreen.style.display = "none";
    if (resultsScreen) resultsScreen.style.display = "block";
    if (hasEvaluableReportData(report)) {
      renderResults(report);
      void loadAnswerFeedback(report);
    } else {
      renderResponsesSaved(report);
    }
  } catch (err) {
    console.error("Evaluation error:", err);
    renderEvaluationUnavailable("Could not reach the server.");
  } finally {
    clearInterval(stepTimer);
  }
}

// Never fabricates a score/summary — CLAUDE.md is explicit that this system
// must never fake a result when a real one isn't available (e.g. the call
// disconnected before the interview reached its conclusion round, so Stage 6
// legitimately has nothing to evaluate yet).
function renderEvaluationUnavailable(detail) {
  if (reportScreen) reportScreen.style.display = "none";
  if (resultsScreen) resultsScreen.style.display = "block";
  if (resultsScoreValue) resultsScoreValue.textContent = "—";
  if (resultsReadiness) {
    resultsReadiness.className = "badge-ready red";
    resultsReadiness.textContent = "Not Available";
  }
  if (resultsSummary) {
    resultsSummary.textContent = `We couldn't generate an evaluation for this session: ${detail} If your call ended early or disconnected, this is expected — an interview needs to reach its final round to be scored.`;
  }
  if (resultsCoreDims) resultsCoreDims.innerHTML = "";
  if (resultsDomainDims) resultsDomainDims.innerHTML = "";
  if (resultsStrengths) resultsStrengths.innerHTML = "";
  if (resultsImprovements) resultsImprovements.innerHTML = "";
  if (resultsDownloadLink) resultsDownloadLink.hidden = true;
}

// True when the report has at least one real, scoreable signal to show.
// A session where almost every answer was declined/empty still comes back
// as res.ok with a fully-assembled report shape (report.py deliberately
// keeps a partial report inspectable rather than erroring out) — but every
// field in it is null/empty, so rendering the full report UI just produces
// a wall of "No data" / "Not enough answered questions" placeholders that
// reads like a broken page rather than a real result.
function hasEvaluableReportData(report) {
  if (report.overall_score != null) return true;
  const dims = [...(report.core_dimensions || []), ...(report.domain_dimensions || [])];
  if (dims.some((d) => d.percentage != null)) return true;
  if ((report.strengths || []).length) return true;
  const agents = report.agent_breakdown || [];
  if (agents.some((a) => a.sub_score != null)) return true;
  return false;
}

// The honest version of "nothing to show yet": confirms the interview was
// recorded without dressing up empty placeholders as a formal evaluation.
function renderResponsesSaved(report) {
  if (resultsReportTitle) resultsReportTitle.textContent = "Interview Complete";
  if (resultsReadiness) resultsReadiness.style.display = "none";
  Object.keys(RESULTS_DATA_SECTIONS).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  if (resultsSavedNotice) resultsSavedNotice.style.display = "block";
  const placement = report.report_type === "placement_drive";
  const title = document.getElementById("results-saved-title");
  const timeline = document.getElementById("results-saved-timeline");
  const primary = document.getElementById("results-saved-primary");
  if (title) title.textContent = placement ? "Interview submitted" : "Interview saved";
  if (timeline) timeline.hidden = !placement;
  if (primary) {
    primary.textContent = placement ? "Go to My reports" : "Start another practice";
    primary.setAttribute("href", placement ? "/reports" : "/practice");
  }
  if (resultsSavedDetail) {
    resultsSavedDetail.textContent = placement
      ? "Your answers are recorded. Your placement team reviews every interview and will release your result. You don't need to do anything else; it will appear in My reports."
      : "We've recorded your answers. There wasn't enough of an answered conversation this time to score it, so try another practice round whenever you're ready.";
  }
  if (resultsDownloadLink) resultsDownloadLink.hidden = true;
}

function renderResults(report) {
  if (resultsSavedNotice) resultsSavedNotice.style.display = "none";
  if (resultsReadiness) resultsReadiness.style.display = "";
  Object.entries(RESULTS_DATA_SECTIONS).forEach(([id, display]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
  });
  if (resultsReportTitle) {
    resultsReportTitle.textContent = report.report_type === "placement_drive"
      ? "Your Placement Interview Evaluation"
      : "Your General Mock Interview Evaluation";
  }
  const scoreVal = report.overall_score;
  if (resultsScoreValue) resultsScoreValue.textContent = scoreVal == null ? "—" : Math.round(scoreVal);

  if (resultsReadiness) {
    const r = (report.readiness || "").toLowerCase();
    resultsReadiness.className = "badge-ready";
    if (r === "interview ready") {
      resultsReadiness.classList.add("green");
      resultsReadiness.textContent = "Interview Ready";
    } else if (r === "approaching ready") {
      resultsReadiness.classList.add("blue");
      resultsReadiness.textContent = "Approaching Ready";
    } else if (r === "developing") {
      resultsReadiness.classList.add("amber");
      resultsReadiness.textContent = "Developing";
    } else if (r === "not ready") {
      resultsReadiness.classList.add("red");
      resultsReadiness.textContent = "Not Ready";
    } else {
      resultsReadiness.classList.add("amber");
      resultsReadiness.textContent = report.status === "incomplete" ? "Incomplete" : "Not Assessed";
    }
  }

  if (resultsSummary) {
    const notAssessedNotice = Array.isArray(report.not_assessed_notice)
      ? `Not assessed: ${report.not_assessed_notice.map((item) => String(item).replace(/_/g, " ")).join(", ")}.`
      : report.not_assessed_notice;
    resultsSummary.textContent = report.executive_summary
      || notAssessedNotice
      || "";
  }

  // Real per-dimension bands (band/4 as a %), from Stage 6's actual rubric —
  // see backend/app/evaluation/report.py's core_dimensions/domain_dimensions.
  // A dimension the fair-play reweighting dropped (fewer than 2 scoreable
  // answers) has percentage=null and is shown as "Not assessed", never 0.
  const dimRow = (d) => {
    const label = (d.dimension || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const pct = d.percentage;
    return `<div class="dim-row"><span>${escHtml(label)}</span><strong>${pct == null ? "Not assessed" : pct + "%"}</strong></div>`;
  };
  if (resultsCoreDims) {
    const dims = report.core_dimensions || [];
    resultsCoreDims.innerHTML = dims.length ? dims.map(dimRow).join("") : `<div class="dim-row"><span>No data</span></div>`;
  }
  if (resultsDomainDims) {
    const dims = report.domain_dimensions || [];
    resultsDomainDims.innerHTML = dims.length ? dims.map(dimRow).join("") : `<div class="dim-row"><span>No data</span></div>`;
  }

  if (resultsStrengths) {
    const items = report.strengths || [];
    resultsStrengths.innerHTML = items.length
      ? items.map(s => `<li class="list-item-g">${escHtml(s.text || s)}</li>`).join("")
      : `<li class="list-item-empty">Not enough answered questions to identify strengths.</li>`;
  }

  if (resultsImprovements) {
    // priority_improvement_areas items are {problem, actions: [...]} cards
    // (see report.py's _priority_improvement_areas); improvements (the
    // fallback) are plain {text} — different shapes, so format each
    // explicitly rather than guessing a single field name across both.
    const items = report.priority_improvement_areas || report.improvements || [];
    const growthLine = (s) => {
      if (typeof s === "string") return s;
      if (s.problem) {
        const firstAction = Array.isArray(s.actions) && s.actions.length ? s.actions[0] : null;
        return firstAction ? `${s.problem} ${firstAction}` : s.problem;
      }
      return s.text || "";
    };
    resultsImprovements.innerHTML = items.length
      ? items.map(s => `<li class="list-item-a">${escHtml(growthLine(s))}</li>`).join("")
      : `<li class="list-item-a">Not enough answered questions to identify growth areas.</li>`;
  }

  if (resultsAgentBreakdown) {
    const labels = { hr: "HR", domain: "Domain", industry: "Industry", manager: "Hiring Manager" };
    const agents = report.agent_breakdown || [];
    resultsAgentBreakdown.innerHTML = agents.length
      ? agents.map((a) => `<div class="report-agent-card"><strong>${escHtml(labels[a.agent_type] || a.agent_type)}</strong><div style="margin-top:5px;color:#94A3B8;">${a.sub_score == null ? "Not assessed" : `${Math.round(a.sub_score)}% · ${escHtml(a.readiness || "")}`}</div></div>`).join("")
      : `<div class="dim-row"><span>No round breakdown available</span></div>`;
  }

  if (resultsCommunication) {
    const c = report.communication;
    if (!c) {
      resultsCommunication.innerHTML = `<div class="dim-row"><span>No timed speech data</span></div>`;
    } else {
      const rows = [
        ["Speaking pace", c.speaking_speed_wpm == null ? "Not measured" : `${c.speaking_speed_wpm} WPM (${c.pace_label || "—"})`],
        ["Filler words", c.filler_word_count == null ? "Not measured" : String(c.filler_word_count)],
        ["Clarity", c.scores?.clarity == null ? "Not assessed" : `${c.scores.clarity}%`],
        ["Answer structure", c.scores?.answer_structure == null ? "Not assessed" : `${c.scores.answer_structure}%`],
      ];
      resultsCommunication.innerHTML = rows.map(([label, value]) => `<div class="dim-row"><span>${escHtml(label)}</span><strong>${escHtml(value)}</strong></div>`).join("");
    }
  }

  if (resultsResumeAlignment) {
    const alignment = report.resume_alignment;
    if (!alignment) {
      resultsResumeAlignment.innerHTML = `<div class="dim-row"><span>No claimed skills were assessed</span></div>`;
    } else {
      const skills = alignment.skills || [];
      const assessed = skills.filter(item => item.evidence_level && item.evidence_level !== "not_assessed");
      const unassessed = skills.filter(item => !item.evidence_level || item.evidence_level === "not_assessed");
      const chip = item => `<span class="skill-chip">${escHtml(item.skill)}</span>`;
      const evidence = item => `<div class="skill-evidence"><span>${escHtml(item.skill)}</span><strong>${escHtml(item.evidence_level.replace(/_/g," "))}</strong>${item.note ? `<p>${escHtml(item.note)}</p>` : ""}</div>`;
      const group = (items, title, render) => items.length ? `<section class="skill-group"><h4>${title} <span>${items.length}</span></h4><div class="skill-chips">${items.slice(0,6).map(render).join("")}</div>${items.length>6 ? `<details><summary>Show ${items.length-6} more skills</summary><div class="skill-chips">${items.slice(6).map(render).join("")}</div></details>` : ""}</section>` : "";
      const score = Number.isFinite(alignment.credibility_score) ? `${alignment.credibility_score}%` : "Not assessed";
      resultsResumeAlignment.innerHTML = `<div class="dim-row"><span>Credibility score</span><strong>${score}</strong></div><p class="skill-summary">${assessed.length} assessed · ${skills.length} claimed skills</p>${group(assessed,"Interview evidence",evidence)}${group(unassessed,"Not assessed in this interview",chip)}`;
    }
  }

  if (resultsLearningPlan) {
    const plan = report.learning_plan || [];
    resultsLearningPlan.innerHTML = plan.length
      ? plan.map((item) => `<div class="report-agent-card" style="margin-bottom:9px;"><strong>${escHtml(item.focus || "Practice area")}</strong>${(item.actions || []).map((action) => `<div style="margin-top:6px;color:#94A3B8;line-height:1.5;">→ ${escHtml(action)}</div>`).join("")}</div>`).join("")
      : `<div class="dim-row"><span>No additional practice priorities identified.</span></div>`;
  }

  if (resultsQuestionReviews) {
    const reviews = report.question_reviews || [];
    resultsQuestionReviews.innerHTML = reviews.length
      ? reviews.map((item, index) => {
          const feedback = [
            ...(item.strength_feedback || []).map((text) => `Strength: ${text}`),
            ...(item.improvement_feedback || []).map((text) => `Improve: ${text}`),
          ];
          return `<details class="report-agent-card" style="margin-bottom:9px;">
            <summary style="cursor:pointer;font-weight:700;">${index + 1}. ${escHtml(item.question || "Interview question")}</summary>
            <div style="margin-top:9px;color:#94A3B8;line-height:1.55;"><strong>Your answer:</strong> ${escHtml(item.answer || "No answer recorded")}</div>
            <div style="margin-top:7px;color:#C4B5FD;">${feedback.length ? feedback.map(escHtml).join("<br>") : (!item.answer ? "No answer was recorded for this question." : report.status !== "released" ? "Detailed feedback will be available when your report is released." : report.feedback_error ? "Detailed feedback is temporarily unavailable. Retry below." : "Preparing feedback for your answer…")}</div>
          </details>`;
        }).join("")
      : `<div class="dim-row"><span>No question review is available.</span></div>`;
  }

  if (resultsDownloadLink) {
    // The backend only serves report.pdf once status === "released" (a
    // report that failed validation is held_for_review and 409s there) —
    // this previously showed/enabled the button unconditionally right on
    // the results screen, so a held-for-review report's very first "great,
    // I'm done!" moment ended in a raw alert() popup on click. Gate it the
    // same way app.js's scorecard list already correctly does.
    if (currentSessionId && report.status === "released") {
      resultsDownloadLink.hidden = false;
      resultsDownloadLink.href = "#";
      resultsDownloadLink.onclick = async (event) => {
        event.preventDefault();
        const response = await studentFetch(`${_HTTP_BASE}/api/interview/${currentSessionId}/evaluation/report.pdf`, {
          headers: studentAuthHeaders(),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          alert(body.detail || "The report is not available yet.");
          return;
        }
        const blobUrl = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = `VoiceDot-Interview-Report-${currentSessionId}.pdf`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      };
    } else {
      resultsDownloadLink.hidden = true;
      resultsDownloadLink.onclick = null;
    }
  }
}

async function loadAnswerFeedback(report) {
  if (!currentSessionId || report.status !== "released" || !(report.question_reviews || []).some(item => item.answer)) return;
  try {
    const response = await studentFetch(`${_HTTP_BASE}/api/interview/${currentSessionId}/evaluation/question-feedback`, { method: "POST", signal: AbortSignal.timeout(45000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Feedback unavailable");
    report.question_reviews = (report.question_reviews || []).map(item => {
      const note = data.feedback?.[String(item.answer_id)];
      if (!note) return item;
      return { ...item, strength_feedback: note.what_worked ? [note.what_worked] : [], improvement_feedback: note.improve ? [note.improve] : [] };
    });
    report.feedback_error = data.complete === false;
  } catch (error) {
    report.feedback_error = true;
  }
  renderResults(report);
  if (report.feedback_error && resultsQuestionReviews) {
    const retry = document.createElement("button");
    retry.className = "btn btn-secondary";
    retry.textContent = "Retry answer feedback";
    retry.onclick = () => { retry.disabled = true; retry.textContent = "Preparing feedback…"; void loadAnswerFeedback(report); };
    resultsQuestionReviews.append(retry);
  }
}

// Match the actual camera frame instead of forcing landscape video into a square.
for (const video of [lobbyVideoEl, candidateVideoEl]) {
  video?.addEventListener("loadedmetadata", () => {
    if (video.videoWidth && video.videoHeight) {
      video.parentElement.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    }
  });
}

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}


async function showInterviewExperienceFeedback() {
  if (!currentSessionId || document.getElementById("interview-experience-feedback")) return;
  const endpoint = `${_HTTP_BASE}/api/student/interview/${encodeURIComponent(currentSessionId)}/experience-feedback`;
  try {
    let response = await studentFetch(endpoint, {signal:AbortSignal.timeout(10000)});
    const persistenceDeadline=Date.now()+30000;
    while (response.status === 409 && Date.now()<persistenceDeadline) {
      await new Promise(resolve=>setTimeout(resolve,1000));
      response=await studentFetch(endpoint, {signal:AbortSignal.timeout(10000)});
    }
    if (!response.ok) return;
    const data=await response.json();
    if (data.submitted || !Array.isArray(data.questions)) return;
    const esc = escHtml;
    const limit = Number(data.text_limit) || 500;
    const words = Array.isArray(data.rating_labels) && data.rating_labels.length === 5 ? data.rating_labels : ["Very poor", "Poor", "Average", "Good", "Excellent"];
    const context = data.context || {};
    const when = context.completed_at && !Number.isNaN(Date.parse(context.completed_at))
      ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(context.completed_at))
      : "Today";
    const total = data.questions.length + 1;
    const ratingRow = (question, index) => `
      <fieldset class="xf-q" data-q="${esc(question.key)}">
        <legend>${index + 1}. ${esc(question.label)}${index === 0 ? ' <em aria-label="required">*</em>' : ""}</legend>
        <div class="xf-rate">
          <div class="xf-stars" role="radiogroup" aria-label="${esc(question.label)}" data-name="${esc(question.key)}">${[1, 2, 3, 4, 5].map(value =>
            `<label class="xf-star"><input type="radio" name="${esc(question.key)}" value="${value}" aria-label="${value} star${value === 1 ? "" : "s"}, ${esc(words[value - 1])}"><span aria-hidden="true">★</span></label>`).join("")}</div>
          <span class="xf-word" aria-hidden="true"></span>
        </div>
        <ol class="xf-scale" aria-hidden="true">${words.map((word, i) => `<li>${i + 1} - ${esc(word)}</li>`).join("")}</ol>
        <p class="xf-error" role="alert"></p>
      </fieldset>`;
    const overlay = document.createElement("div");
    overlay.id = "interview-experience-feedback";
    overlay.className = "xf-overlay";
    overlay.innerHTML = `
      <div class="xf-shell" role="dialog" aria-modal="true" aria-labelledby="experience-feedback-title">
        <form class="xf-form" novalidate>
          <header class="xf-bar">
            <div class="topbar-brand xf-brand"><img src="/voicedotslogo.svg" alt="" width="30" height="30"><span class="topbar-name">oiceDots</span></div>
            <span class="xf-bar-note"><span aria-hidden="true">✓</span> Interview saved</span>
          </header>
          <div class="xf-body">
            <div class="xf-head">
              <span class="xf-badge" aria-hidden="true">★</span>
              <div>
                <h2 id="experience-feedback-title">Interview Completed! Share Your Feedback</h2>
                <p class="xf-sub">Takes about 30 seconds. Only the first rating is required, and your feedback never affects your result.</p>
              </div>
            </div>
            <dl class="xf-context">
              <div><dt>Interview type</dt><dd>${esc(context.interview_type || "AI interview")}</dd></div>
              <div><dt>Role</dt><dd>${esc(context.role || "Not specified")}</dd></div>
              <div><dt>Drive</dt><dd>${esc(context.drive || "Self practice")}</dd></div>
              <div><dt>Date</dt><dd>${esc(when)}</dd></div>
            </dl>
            <div class="xf-progress" aria-hidden="true"><span class="xf-progress-bar"><i></i></span><span class="xf-progress-text">0 of ${total} answered · about 30 seconds</span></div>
            <div class="xf-list">
              ${data.questions.map(ratingRow).join("")}
              <fieldset class="xf-q" data-q="recommend"><legend>${data.questions.length + 1}. How likely are you to recommend this AI interview experience to other students?</legend>
                <div class="xf-range"><div class="xf-range-ends"><span>Not likely</span><output class="xf-range-value" aria-live="polite">Not selected</output><span>Extremely likely</span></div>
                <input type="range" name="recommend" min="0" max="10" step="1" value="5" aria-label="How likely are you to recommend this AI interview experience? 0 to 10">
                <div class="xf-range-ticks">${Array.from({ length: 11 }, (_, n) => `<button type="button" data-score="${n}" tabindex="-1">${n}</button>`).join("")}</div></div></fieldset>
              <fieldset class="xf-q" data-q="improvements"><legend>What could we improve? <span>(Optional, choose any)</span></legend>
                <div class="xf-chips">${(data.improvement_options || []).map(option => `<label class="xf-chip"><input type="checkbox" name="improvements" value="${esc(option.key)}"><span>${esc(option.label)}</span></label>`).join("")}</div>
                <input class="xf-other" name="improvement_other" maxlength="200" placeholder="Tell us what else to improve..." aria-label="Please specify the other improvement" hidden>
                <p class="xf-error" role="alert"></p></fieldset>
              <fieldset class="xf-q" data-q="comments"><legend>Additional Comments <span>(Optional)</span></legend>
                <div class="xf-text"><textarea name="comments" maxlength="${limit}" rows="3" aria-label="Additional comments" placeholder="Share any other thoughts, suggestions, or feedback..."></textarea><span class="xf-count">0/${limit}</span></div></fieldset>
            </div>
          </div>
          <footer class="xf-actions">
            <p class="xf-status" role="status"></p>
            <button type="button" class="pj-btn pj-btn-ghost xf-skip">Skip for now</button>
            <button type="submit" class="pj-btn pj-btn-primary xf-submit">Submit Feedback</button>
          </footer>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector("form");
    const status = form.querySelector(".xf-status");
    const submit = form.querySelector(".xf-submit");
    const skip = form.querySelector(".xf-skip");
    const range = form.querySelector('input[name="recommend"]');
    const rangeValue = form.querySelector(".xf-range-value");
    const other = form.querySelector(".xf-other");
    let recommend = null;
    const checked = name => form.querySelector(`input[name="${name}"]:checked`);
    function updateProgress() {
      const answered = data.questions.filter(question => checked(question.key)).length + (recommend == null ? 0 : 1);
      form.querySelector(".xf-progress-bar i").style.width = `${Math.round(answered / total * 100)}%`;
      form.querySelector(".xf-progress-text").textContent = answered === total ? "All answered — thank you!" : `${answered} of ${total} answered · about 30 seconds`;
    }
    function clearError(name) {
      const question = form.querySelector(`[data-q="${name}"]`);
      question?.classList.remove("invalid");
      const error = question?.querySelector(".xf-error");
      if (error) error.textContent = "";
    }
    function showError(name, message) {
      const question = form.querySelector(`[data-q="${name}"]`);
      question?.classList.add("invalid");
      const error = question?.querySelector(".xf-error");
      if (error) error.textContent = message;
    }
    const setRecommend = value => {
      recommend = Number(value);
      range.value = String(recommend);
      rangeValue.textContent = `${recommend} / 10`;
      form.querySelector(".xf-range").classList.add("chosen");
      form.querySelectorAll(".xf-range-ticks button").forEach(button => button.classList.toggle("on", Number(button.dataset.score) === recommend));
      updateProgress();
    };
    range.addEventListener("input", () => setRecommend(range.value));
    range.addEventListener("change", () => setRecommend(range.value));
    range.addEventListener("pointerup", () => { if (recommend == null) setRecommend(range.value); });
    form.querySelectorAll(".xf-range-ticks button").forEach(button => button.addEventListener("click", () => setRecommend(button.dataset.score)));
    form.querySelectorAll(".xf-stars").forEach(group => group.addEventListener("change", event => {
      const value = Number(event.target.value);
      group.querySelectorAll(".xf-star").forEach((star, index) => star.classList.toggle("on", index < value));
      const word = group.parentElement.querySelector(".xf-word");
      word.textContent = words[value - 1];
      word.dataset.level = String(value);
      clearError(group.dataset.name);
      updateProgress();
    }));
    form.querySelectorAll('input[name="improvements"]').forEach(box => box.addEventListener("change", () => {
      box.closest(".xf-chip").classList.toggle("on", box.checked);
      const otherChecked = form.querySelector('input[name="improvements"][value="other"]')?.checked;
      other.hidden = !otherChecked;
      if (otherChecked) other.focus(); else other.value = "";
      clearError("improvements");
    }));
    other.addEventListener("input", () => clearError("improvements"));
    const comments = form.elements.namedItem("comments");
    comments.addEventListener("input", () => { form.querySelector(".xf-count").textContent = `${comments.value.length}/${limit}`; });
    const close = () => { overlay.classList.add("closing"); setTimeout(() => overlay.remove(), 220); };
    skip.focus();
    skip.onclick = () => {
      overlay.remove();
      void studentFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skipped: true }), signal: AbortSignal.timeout(10000) }).catch(() => {});
    };
    form.onsubmit = async event => {
      event.preventDefault();
      const improvements = [...form.querySelectorAll('input[name="improvements"]:checked')].map(box => box.value);
      const payload = { recommend, improvements, improvement_other: other.value.trim(), comments: comments.value.trim() };
      for (const question of data.questions) payload[question.key] = checked(question.key) ? Number(checked(question.key).value) : null;
      const first = data.questions[0]?.key;
      if (first && payload[first] == null) {
        showError(first, "Please choose a rating to submit, or skip for now.");
        status.textContent = "The first question is required.";
        form.querySelector(`[data-q="${first}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (improvements.includes("other") && !payload.improvement_other) {
        showError("improvements", "Please tell us what else to improve.");
        status.textContent = "";
        return;
      }
      submit.disabled = true;
      status.textContent = "Saving your feedback…";
      try {
        const saved = await studentFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
        if (!saved.ok) throw new Error("Your feedback could not be saved. Retry or skip.");
        form.innerHTML = `<div class="xf-done" role="status"><span class="xf-done-mark" aria-hidden="true">✓</span><h2>Thank you!</h2><p>Your feedback helps us make every AI interview better.</p></div>`;
        setTimeout(close, 1500);
      } catch (error) {
        status.textContent = error.message || "Feedback could not be saved. Retry or skip.";
        submit.disabled = false;
      }
    };
    overlay.addEventListener("keydown", event => {
      if (event.key === "Escape" && document.body.contains(skip)) skip.click();
      if (event.key === "Tab") {
        const controls = [...form.querySelectorAll("input:not([hidden]),textarea,button:not([disabled])")].filter(element => element.tabIndex !== -1);
        const firstControl = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === firstControl) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); firstControl.focus(); }
      }
    });
  } catch { /* Optional feedback must never block interview completion. */ }
}
