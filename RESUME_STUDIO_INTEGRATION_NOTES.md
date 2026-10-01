# Resume Studio — frontend connection / integration notes

Handoff document for moving the redesigned Resume Studio frontend into the
production Student Portal.

- **Functional baseline:** the production files copied from the server
  (`resume-studio.tsx`, `ResumeDesignSettings.tsx`, `styles.css`, …). These are
  the source of truth for API calls, handlers and the data model.
- **Design baseline:** the Resume Studio handoff bundle. It is the source of
  truth for layout, spacing, typography and UX only.

Nothing in the shipped UI is mocked. Where production lacks a capability the
reference design assumes, production behaviour was kept and the reference
affordance was **not rendered**. No API path below is invented: anything not
evidenced by the production code is written as
`Backend/API contract still to be defined`.

---

## Contents

- [Part 1 — Fully connected (no action needed)](#part-1--fully-connected-no-action-needed)
- [Part 2 — Missing connections](#part-2--missing-connections)
- [Part 3 — Partial connections](#part-3--partial-connections)
- [Part 4 — Deliberate design differences (not gaps)](#part-4--deliberate-design-differences-not-gaps)

---

## Part 1 — Fully connected (no action needed)

These reference features map onto production endpoints that already exist and
are wired in the redesigned UI. **Do not raise tickets for these.**

| Feature | Production call |
| --- | --- |
| Resume list / Overview cards | `GET ${ROOT}/resumes` |
| Create resume (manual and AI chat) | `POST ${ROOT}/resumes` |
| Open resume | `GET ${ROOT}/resumes/{id}` |
| Autosave + conflict handling | `PUT ${ROOT}/resumes/{id}` with `expected_revision`, 409 → conflict banner |
| Rename | `PUT ${ROOT}/resumes/{id}` |
| Duplicate | `POST ${ROOT}/resumes/{id}/duplicate` |
| Delete | `DELETE ${ROOT}/resumes/{id}` |
| Import (PDF / DOCX / TXT) | `POST ${ROOT}/resumes/import` (multipart) |
| Live preview render | `POST ${ROOT}/resumes/{id}/preview` |
| Overview card thumbnails | `GET ${ROOT}/resumes/{id}/preview` |
| Download PDF / DOCX / HTML | `POST ${ROOT}/resumes/{id}/export?kind=` |
| Templates + sample thumbnails | `GET ${ROOT}/templates`, `GET ${ROOT}/templates/{id}/sample` |
| All presentation / design settings | persisted in `project.presentation` via the autosave `PUT` |
| Fit to one page | `POST ${ROOT}/resumes/{id}/fit` (surfaced in Design & templates) |
| AI review / polish / summary / rewrite / skills / spelling | `POST ${ROOT}/resumes/{id}/ai/{operation}` |
| AI job match / tailor | `POST ${ROOT}/resumes/{id}/ai/{job-match\|tailor}` |
| Add confirmed skills | `POST ${ROOT}/resumes/{id}/ai/add-skills` |
| AI proposals: list / accept / reject / apply | `GET ${ROOT}/proposals`, `POST ${ROOT}/proposals/{id}/{accept\|reject\|apply}` |
| AI engine status note | `GET ${ROOT}/ai/status` |
| Conversational builder | `POST ${ROOT}/resumes/{id}/interviews`, `POST ${ROOT}/interviews/{id}/messages`, `/messages/{i}/edit`, `DELETE ${ROOT}/interviews/{id}` |
| Revisions + restore | `GET ${ROOT}/resumes/{id}/revisions`, `POST .../revisions/{rev}/restore` |
| Main Resume ↔ My Profile | `GET /api/student/resume-library`, `GET /api/student/resume-library/{id}/file`, `POST /api/student/resume-library` |
| Verified profile photo | `GET /api/student/profile/photo` for editor contact display; server resolves the canonical photo for preview/export |
| Undo / redo | in-memory snapshot history + the same autosave `PUT` |
| Deep link `?resume=<id>` | `GET ${ROOT}/resumes/{id}` on mount |
| Auth / session | inherited from the production `api` / `request` helpers and `useAuth()` |

### Section and entry reordering — connected, including drag-and-drop

Worth calling out because it is new UI. The redesign adds a drag handle to
section cards and entry rows, backed by `reorderSection` / `reorderEntry`.

No new persistence was invented. Both write through the **existing**
`updateDoc` → autosave path, and `save()` already `PUT`s the whole `document`
— in which `sections` and `entries` are ordered arrays — with
`expected_revision`. Production also already shipped `moveSection` /
`moveEntry` (the up/down arrow buttons), which use that identical path. Drag is
simply another input to an operation production already supports, and the
arrows are retained as the keyboard-accessible equivalent.

**No backend change is required for reordering.**

---

## Part 2 — Missing connections

### 2.1 Click-to-edit directly on the resume preview — connected

The committed production renderer already stamps resume values with stable
`data-edit` keys and posts `{type: "resume-edit", key}` from the sandboxed
preview iframe. The redesigned frontend listens only when the message source is
the active preview iframe, resolves the key against explicit `data-resume-field`
markers, switches to Resume editor, and focuses the matching control. Unknown or
stale keys are ignored; preview messages never mutate or save the document.

Mapped fields include personal details (`p:<field>`), section names
(`s:<section_id>:name`), and entry title, subtitle, body, dates, and location
(`e:<entry_id>:<field>`). No text-based field inference is used.

### 2.2 Preview page count and multi-page presentation — connected

The committed production renderer paginates the preview in the same HTML used
for its document layout, then posts `{type: "resume-preview", pages, height}`.
The frontend validates the active iframe source and bounded numeric metadata,
shows the actual page count with the paper size, and sizes the preview sheet to
the full rendered document height. Missing metadata falls back to one A4 page.
The PDF continues to use the same production document and presentation settings.

### 2.3 “Fit to 1 page” chip in the preview toolbar

#### Feature
A chip in the preview toolbar offering to tighten the layout onto one page,
shown only when the resume actually overflows.

#### Current frontend state
The action is available in **Design & templates**, not in the preview toolbar.

#### Missing connection
Nothing on the backend. Only the *placement* is blocked: without §2.2 there is
no page count to condition the chip on, and showing it unconditionally would be
noise.

#### Existing production equivalent
**Yes — fully working.** `POST ${ROOT}/resumes/{id}/fit` with
`{ target_pages: 1, job_description }`, wired through `fitResume()`,
`applyFit()` and the `onFit` / `fitResult` / `onApplyFit` / `onDiscardFit`
props of `ResumeDesignSettings`.

#### Frontend event
Button click in the preview toolbar.

#### Expected request
Unchanged from the working implementation:
`POST ${ROOT}/resumes/{id}/fit`, body `{ "target_pages": 1, "job_description": "" }`.

#### Expected response
Unchanged: `{ document, presentation, … }`, applied to the draft by `applyFit`.

#### Frontend state affected
Unchanged: `fitResult` is staged for review, then `project.document` and
`project.presentation` on apply.

#### Error behavior
Unchanged: the existing error banner with the retry affordance.

#### Production file waiting for integration
`src/resume-studio.tsx` — `.rs-preview-controls`.

#### Priority
**Low.** The capability is already reachable; only its position differs from
the reference.

#### Safe fallback
The action lives in Design & templates and works there today.

---

### 2.4 Conversational builder: suggested-reply chips — connected

The production interview response stores optional `chips` on assistant
messages. The redesigned frontend renders chips for the latest assistant
message; selecting one fills the answer box and does not send it automatically.
An absent or empty `chips` array renders no suggestions.

### 2.5 Conversational builder: per-turn change confirmation — connected

The production interview response stores `kind: "added"` for assistant
messages that confirm a resume change. The frontend shows an “Added to your
resume” status pill only for those messages. It does not infer a change from a
document diff or message text.

## Part 3 — Verified production connections

### 3.1 Preview endpoint

`POST ${ROOT}/resumes/{id}/preview` renders the current draft and presentation
settings with the committed backend paginator and edit identifiers. The parent
frontend handles page-count and click-to-edit messages from that exact iframe.
The export routes use the same production renderer and current document/template
state. A4 layout and multipage height are exercised by the focused Playwright
suite.

### 3.2 Conversational endpoint

`POST ${ROOT}/resumes/{id}/interviews` and
`POST ${ROOT}/interviews/{id}/messages` return persisted assistant message
metadata. The UI reads `chips` and `kind: "added"` directly; it does not
synthesize suggestions or confirmations.

### 3.3 Profile photo and presentation

`GET /api/student/profile/photo` supplies the authenticated student’s canonical
verified photo. The Resume Studio uses the existing authenticated request
helper for editor contact display. The preview/export backend resolves the
canonical profile photo for rendering in memory, without copying it into the
resume document. Photo shape, position, size, crop, zoom, and visibility are
presentation settings persisted by the existing revision-aware autosave path;
rendering remains in the server HTML renderer shared with export.

## Part 4 — Deliberate design differences (not gaps)

Listed so they are not mistaken for missing work. None requires backend
changes.

| Reference behaviour | Shipped behaviour | Why |
| --- | --- | --- |
| Collapsible section cards with a drill-down editor per entry (`ContentPanel` → `EntryEditor` / `PersonalEditor`) | All fields edited inline in the section card | The production inline form is a superset of the reference’s fields and is what autosave, per-field AI rewrite and the existing tests address. The reference’s card, entry-row, Add Entry and Add Content *styling* was adopted; its navigation model was not. |
| Drag-only reordering | Drag handle **and** up/down buttons | Both on the same production path; the arrows remain the keyboard-accessible route. |
| Visual photo cropper | Crop step meters | Same presentation keys — see §3.4. |
| Drag-and-drop import dropzone | File input / `<label>` upload control | Frontend affordance only; `POST ${ROOT}/resumes/import` is fully wired behind it. Can be added at any time against the existing `upload()` handler. |
| Floating undo/redo pill | `Ctrl/Cmd+Z` and `Ctrl/Cmd+Y` only | `applyHistory` already exists; adding a visible control is UI-only work. |
| Relative edit times (“2 days ago”) | Absolute dates (“9/30/2026”) | Matches the Overview card specification for this work. |
| Toast stack | The single `.rs-notice` status banner | One production notification surface, already wired to every handler’s success and error paths. |
| Standalone shell with its own header, breadcrumb and avatar (`app/Shell.tsx`, `app/TopBar.tsx`) | The real Student Portal sidebar and top header | Required. The production shell owns auth, student identity and photo, the theme control, the hamburger and the breadcrumb. |
| Underline section tabs (`.studio-tab`) | Compact button controls (`.rs-studio-nav`) | The compact treatment is the specification for this work and supersedes the reference’s tabs. |
