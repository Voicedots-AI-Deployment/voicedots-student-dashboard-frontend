import { useEffect, useMemo, useRef } from "react";
import { Download, X } from "lucide-react";

export function ResumePreview({ file, onClose }: { file: File; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("keydown", closeOnEscape); previousFocus?.focus(); };
  }, [onClose]);

  return (
    <div className="resume-preview-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="resume-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="resume-preview-title">
        <header className="resume-preview-header">
          <div><span className="eyebrow">ACTIVE RESUME</span><h2 id="resume-preview-title">{file.name}</h2></div>
          <button ref={closeButton} type="button" className="icon-button" aria-label="Close resume preview" onClick={onClose}><X size={19}/></button>
        </header>
        {isPdf ? <iframe title={`Resume preview: ${file.name}`} src={objectUrl}/> : <div className="resume-preview-docx">
          <p>Your resume is a Word document, which this browser cannot preview directly.</p>
          <a className="button primary" href={objectUrl} download={file.name}><Download size={16}/> Download resume</a>
        </div>}
      </section>
    </div>
  );
}
