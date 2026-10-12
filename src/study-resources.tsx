import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, ChevronDown, FileText, FolderOpen, GraduationCap, Layers, LoaderCircle, Search } from 'lucide-react';
import { api, request } from './api';
import { ErrorMessage, PageHeading, useResource } from './ui';
import './study-resources.css';

type SyllabusItem = { id: string; code: string; title: string; unit_id?: string };
type Resource = {
  id: string; kind: 'PAPER'; title: string; description: string;
  filename: string; exam_year: number | null; exam_session: string | null;
};
type Subject = {
  id: string; code: string; name: string; year_number: number; semester_number: number;
  credits: number | null;
  syllabus_id: string | null; syllabus_version: number | null; document_filename: string | null;
  syllabus_content: { cos?: SyllabusItem[]; units?: SyllabusItem[]; topics?: SyllabusItem[] } | null;
  resources: Resource[];
};
type Catalog = { status: 'ready' | 'unavailable'; message?: string; subjects: Subject[] };
type Section = 'syllabus' | 'papers';
type OpenDocument = (path: string) => Promise<void>;
const documentPath = (id: string) => `/api/student/study-resources/documents/${encodeURIComponent(id)}`;

export function StudyResources() {
  const catalog = useResource<Catalog>('/api/student/study-resources');
  const [chosenSemester, setChosenSemester] = useState(0);
  const [chosenSubject, setChosenSubject] = useState('');
  const [section, setSection] = useState<Section>('syllabus');
  const [documentError, setDocumentError] = useState('');
  const [pendingPath, setPendingPath] = useState('');
  const [failedPath, setFailedPath] = useState('');
  const [revealSubject, setRevealSubject] = useState(false);
  const subjectHeading = useRef<HTMLHeadingElement>(null);
  const subjects = catalog.data?.subjects || [];
  const semesters = [...new Set(subjects.map(subject => subject.semester_number))].sort((a, b) => a - b);
  const semester = semesters.includes(chosenSemester) ? chosenSemester : semesters[0];
  const semesterSubjects = subjects.filter(subject => subject.semester_number === semester)
    .sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const subject = semesterSubjects.find(item => item.id === chosenSubject) || semesterSubjects[0];
  const papers = subject?.resources.filter(item => item.kind === 'PAPER') || [];

  useEffect(() => {
    if (!revealSubject) return;
    subjectHeading.current?.focus({ preventScroll: true });
    subjectHeading.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setRevealSubject(false);
  }, [subject?.id, revealSubject]);

  function resetDocumentError() { setDocumentError(''); setFailedPath(''); }

  async function openDocument(path: string) {
    if (pendingPath) return;
    resetDocumentError(); setPendingPath(path);
    // Reserve the new tab during the click so async authorization does not trigger popup blocking.
    const preview = window.open('about:blank', '_blank');
    if (preview) preview.opener = null;
    try {
      const result = await api<{ url?: string; download_path?: string; filename?: string; format?: string }>(path);
      let url = result.url;
      if (result.download_path) {
        const response = await request(result.download_path);
        url = URL.createObjectURL(await response.blob());
        const objectUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 300000);
        if (result.format === 'DOCX') {
          preview?.close();
          const link = document.createElement('a');
          link.href = url; link.download = result.filename || 'question-paper.docx';
          document.body.append(link); link.click(); link.remove();
          return;
        }
      }
      if (!url) throw new Error('The document is not available. Please try again.');
      if (preview && !preview.closed) preview.location.replace(url);
      else window.location.assign(url);
    } catch (error) {
      preview?.close(); setFailedPath(path);
      setDocumentError(error instanceof Error ? error.message : 'Unable to open this document. Please try again.');
    } finally { setPendingPath(''); }
  }

  const sections: { id: Section; title: string; icon: typeof BookOpen; count?: number }[] = [
    { id: 'syllabus', title: 'Syllabus', icon: BookOpen },
    { id: 'papers', title: 'Question papers', icon: FileText, count: papers.length },
  ];

  return <div className="study-resources">
    <PageHeading eyebrow="YOUR ACADEMIC LIBRARY" title="Study Resources">Your published syllabi and released question papers, organized by subject.</PageHeading>
    {catalog.error && <ErrorMessage message={catalog.error} retry={catalog.reload}/>}
    {catalog.loading && <section className="panel study-resources-loading" role="status"><LoaderCircle size={22} className="study-resources-spinner"/> Loading your academic library…</section>}
    {catalog.data?.status === 'unavailable' && <LibraryEmpty title="Academic details need review" message={catalog.data.message || 'Ask your institution to check your student profile or enrollment.'}/>}
    {catalog.data?.status === 'ready' && !subjects.length && <LibraryEmpty title="Your library is getting ready" message="Your institution has not added subjects for your program and branch yet. Check back once your subjects are set up."/>}
    {subject && <>
      <section className="panel study-resources-selectors" aria-label="Choose a subject">
        <div className="study-resources-filter-intro"><span className="study-resources-icon"><GraduationCap size={21}/></span><div><strong>Explore your subjects</strong><p>Browse any semester in your program.</p></div></div>
        <label>Semester<select value={semester} onChange={event => { setChosenSemester(Number(event.target.value)); setChosenSubject(''); resetDocumentError(); }}>{semesters.map(value => <option key={value} value={value}>Semester {value}</option>)}</select></label>
        <label>Subject<select value={subject.id} onChange={event => { setChosenSubject(event.target.value); resetDocumentError(); }}>{semesterSubjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </section>
      <SemesterOverview subjects={semesterSubjects} selectedId={subject.id} onSelect={id => {
        setChosenSubject(id); resetDocumentError(); setRevealSubject(true);
      }}/>
      <section className="panel study-resources-workspace" aria-label={`${subject.name} resources`}>
        <header className="study-resources-subject">
          <div><div className="study-resources-context"><span>{subject.code}</span><span>Year {subject.year_number}</span><span>Semester {subject.semester_number}</span></div><h2 ref={subjectHeading} tabIndex={-1}>{subject.name}</h2></div>
          <span className="study-resources-availability"><FolderOpen size={15}/>{papers.length} {papers.length === 1 ? 'resource' : 'resources'}</span>
        </header>
        <nav className="study-resources-nav" aria-label="Resource sections">{sections.map(item => <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => setSection(item.id)}><item.icon size={17}/>{item.title}{item.count !== undefined && <span>{item.count}</span>}</button>)}</nav>
        <div className="study-resources-content">
          {documentError && <ErrorMessage message={documentError} retry={pendingPath ? undefined : () => void openDocument(failedPath)}/>}
          {section === 'syllabus' && <SyllabusSection key={subject.id} subject={subject} pendingPath={pendingPath} open={openDocument}/>}
          {section === 'papers' && <ResourceSection key={subject.id} title="Question papers" description="Papers generated by your institution and released for student use." empty="No generated papers have been released for this subject yet. Your institution needs to create a final paper and release its student copy." items={papers} pendingPath={pendingPath} open={openDocument}/>}
        </div>
      </section>
    </>}
  </div>;
}

