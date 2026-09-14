import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "./api";

export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    api<T>(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);
  return { data, loading, error, reload };
}

export function Brand({ website = false }: { website?: boolean }) {
  const content = (
    <>
      <img src="/voicedotslogo.svg" alt="" />
      <span>oiceDots</span>
    </>
  );
  return website ? (
    <a
      className="brand"
      href={
        import.meta.env.VITE_WEBSITE_URL ||
        (import.meta.env.DEV ? "http://localhost:5173" : "https://voicedots.io")
      }
      aria-label="VoiceDots website"
    >
      {content}
    </a>
  ) : (
    <Link to="/" className="brand" aria-label="VoiceDots dashboard">
      {content}
    </Link>
  );
}
export const humanize = (s?: string) =>
  (s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
export const date = (s?: string) =>
  s && !Number.isNaN(Date.parse(s))
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
        new Date(s),
      )
    : "To be announced";
export const score = (n?: number | null) =>
  typeof n === "number" && Number.isFinite(n)
    ? `${Math.round(n)}%`
    : "Not assessed";

export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} /> Loading your dashboard…
    </div>
  );
}
export function ErrorMessage({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-message" role="alert">
      <AlertCircle size={19} />
      <span>{message}</span>
      {retry && (
        <button onClick={retry} className="button small secondary">
          Try again
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: boolean;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Sparkles />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action && (
        <Link className="button primary" to="/practice">
          Start practicing <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {action}
    </div>
  );
}
export function ResourceState({
  resource,
  children,
}: {
  resource: { loading: boolean; error: string; reload: () => void };
  children: ReactNode;
}) {
  if (resource.loading) return <Loading />;
  if (resource.error)
    return <ErrorMessage message={resource.error} retry={resource.reload} />;
  return <>{children}</>;
}

export function Dialog({
  children,
  close,
  labelledBy,
}: {
  children: ReactNode;
  close: () => void;
  labelledBy: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal panel"
      aria-labelledby={labelledBy}
      onCancel={close}
    >
      {children}
    </dialog>
  );
}
