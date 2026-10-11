import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Camera, CheckCircle2, FileText } from "lucide-react";
import type { Student } from "./api";
import { useAuth } from "./auth";
import { displayName } from "./display";
import { Dialog } from "./ui";

type Requirement = "resume" | "photo";

// Skipping the welcome prompt lasts only for this sign-in. auth.tsx clears every
// `vd_` session key on sign-out and session expiry, so the next login asks again.
const SKIP_KEY = "vd_profile_setup_skipped";

// Pages whose features depend on the Main Resume or the verified profile photo.
// Interviews compare the live camera with the saved photo, so both are needed;
// coaching features only read the resume.
const FEATURES: Array<{ match: (path: string) => boolean; needs: Requirement[]; label: string }> = [
  { match: path => path === "/practice", needs: ["resume", "photo"], label: "Interview practice" },
  { match: path => path === "/placements", needs: ["resume", "photo"], label: "Placement interviews" },
  { match: path => path === "/coach" || path.startsWith("/coach/"), needs: ["resume"], label: "AI Coach" },
  { match: path => path === "/career", needs: ["resume"], label: "Career Coach" },
];

export function missingRequirements(student: Student): Requirement[] {
  return [
    ...(student.current_resume_submission_id ? [] : ["resume" as const]),
    ...(student.photo_url ? [] : ["photo" as const]),
  ];
}

function readSkipped() {
  try { return sessionStorage.getItem(SKIP_KEY) === "1"; } catch { return false; }
}

export function ProfileSetupPrompt() {
  const { identity } = useAuth();
  const location = useLocation();
  const [welcomeSkipped, setWelcomeSkipped] = useState(readSkipped);
  const [dismissedVisit, setDismissedVisit] = useState<string | null>(null);
  if (!identity || location.pathname === "/profile") return null;
  const student = identity.student;
  const missing = missingRequirements(student);
  if (!missing.length) return null;

  const feature = FEATURES.find(item => item.match(location.pathname));
  const featureBlocked = feature && feature.needs.some(item => missing.includes(item)) && dismissedVisit !== location.key;
  const mode = featureBlocked ? "feature" : !welcomeSkipped ? "welcome" : null;
  if (!mode) return null;
  const items: Requirement[] = mode === "feature" ? feature!.needs : ["resume", "photo"];

  function skip() {
    try { sessionStorage.setItem(SKIP_KEY, "1"); } catch { /* storage may be unavailable */ }
    setWelcomeSkipped(true);
    // A feature prompt returns on the next visit to any page that needs it.
    if (mode === "feature") setDismissedVisit(location.key);
  }

  const firstName = displayName(student.full_name).split(/\s+/)[0] || "there";
  const needsLabel = feature?.needs.length === 2 ? "your Main Resume and profile photo" : "your Main Resume";
  return (
    <Dialog key={`${mode}:${location.key}`} labelledBy="profile-setup-title" close={skip} className="profile-setup-dialog">
      <span className="eyebrow">{mode === "welcome" ? "LET’S GET YOU READY" : "ONE STEP BEFORE YOU CONTINUE"}</span>
      <h2 id="profile-setup-title">{mode === "welcome" ? `Welcome, ${firstName}!` : `${feature!.label} needs ${needsLabel}`}</h2>
      <p className="profile-setup-intro">
        {mode === "welcome"
          ? "Two things are required before your interviews, placements and AI Coach can use your profile."
          : "Add what is missing below, then come back here to continue."}
      </p>
      <ul className="profile-setup-list">
        {items.map(item => <RequirementRow key={item} item={item} student={student} done={!missing.includes(item)} />)}
      </ul>
      <div className="profile-setup-footer">
        <span>{mode === "welcome" ? "You can skip for now. We’ll remind you the next time you sign in." : "You can look around, but this feature needs these details to work."}</span>
        <button type="button" className="button secondary" onClick={skip}>{mode === "welcome" ? "Skip for now" : "Not now"}</button>
      </div>
    </Dialog>
  );
}

function RequirementRow({ item, student, done }: { item: Requirement; student: Student; done: boolean }) {
  const resume = item === "resume";
  const Icon = resume ? FileText : Camera;
  const canUpload = resume || student.allow_student_photo_upload;
  const title = resume ? "Upload your Main Resume" : "Add your profile photo";
  const detail = resume
    ? "Used for interview questions, placement eligibility, AI Coach and Career Coach."
    : canUpload
      ? "Used to verify it’s you at the start of every interview."
      : "Your placement team adds this photo. Contact your placement cell if it is still missing.";
  return (
    <li className={`profile-setup-item${done ? " is-done" : ""}`}>
      <span className="profile-setup-icon" aria-hidden="true">{done ? <CheckCircle2 size={20} /> : <Icon size={20} />}</span>
      <div>
        <strong>{done ? (resume ? "Main Resume added" : "Profile photo added") : title}</strong>
        <small>{done ? "Done" : detail}</small>
      </div>
      {!done && canUpload && (
        <Link className="button primary small" to={resume ? "/profile#resume-library" : "/profile#profile-photo"}>
          {resume ? "Upload resume" : "Add photo"} <ArrowRight size={14} />
        </Link>
      )}
      {!done && !canUpload && <span className="pill">Pending</span>}
    </li>
  );
}
