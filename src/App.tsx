import {displayName} from "./display";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ScanFace,
  Sparkles,
  Bot,
  BookOpen,
  GraduationCap,
  LayoutGrid,
  X,
  BriefcaseBusiness,
  CalendarDays,
  Compass,
  FileText,
  House,
  ChartLine,
  LogOut,
  Menu,
  Mic,
  Moon,
  Sun,
  UserRound,
} from "lucide-react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api, ApiError, json } from "./api";
import { useAuth } from "./auth";
import { Brand, ErrorMessage, Loading } from "./ui";
import { InterviewReport } from "./interview-report";
import { Overview, Placements, Profile, Reports } from "./pages";
import { Academics } from "./academics";
import { StudentErp } from "./student-erp";
import { Calendar } from "./calendar";
import { Coach } from "./coach";
import { CoachSkills } from "./coach-skills";
import { Practice } from "./practice";
import { PhotoVerification } from "./PhotoVerification";
import { CoachSession } from "./coach-session";
import { CareerCoach } from "./career-coach";
import { ResumeStudio } from "./resume-studio";
import { ProfileSetupPrompt } from "./profile-setup";
import { FeatureShowcase } from "./auth-showcase";
import { ProductTour, START_TOUR_EVENT } from "./product-tour";
import { Performance } from "./performance";

type PendingPhotoLogin = {
  email: string;
  password: string;
  roll_number?: string;
  replace_active_session?: boolean;
  auth_method?: "password" | "face";
};

