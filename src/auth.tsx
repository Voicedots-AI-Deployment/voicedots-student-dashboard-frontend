import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, json, type Identity } from "./api";

const AuthContext = createContext<{
  identity: Identity | null;
  loading: boolean;
  error: string;
  expired: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);

function clearStudentData() {
  // Only this portal's hints are cleared; authorization stays in HttpOnly cookies.
  for (const key of Object.keys(sessionStorage)) {
    if (
      key.startsWith("vd_") ||
      ["current_submission_id", "current_session_id"].includes(key)
    )
      sessionStorage.removeItem(key);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const refresh = useCallback(async () => {
    setError("");
    try {
      const result = await api<Identity>("/api/auth/student-me");
      if (!result.student?.id)
        throw new Error(
          "This account does not have a student profile. Contact your placement cell.",
        );
      setIdentity(result);
      setExpired(false);
      // The retained live voice runtime consumes these display hints, never as credentials.
      sessionStorage.setItem("vd_student_data", JSON.stringify(result.student));
      sessionStorage.setItem(
        "vd_theme",
        JSON.stringify({
          primary_color: "#7c3aed",
          college_name: result.student.college_name,
          logo_url: result.logo_url,
        }),
      );
    } catch (e) {
      setIdentity(null);
      clearStudentData();
      if (!(e instanceof ApiError && e.status === 401))
        setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const expire = () => {
      clearStudentData();
      setIdentity(null);
      setExpired(true);
    };
    window.addEventListener("student-session-expired", expire);
    return () => window.removeEventListener("student-session-expired", expire);
  }, [refresh]);
  const logout = async () => {
    await api("/api/auth/student-logout", json({}));
    clearStudentData();
    setIdentity(null);
    setExpired(false);
  };
  return (
    <AuthContext.Provider
      value={{ identity, loading, error, expired, refresh, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is required");
  return auth;
}
