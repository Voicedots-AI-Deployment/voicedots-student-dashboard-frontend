import {displayName} from "./display";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  LockKeyhole,
  BookOpen,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  FileText,
  House,
  LogOut,
  Menu,
  Mic,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { api, ApiError, json } from "./api";
import { useAuth } from "./auth";
import { Brand, ErrorMessage, Loading } from "./ui";
import { Overview, Placements, Growth, Profile, Reports } from "./pages";
import { Academics } from "./academics";
import { Coach } from "./coach";
import { Practice } from "./practice";
import { PhotoVerification } from "./PhotoVerification";
import { CoachSession } from "./coach-session";

type PendingPhotoLogin = {
  email: string;
  password: string;
  roll_number?: string;
  replace_active_session?: boolean;
  auth_method?: "password" | "face";
};

function Login() {
  const auth = useAuth();
  const [enroll, setEnroll] = useState(false);
  const [faceSignIn, setFaceSignIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replaceSession, setReplaceSession] = useState(false);
  const [conflict, setConflict] = useState(false);
  // Credentials remain only in component memory while the camera step is open.
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhotoLogin | null>(null);
  async function authenticate(credentials: PendingPhotoLogin, webcamPhoto?: string) {
    setBusy(true);
    setError("");
    try {
      await api(
        credentials.roll_number !== undefined ? "/api/auth/student-enroll" : "/api/auth/student-login",
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
      if (e instanceof ApiError && (e.status === 401 || e.status === 429)) setPendingPhoto(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (faceSignIn && !enroll) {
      setError("");
      setPendingPhoto({ email: String(form.get("email")).trim(), password: "", auth_method: "face" });
      return;
    }
    await authenticate({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
      ...(enroll ? { roll_number: String(form.get("roll_number")).trim() }
        : { replace_active_session: replaceSession }),
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
          <span className="pill">
            <Mic size={14} /> YOUR CAREER, ONE STEP CLOSER
          </span>
          <h1>
            <span>A little practice.</span>
            <span>A lot more</span>
            <em>confidence.</em>
          </h1>
          <p>
            Meet your AI interview panel. Find your strengths. Walk into your
            next opportunity prepared.
          </p>
          <div className="auth-session-preview" aria-hidden="true">
            <div className="auth-preview-top"><span className="auth-mic"><Mic size={22} /></span><div><strong>A space to find your voice.</strong><span>Your AI interview practice room</span></div></div>
            <div className="auth-wave">{[14,24,38,21,46,62,36,76,52,30,64,86,54,36,68,48,28,58,40,22,36,18,28,12].map((height, i) => <i key={i} style={{ height }} />)}</div>
            <div className="auth-preview-bottom"><span>Practice at your pace</span><span><ShieldCheck size={14} /> Built for your growth</span></div>
          </div>
          <div className="auth-features">
            {[
              "Personalized practice interviews",
              "Your campus placement opportunities",
              "Feedback that helps you move forward",
            ].map((text) => (
              <div key={text}>
                <ShieldCheck size={18} />
                {text}
              </div>
            ))}
          </div>
        </div>
        <span className="auth-footnote">
          Prepare with purpose. Grow with VoiceDots.
        </span>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form">
          <div className="auth-form-icon"><LockKeyhole size={23} /></div>
          <span className="eyebrow">YOUR STUDENT SPACE</span>
          <h2>{pendingPhoto ? "Verify your photo." : enroll ? "Make it official." : faceSignIn ? "Sign in with your face." : "Welcome back."}</h2>
          <p>
            {pendingPhoto ? "One more step to finish signing in." : enroll
              ? "Activate the student account created by your placement cell."
              : faceSignIn ? "Enter your email, then capture a camera photo to sign in." : "Sign in to pick up where you left off."}
          </p>
          {auth.expired && (
            <ErrorMessage message="Your session has expired. Sign in again to continue." />
          )}
          {auth.error && (
            <ErrorMessage
              message={auth.error}
              retry={() => void auth.refresh()}
            />
          )}
          {error && <ErrorMessage message={error} />}
          {pendingPhoto ? <>
            <PhotoVerification busy={busy}
              onCapture={(photo) => authenticate({ ...pendingPhoto, replace_active_session: replaceSession }, photo)}
              onCancel={() => { setPendingPhoto(null); setError(""); setConflict(false); setReplaceSession(false); }} />
            {conflict && !enroll && <label className="checkbox">
              <input type="checkbox" checked={replaceSession} disabled={busy}
                onChange={(e) => setReplaceSession(e.target.checked)} />
              End my previous session and sign in here
            </label>}
          </> : <form onSubmit={submit}>
            {enroll && (
              <label>
                Roll number
                <input
                  name="roll_number"
                  autoComplete="username"
                  required
                  maxLength={100}
                />
              </label>
            )}
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </label>
            {!faceSignIn && <label>
              Password
              <span className="auth-password">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={enroll ? "new-password" : "current-password"}
                minLength={enroll ? 12 : undefined}
                required
                placeholder={
                  enroll
                    ? "12+ characters with upper/lowercase, number, symbol"
                    : "Enter your password"
                }
              />
              <button type="button" className="auth-password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </span>
            </label>}
            {conflict && !enroll && (
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
              {busy ? "Please wait…" : enroll ? "Activate account" : faceSignIn ? "Open camera" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>}
          {!pendingPhoto && !enroll && <button className="text-button" disabled={busy}
            onClick={() => { setFaceSignIn(!faceSignIn); setError(""); setConflict(false); setReplaceSession(false); }}>
            {faceSignIn ? "Use password instead" : "Sign in with face"}
          </button>}
          {!pendingPhoto && <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setEnroll(!enroll);
              setFaceSignIn(false);
              setShowPassword(false);
              setError("");
              setConflict(false);
              setReplaceSession(false);
            }}
          >
            {enroll
              ? "Already have an account? Sign in"
              : "First time here? Set up your password"}
          </button>}
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

const nav = [
  { to: "/", label: "Overview", icon: House },
  { to: "/academics", label: "Marks and attendance", icon: BookOpen },
  { to: "/coach", label: "AI coach", icon: BookOpen },
  { to: "/practice", label: "Interview practice", icon: Mic },
  { to: "/placements", label: "Placements", icon: BriefcaseBusiness },
  { to: "/reports", label: "My reports", icon: FileText },
  { to: "/growth", label: "My growth", icon: ChartNoAxesCombined },
  { to: "/profile", label: "My profile", icon: UserRound },
];

export function App() {
  const auth = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
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
  }, [location.pathname]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
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
  if (auth.loading) return <Loading />;
  if (!auth.identity) return <Login />;
  const student = auth.identity.student;
  const current =
    nav.find((item) => item.to === location.pathname)?.label ||
    "Student dashboard";
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
  return (
    <div className="dashboard-shell">
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
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-content">
        <span className="portal-label">STUDENT WORKSPACE</span>
        <nav aria-label="Student navigation">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"}>
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
          <span className="avatar">
            {student.full_name
              .split(/\s+/)
              .slice(0, 2)
              .map((n) => n[0])
              .join("")}
          </span>
          <div>
            <strong title={student.full_name}>{displayName(student.full_name)}</strong>
            <span title={student.roll_number}>{student.roll_number}</span>
          </div>
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
              className="icon-button mobile-only"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Workspace <span>/</span> <strong>{current}</strong>
            </span>
          </div>
          <div className="topbar-tools">
            <span className="college-name" title={displayName(student.college_name) || "Student portal"}>
              {auth.identity.logo_url && (
                <img src={auth.identity.logo_url} alt="" />
              )}
              {displayName(student.college_name) || "Student portal"}
            </span>
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
        <main id="main-content" className="dashboard-content">
          {error && <ErrorMessage message={error} />}
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route
              path="/practice"
              element={<Practice key={location.search} />}
            />
            <Route path="/placements" element={<Placements />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/growth" element={<Growth />} />
            <Route path="/academics" element={<Academics />} />
            <Route path="/coach" element={<Coach />} />
            <Route path="/coach/session" element={<CoachSessionPage />} />
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

function CoachSessionPage() {
  const params = new URLSearchParams(window.location.search);
  const planId = params.get("plan") || "";
  return planId ? <CoachSession planId={planId} /> : <Navigate to="/coach" replace />;
}
