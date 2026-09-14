import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
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
import { Practice } from "./practice";

function Login() {
  const auth = useAuth();
  const [enroll, setEnroll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replaceSession, setReplaceSession] = useState(false);
  const [conflict, setConflict] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const email = String(form.get("email")).trim();
      const password = String(form.get("password"));
      await api(
        enroll ? "/api/auth/student-enroll" : "/api/auth/student-login",
        json(
          enroll
            ? {
                email,
                password,
                roll_number: String(form.get("roll_number")).trim(),
              }
            : { email, password, replace_active_session: replaceSession },
        ),
      );
      await auth.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && !enroll)
        setConflict(true);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Brand website />
        <div className="auth-story-content">
          <span className="pill">
            <Mic size={14} /> YOUR NEXT CHAPTER STARTS HERE
          </span>
          <h1>
            A little practice.
            <br />A lot more
            <br />
            <em>confidence.</em>
          </h1>
          <p>
            Meet your AI interview panel. Find your strengths. Walk into your
            next opportunity prepared.
          </p>
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
          <span className="eyebrow">VOICEDOTS STUDENT PORTAL</span>
          <h2>{enroll ? "Make it official." : "Welcome back."}</h2>
          <p>
            {enroll
              ? "Activate the student account created by your placement cell."
              : "Sign in to pick up where you left off."}
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
          <form onSubmit={submit}>
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
              College email
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@college.edu"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={enroll ? "new-password" : "current-password"}
                minLength={enroll ? 12 : undefined}
                required
                placeholder={
                  enroll
                    ? "12+ characters with upper/lowercase, number, symbol"
                    : "Enter your password"
                }
              />
            </label>
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
              {busy ? "Please wait…" : enroll ? "Activate account" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="text-button"
            onClick={() => {
              setEnroll(!enroll);
              setError("");
              setConflict(false);
              setReplaceSession(false);
            }}
          >
            {enroll
              ? "Already have an account? Sign in"
              : "First time here? Set up your password"}
          </button>
          <div className="auth-help">
            <BookOpen size={20} />
            <p>
              Your college manages access to this portal. Contact your placement
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
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
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
        <div className="sidebar-account">
          <span className="avatar">
            {student.full_name
              .split(/\s+/)
              .slice(0, 2)
              .map((n) => n[0])
              .join("")}
          </span>
          <div>
            <strong>{student.full_name}</strong>
            <span>{student.roll_number}</span>
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
            <span className="college-name">
              {auth.identity.logo_url && (
                <img src={auth.identity.logo_url} alt="" />
              )}
              {student.college_name || "Student portal"}
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
