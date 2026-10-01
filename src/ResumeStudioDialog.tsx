import { useEffect, useRef, type ReactNode } from "react";

/** One focus/scroll contract for all Resume Studio dialogs. */
export function ResumeStudioDialog({ labelId, className, onClose, children }: {
  labelId: string; className: string; onClose: () => void; children: ReactNode;
}) {
  const surface = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(surface.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'
    ) || []).filter(node => node.getClientRects().length > 0);
    (focusable()[0] || surface.current)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const nodes = focusable();
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); surface.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !surface.current?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !surface.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return <div className="rs-modal-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}><section ref={surface} className={className} role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1}>{children}</section></div>;
}