function SemesterOverview({ subjects, selectedId, onSelect }: { subjects: Subject[]; selectedId: string; onSelect: (id: string) => void }) {
  const first = subjects[0];
  const hasCredits = subjects.length > 0 && subjects.every(subject => typeof subject.credits === 'number' && Number.isFinite(subject.credits));
  const total = hasCredits ? subjects.reduce((sum, subject) => sum + subject.credits!, 0) : null;
  const formatCredits = (value: number | null) => typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
  return <section className="panel study-resources-overview" aria-label="Semester course overview">
    <div className="study-resources-overview-heading"><h2>Year {first.year_number} · Semester {first.semester_number}</h2><p>Select a course to view its syllabus and question papers.</p></div>
    <div className="study-resources-table-scroll" role="region" aria-label="Semester courses" tabIndex={0}>
      <table className="study-resources-course-table">
        <caption>Courses configured for your program and branch</caption>
        <thead><tr><th scope="col">S. No.</th><th scope="col">Course Code</th><th scope="col">Course</th><th scope="col"><abbr title="Lecture hours">L</abbr></th><th scope="col"><abbr title="Tutorial hours">T</abbr></th><th scope="col"><abbr title="Practical hours">P</abbr></th><th scope="col">Credits</th></tr></thead>
        <tbody>{subjects.map((item, index) => <tr key={item.id} className={item.id === selectedId ? 'study-resources-course-selected' : undefined}>
          <td>{index + 1}</td><td className="study-resources-course-code">{item.code}</td>
          <th scope="row"><button type="button" aria-pressed={item.id === selectedId} onClick={() => onSelect(item.id)}>{item.name}</button></th>
          <td>—</td><td>—</td><td>—</td><td>{formatCredits(item.credits)}</td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row" colSpan={3}>Total</th><td>—</td><td>—</td><td>—</td><td>{formatCredits(total)}</td></tr></tfoot>
      </table>
    </div>
    <p className="study-resources-table-note">L: Lecture · T: Tutorial · P: Practical. “—” means information is unavailable. Total credits are shown when all course credits are available.</p>
  </section>;
}

function SyllabusSection({ subject, pendingPath, open }: { subject: Subject; pendingPath: string; open: OpenDocument }) {
  const syllabus = subject.syllabus_content;
  const units = syllabus?.units || [];
  const topics = syllabus?.topics || [];
  const outcomes = syllabus?.cos || [];
  const path = `/api/student/study-resources/syllabus/${encodeURIComponent(subject.syllabus_id || '')}/document`;
  if (!subject.syllabus_id) return <LibraryEmpty title="Syllabus coming soon" message="Your institution has not published a syllabus for this subject yet."/>;
  return <>
    <div className="study-resources-section-heading"><div><h3>Your course at a glance</h3><p>{units.length} {units.length === 1 ? 'unit' : 'units'} · {topics.length} topics · {outcomes.length} learning outcomes</p></div><div className="study-resources-syllabus-actions"><span className="study-resources-published">Published · v{subject.syllabus_version}</span>{subject.document_filename && <button className="button secondary" disabled={Boolean(pendingPath)} onClick={() => void open(path)}>{pendingPath === path ? <LoaderCircle size={16} className="study-resources-spinner"/> : <ArrowUpRight size={16}/>} {pendingPath === path ? 'Opening…' : 'Open syllabus'}</button>}</div></div>
    {!subject.document_filename && <p className="study-resources-inline-note"><BookOpen size={15}/>Read the published syllabus below. A separate document is not available.</p>}
    {!units.length && !outcomes.length ? <LibraryEmpty title="Syllabus details are coming soon" message="Your institution has published this syllabus, but has not added units or learning outcomes yet."/> : <div className={`study-resources-syllabus-grid${!units.length || !outcomes.length ? ' study-resources-single-column' : ''}`}>
      {units.length > 0 && <div className="study-resources-units"><div className="study-resources-label"><Layers size={16}/><h4>Units & topics</h4><span>{units.length} units</span></div>{units.map((unit, index) => {
        const unitTopics = topics.filter(topic => topic.unit_id === unit.id);
        return <details className="study-resources-unit" key={unit.id} open={index === 0}><summary><span className="study-resources-unit-code">{unit.code}</span><span className="study-resources-unit-title"><strong>{unit.title}</strong><small>{unitTopics.length} {unitTopics.length === 1 ? 'topic' : 'topics'}</small></span><ChevronDown size={18}/></summary><ol>{unitTopics.length ? unitTopics.map(topic => <li key={topic.id}>{topic.title}</li>) : <li>Topics have not been added to this unit yet.</li>}</ol></details>;
      })}</div>}
      {outcomes.length > 0 && <aside className="study-resources-outcomes"><div className="study-resources-label"><GraduationCap size={18}/><h4>What you’ll learn</h4></div><p>By the end of this course, you’ll be able to:</p><ol>{outcomes.map(outcome => <li key={outcome.id}><span>{outcome.code}</span><p>{outcome.title}</p></li>)}</ol></aside>}
    </div>}
  </>;
}

function ResourceSection({ title, description, empty, items, pendingPath, open }: { title: string; description: string; empty: string; items: Resource[]; pendingPath: string; open: OpenDocument }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = items.filter(item => [item.title, item.description, item.filename, item.exam_year, item.exam_session].join(' ').toLocaleLowerCase().includes(normalizedQuery));
  return <>
    <div className="study-resources-section-heading"><div><h3>{title}</h3><p>{description}</p></div>{items.length > 0 && <label className="study-resources-search"><Search size={17}/><input type="search" aria-label={`Search ${title.toLowerCase()}`} placeholder="Search documents…" value={query} onChange={event => setQuery(event.target.value)}/></label>}</div>
    {!items.length ? <LibraryEmpty title="No documents yet" message={empty}/> : !visible.length ? <div className="study-resources-empty"><Search size={28}/><h3>No matching documents</h3><p>Try a different title, year, or keyword.</p><button className="button secondary small" onClick={() => setQuery('')}>Clear search</button></div> : <div className="study-resources-files">{visible.map(item => {
      const path = documentPath(item.id);
      const format = item.filename.split('.').pop()?.toUpperCase() || 'FILE';
      return <article key={item.id}>
        <div className="study-resources-file-top"><span className="study-resources-file-icon"><FileText size={23}/></span><div className="study-resources-file-badges"><span>{format}</span>{item.exam_year && <span>{item.exam_year}</span>}</div></div>
        <h4>{item.title}</h4>
        {item.exam_session && <p className="study-resources-file-session">{item.exam_session}</p>}
        {item.description && <p className="study-resources-file-description">{item.description}</p>}
        <div className="study-resources-file-footer"><span title={item.filename}>{item.filename}</span><button className="button secondary" disabled={Boolean(pendingPath)} aria-label={`Open ${item.title}`} onClick={() => void open(path)}>{pendingPath === path ? <LoaderCircle size={15} className="study-resources-spinner"/> : <ArrowUpRight size={15}/>} {pendingPath === path ? 'Opening…' : 'Open document'}</button></div>
      </article>;
    })}</div>}
  </>;
}

function LibraryEmpty({ title, message }: { title: string; message: string }) {
  return <div className="study-resources-empty"><BookOpen size={30}/><h3>{title}</h3><p>{message}</p></div>;
}