function Login() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const setupToken = new URLSearchParams(location.search).get("setup_token") || "";
  const [setupComplete, setSetupComplete] = useState(false);
  const [setupLinkStatus, setSetupLinkStatus] = useState<"checking" | "valid" | "completed" | "expired" | "invalid">(setupToken ? "checking" : "valid");
  const [linkSent, setLinkSent] = useState(false);
  const [faceSignIn, setFaceSignIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replaceSession, setReplaceSession] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [photoRejected, setPhotoRejected] = useState("");
  // Credentials remain only in component memory while the camera step is open.
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhotoLogin | null>(null);
  useEffect(() => {
    if (!setupToken) return;
    let active = true;
    void api("/api/auth/student-password-setup-status", json({ token: setupToken }))
      .then((result) => { if (active) setSetupLinkStatus((result as { status?: "valid" | "completed" | "expired" | "invalid" }).status || "invalid"); })
      .catch(() => { if (active) setSetupLinkStatus("invalid"); });
    return () => { active = false; };
  }, [setupToken]);
  async function authenticate(credentials: PendingPhotoLogin, webcamPhoto?: string) {
    setBusy(true);
    setError("");
    try {
      await api(
        "/api/auth/student-login",
        json({ ...credentials, ...(webcamPhoto ? { webcam_photo: webcamPhoto } : {}) }),
      );
      setPendingPhoto(null);
      await auth.refresh();
    } catch (e) {
      const code = e instanceof ApiError
        ? (e.payload as { detail?: { code?: string } } | undefined)?.detail?.code : undefined;
      if (code === "PHOTO_REQUIRED") {
        setPendingPhoto(credentials);
        return;
      }
      if (code === "ACTIVE_SESSION_EXISTS") setConflict(true);
      if (code?.startsWith("PHOTO_")) setPhotoRejected(`${code}:${Date.now()}`);
      if (e instanceof ApiError && (e.status === 401 || e.status === 429)) setPendingPhoto(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (setupToken) {
      const password = String(form.get("password"));
      if (password !== String(form.get("confirm_password"))) { setError("Passwords do not match."); return; }
      setBusy(true); setError("");
      try {
        await api("/api/auth/student-password-setup", json({ token: setupToken, password }));
        setSetupComplete(true);
        navigate(location.pathname, { replace: true });
      } catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
      return;
    }
    if (faceSignIn) {
      setError("");
      setPendingPhoto({ email: String(form.get("email")).trim(), password: "", auth_method: "face" });
      return;
    }
    await authenticate({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
      replace_active_session: replaceSession,
    });
  }
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Brand website />
        <a className="auth-back" href={import.meta.env.VITE_WEBSITE_URL || "https://voicedots.io"}>
          Back to website <ArrowUpRight size={16} />
        </a>
      </header>
      <div className="auth-story">
        <div className="auth-story-content">
          <h1>
            <span>A little practice.</span>
            <span>A lot more</span>
            <em>confidence.</em>
          </h1>
          <p>
            Practice AI interviews, build your resume, prepare with your AI
            Coach and apply to campus placements, all in one place.
          </p>
          <FeatureShowcase />
          <div className="auth-features">
            {[
              { icon: Mic, text: "AI interview practice" },
              { icon: FileText, text: "Resume Studio" },
              { icon: BriefcaseBusiness, text: "Campus placements" },
            ].map(({ icon: Icon, text }) => (
              <div key={text}>
                <Icon size={15} />
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form">
          <span className="eyebrow">YOUR STUDENT SPACE</span>
          <h2>{setupComplete ? "Password updated." : setupToken ? "Choose your password." : pendingPhoto ? "Verify your photo." : faceSignIn ? "Sign in with your face." : "Welcome back."}</h2>
          <p>
            {setupComplete ? "Your account is ready. Sign in with your new password." : setupToken ? setupLinkStatus === "checking" ? "Checking your secure password link…" : setupLinkStatus === "completed" ? "Password already created. Sign in with your password." : setupLinkStatus === "expired" ? "This password link has expired. Request a new one below." : setupLinkStatus === "invalid" ? "This password link is invalid. Request a new one below." : "Choose a strong password to activate your student account or finish resetting it. This secure link can only be used once." : pendingPhoto ? "One more step to finish signing in."
              : faceSignIn ? "Enter your email, then take a camera photo to sign in." : "Sign in with your email and password."}
          </p>
          {/* One message at a time: the latest sign-in error, otherwise a
              session check that can be retried, otherwise the expiry notice. */}
          {error ? <ErrorMessage message={error} />
            : auth.error ? <ErrorMessage message={auth.error} retry={() => void auth.refresh()} />
            : auth.expired ? <ErrorMessage message="Your session has expired. Sign in again to continue." />
            : null}
          {!pendingPhoto && !setupToken && !setupComplete && <div className="auth-method" role="group" aria-label="Sign in with">
            {([["password", "Email & password", KeyRound], ["face", "Face", ScanFace]] as const).map(([method, label, Icon]) => {
              const active = (method === "face") === faceSignIn;
              return <button key={method} type="button" aria-pressed={active} className={active ? "active" : ""} disabled={busy}
                onClick={() => { if (active) return; setFaceSignIn(method === "face"); setError(""); setConflict(false); setReplaceSession(false); setLinkSent(false); }}>
                <Icon size={16} />{label}
              </button>;
            })}
          </div>}
          {pendingPhoto ? <>
            <PhotoVerification busy={busy} rejected={photoRejected}
              onCapture={(photo) => authenticate({ ...pendingPhoto, replace_active_session: replaceSession }, photo)}
              onCancel={() => { setPendingPhoto(null); setError(""); setConflict(false); setReplaceSession(false); }} />
            {conflict && <label className="checkbox">
              <input type="checkbox" checked={replaceSession} disabled={busy}
                onChange={(e) => setReplaceSession(e.target.checked)} />
              End my previous session and sign in here
            </label>}
          </> : !setupComplete && (!setupToken || setupLinkStatus === "valid") && <form onSubmit={submit}>
            {!setupToken && <label>
              Email
              <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
            </label>}
            {setupToken && <input type="hidden" name="email" value="" />}
            {!faceSignIn && <label>
              {setupToken ? "New password" : "Password"}
              <span className="auth-password">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={setupToken ? "new-password" : "current-password"}
                minLength={setupToken ? 12 : undefined}
                required
                placeholder={
                  setupToken
                    ? "12+ characters with upper/lowercase, number, symbol"
                    : "Enter your password"
                }
              />
              <button type="button" className="auth-password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </span>
            </label>}
            {setupToken && <label>Confirm new password<input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>}
            {conflict && !setupToken && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={replaceSession}
                  onChange={(e) => setReplaceSession(e.target.checked)}
                />
                End my previous session and sign in here
              </label>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? "Please wait…" : setupToken ? "Save password" : faceSignIn ? "Open camera" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>}
          {!pendingPhoto && !setupToken && !setupComplete && !faceSignIn && <button
            type="button"
            className="button secondary auth-reset"
            disabled={busy}
            onClick={() => {
              const email = (document.querySelector<HTMLInputElement>('input[name="email"]')?.value || "").trim();
              if (!email) { setError("Enter your student email first."); return; }
              setBusy(true); setError(""); setLinkSent(false);
              void api("/api/auth/student-password-link", json({ email })).then(() => setLinkSent(true)).catch(e => setError((e as Error).message)).finally(() => setBusy(false));
            }}
          >
            <Mail size={16} /> Email me a password setup or reset link
          </button>}
          {!pendingPhoto && !setupToken && !setupComplete && faceSignIn && <p className="auth-method-note"><ScanFace size={15} /> Face sign-in matches your camera photo with the profile photo your placement team saved.</p>}
          {setupToken && !setupComplete && (setupLinkStatus === "completed" || setupLinkStatus === "expired" || setupLinkStatus === "invalid") && <button className="button primary" onClick={() => navigate(location.pathname, { replace: true })}>Return to sign in <ArrowRight size={17}/></button>}
          {linkSent && <p role="status" className="success-message">If the account can receive a password link, an email will arrive shortly.</p>}
          {setupComplete && <button className="button primary" onClick={() => { setSetupComplete(false); setError(""); }}>Continue to sign in <ArrowRight size={17}/></button>}
          <div className="auth-help">
            <BookOpen size={20} />
            <p>
              Your placement team manages access to this portal. Contact your placement
              cell if you need an account or help signing in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Presence ping: often enough to stay inside the server's 4-minute window,
// and only while the student is actually here, so a forgotten tab on a
// shared computer still reaches the normal idle timeout.
const PRESENCE_INTERVAL_MS = 60000;
const PRESENCE_ACTIVE_FOR_MS = 30 * 60000;

const nav = [
  { to: "/", label: "Overview", icon: House },
  { to: "/performance", label: "My performance", icon: ChartLine },
  { to: "/placements", label: "Placements", icon: BriefcaseBusiness },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/practice", label: "Interview practice", icon: Mic },
  { to: "/coach", label: "AI coach", icon: Bot },
  { to: "/resume-studio", label: "Resume Studio", icon: FileText },
  { to: "/career", label: "Career coach", icon: Compass },
  { to: "/academics", label: "Marks and attendance", icon: GraduationCap },
  { to: "/erp", label: "My ERP", icon: LayoutGrid },
  { to: "/reports", label: "My reports", icon: FileText },
  { to: "/profile", label: "My profile", icon: UserRound },
];

export function App() {
  const auth = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [dark, setDark] = useState(
    () => localStorage.getItem("theme") === "dark",
  );
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
    document.querySelector("main")?.scrollTo(0, 0);
    // Deep links such as /profile#resume-library land on that section, after
    // the reset above and after the page has rendered it.
    if (!location.hash) return;
    const frame = window.requestAnimationFrame(() =>
      document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, location.hash]);
  useEffect(() => {
    // Replays the page entrance (motion.css) on navigation without remounting.
    const main = mainRef.current;
    if (!main) return;
    main.classList.remove("route-enter");
    void main.offsetWidth;
    main.classList.add("route-enter");
    const timer = window.setTimeout(() => main.classList.remove("route-enter"), 800);
    return () => window.clearTimeout(timer);
  }, [location.pathname, Boolean(auth.identity)]);
  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 760px)");
    const syncViewport = () => {
      setIsMobile(viewport.matches);
      if (!viewport.matches) setMobileOpen(false);
    };
    syncViewport();
    viewport.addEventListener("change", syncViewport);
    return () => viewport.removeEventListener("change", syncViewport);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex="0"]',
    ) || []).filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMobileOpen(false); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [mobileOpen]);
  // "Still here" ping: while the portal is open the session counts as active
  // on this device. Closing the browser stops it, so the next sign-in is not
  // blocked by a session nobody is using.
  const signedIn = Boolean(auth.identity);
  useEffect(() => {
    if (!signedIn) return;
    let lastActivity = Date.now();
    const touch = () => { lastActivity = Date.now(); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach(name => window.addEventListener(name, touch, { passive: true }));
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || Date.now() - lastActivity > PRESENCE_ACTIVE_FOR_MS) return;
      void api("/api/auth/student-presence", { method: "POST" }).catch((error) => {
        // The session ended elsewhere: stop pinging and show sign-in.
        if (error instanceof ApiError && error.status === 401) {
          window.clearInterval(timer);
          window.dispatchEvent(new Event("student-session-expired"));
        }
      });
    }, PRESENCE_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      events.forEach(name => window.removeEventListener(name, touch));
    };
  }, [signedIn]);
  if (auth.loading) return <Loading />;
  if (!auth.identity) return <Login />;
  const student = auth.identity.student;
  const current =
    nav.find((item) => item.to === location.pathname || (item.to === '/erp' && location.pathname.startsWith('/erp/')))?.label ||
    (location.pathname.startsWith("/reports/") ? "Interview report" : "Student dashboard");
  async function logout() {
    setLoggingOut(true);
    setError("");
    try {
      await auth.logout();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoggingOut(false);
    }
  }
  function toggleSidebar() {
    if (isMobile) setMobileOpen((value) => !value);
    else setSidebarCollapsed((value) => !value);
  }
  const navigationExpanded = isMobile ? mobileOpen : !sidebarCollapsed;
  return (
    <div className={`dashboard-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside ref={sidebarRef} className={`sidebar ${mobileOpen ? "open" : ""}`} aria-label="Student workspace" role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen || undefined}>
        <div className="sidebar-brand">
          <Brand />
          {isMobile && mobileOpen && (
            <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
              <X size={20} />
            </button>
          )}
        </div>
        <div className="sidebar-content">
        <span className="portal-label">STUDENT WORKSPACE</span>
        <nav aria-label="Student navigation">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} data-tour={`nav:${to}`}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-tip">
          <span className="tip-icon">
            <Mic size={20} />
          </span>
          <h3>Small steps. Real progress.</h3>
          <p>Your next interview can be your best one yet.</p>
          <NavLink to="/practice">
            Let’s practice <ArrowRight size={15} />
          </NavLink>
        </div>
        </div>
        <div className="sidebar-account">
          <NavLink className="sidebar-profile-link" to="/profile" aria-label="Open my profile"><span className="avatar">
            {student.full_name
              .split(/\s+/)
              .slice(0, 2)
              .map((n) => n[0])
              .join("")}
          </span>
          <div>
            <strong title={student.full_name}>{displayName(student.full_name)}</strong>
            <span title={student.roll_number}>{student.roll_number}</span>
          </div></NavLink>
          <button
            className="icon-button"
            aria-label="Sign out"
            disabled={loggingOut}
            onClick={() => void logout()}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-topbar">
          <div>
            <button
              className="icon-button"
              data-tour="menu"
              aria-label={navigationExpanded ? "Close navigation" : "Open navigation"}
              aria-expanded={navigationExpanded}
              onClick={toggleSidebar}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Workspace <span>/</span> <strong>{current}</strong>
            </span>
          </div>
          <div className="topbar-tools">
            <span className="college-name" title={location.pathname === "/resume-studio" ? displayName(student.full_name) : displayName(student.college_name) || "Student portal"}>
              {auth.identity.logo_url && (
                <img src={auth.identity.logo_url} alt="" />
              )}
              {location.pathname === "/resume-studio" ? displayName(student.full_name) : displayName(student.college_name) || "Student portal"}
            </span>
            <button
              className="icon-button"
              data-tour="replay"
              aria-label="Take the product tour"
              title="Take the product tour"
              onClick={() => window.dispatchEvent(new Event(START_TOUR_EVENT))}
            >
              <Sparkles size={19} />
            </button>
            <button
              className="icon-button"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <span className="student-badge">Student</span>
          </div>
        </header>
        <main ref={mainRef} id="main-content" className="dashboard-content">
          {error && <ErrorMessage message={error} />}
          <ProfileSetupPrompt />
          <ProductTour />
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route
              path="/practice"
              element={<Practice key={location.search} />}
            />
            <Route path="/placements" element={<Placements />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/reports/:sessionId" element={<InterviewReport />} />
            <Route path="/growth" element={<Navigate to="/" replace />} />
            <Route path="/academics" element={<Academics />} />
            <Route path="/erp" element={<StudentErp />} />
            <Route path="/erp/:service" element={<StudentErp />} />
            <Route path="/coach" element={<Coach />} />
            <Route path="/coach/skills" element={<CoachSkills />} />
            <Route path="/resume-studio" element={<ResumeStudio />} />
            <Route path="/career" element={<CareerCoach />} />
            <Route path="/coach/session" element={<CoachSessionRoute />} />
            <Route path="/profile" element={<Profile />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  <h1>Page not found</h1>
                  <NavLink to="/" className="button primary">
                    Back to overview
                  </NavLink>
                </div>
              }
            />
          </Routes>
          <footer className="dashboard-footer">
            <span>Built for your next chapter.</span>
            <Brand website />
          </footer>
        </main>
      </div>
    </div>
  );
}

function CoachSessionRoute() {
  const params = new URLSearchParams(window.location.search);
  const planId = params.get("plan");
  const sessionId = params.get("session") || undefined;
  const cycleId = params.get("cycle") || undefined;
  return planId ? <CoachSession planId={planId} sessionId={sessionId} cycleId={cycleId} /> : <Navigate to="/coach" replace />;
}
