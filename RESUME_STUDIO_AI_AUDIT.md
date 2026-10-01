# Resume Studio AI integration audit — 2026-10-01

## Runtime flow

The public conversational endpoints now use the configured model with the current owned resume and persisted conversation. The model returns explicit content edits with section/entry IDs and source evidence. The server validates the entire draft, checks factual support separately, sanitizes rich text, and retains existing IDs, presentation, photo, visibility and order. New entries receive server-generated IDs. Invalid drafts get one bounded repair attempt; provider or validation failures are explicit errors, never offline AI responses.

The project revision and conversation are committed in one transaction, with both project revision and conversation version checks. Only then is the assistant response delivered. A failed transaction leaves both unchanged. Manual edits made between chat turns become the next turn's current context. Closed conversations cannot mutate documents.

The frontend flushes pending saves and sends the current revision. Late responses cannot replace a different selected resume or overwrite edits made while AI was processing. Returned content updates the editor, server-rendered preview and saved revision. Tool proposals retain their existing accept/reject/apply workflow and atomic application.

## Connections and evidence

| Feature | Frontend handler | Production backend route | Storage/implementation | Verification |
| --- | --- | --- | --- | --- |
| Start/resume chat | `startConversation` | `POST /resumes/{id}/interviews` | Owned project, model greeting, persisted interview | Authenticated isolated API |
| Natural resume editing | `postConversationMessage` | `POST /interviews/{id}/messages` | Model context, validated edits, atomic project/revision/interview transaction | Add project, shorten, skills, summary, experience rewrite, role tailoring, ATS keywords, removal |
| Previous messages | Same | Same | Persisted messages plus current document | Follow-up shortening and correction tests |
| Stage controls | `selectConversationStage` | Same messages endpoint | Model chooses topic, no scripted response | Browser stage test |
| Edit answer | `editAnswer` | `POST /interviews/{id}/messages/{index}/edit` | Correct current content without rewinding unrelated later edits | Shared validated transaction; focused route tests |
| Review | `runAI` | `POST /resumes/{id}/ai/review` | Configured model, grounded proposal and AI run | Actual model/API result |
| Summary | `runAI` | `POST /resumes/{id}/ai/summary` | Model-generated summary, factual validation, proposal | Actual generation, acceptance and application |
| Rewrite | `runAI` | `POST /resumes/{id}/ai/rewrite` | Selected current field, model rewrite, proposal | Actual generation, acceptance and application |
| Polish | `runAI` | `POST /resumes/{id}/ai/polish` | Existing polish pipeline and model text operations | Actual generation, acceptance and application |
| Skills | `runAI`, `addConfirmedSkills` | `POST /resumes/{id}/ai/skills`, `/ai/add-skills` | Dynamic suggestions; student-confirmed insertion | Model/API and revision tests |
| Spelling | `runAI` | `POST /resumes/{id}/ai/spelling` | Model corrections restricted to source substrings | Actual model/API result |
| Job match | `runAI` | `POST /resumes/{id}/ai/job-match` | Model analysis plus explicitly mechanical ATS scoring | Actual model/API result; fixed stale imports |
| Tailor | `runAI` | `POST /resumes/{id}/ai/tailor` | Current resume, supplied job description, grounded proposal | Actual generation, acceptance and application |
| Proposal decisions | `decideProposal` | `POST /proposals/{id}/{accept,reject,apply}` | Owned proposal, source revision, atomic application | Focused database tests and actual API |
| Preview | Preview effect | `POST /resumes/{id}/preview` | Existing authoritative HTML renderer | Actual browser preview after chat change |
| Persistence/history | Save/reload/history handlers | `GET /resumes/{id}`, `/revisions` | Existing projects and revisions | Actual API read-back and browser reload |
| Export | `exportResume` | `POST /resumes/{id}/export?kind=...` | Existing PDF/DOCX/HTML exporters | Nonempty actual exports |

All route paths above are under `/api/student/resume-studio`. Existing student authentication, tenant ownership and CSRF middleware remain authoritative. No schema migration, second resume store, renderer, photo store, mock runtime API or localStorage resume replacement is introduced.

## Findings corrected

- Chat previously used scripted interview prompts and model-assisted extraction, rather than natural editing.
- Exposed AI tools could silently return deterministic fallback content; public Resume Studio operations now fail explicitly when the real provider is unavailable.
- Skills used a fixed suggestion list; spelling used an offline typo table.
- Job-match/polish helpers retained invalid standalone `app.ai`/`app.schemas` imports.
- Separate project/chat writes could save a resume without its matching conversation response.
- Chat could be blocked permanently by a manual edit between turns, and message submission did not enforce closed-session status.
- Late AI responses could overwrite the selected resume or unsaved edits.
- A section click during initial deep-link loading could select the latest resume instead of the requested resume.

## Card layout

All cards reserve the same thumbnail footer and metadata height. The Main Resume badge occupies the bottom-right thumbnail footer, outside rendered document content. Its purple outline does not change the box dimensions. Actual browser measurements at 1440px: all cards 210 × 312px, including the linked Main Resume.

## Verification boundaries

Automated backend tests and authenticated model/API/browser mutations used only `voicedots_test` at `127.0.0.1:55432` with the existing `.venv-test` and database safety guard. Actual model calls used the already configured production AI provider against isolated test resumes. No production resume data was created or changed for these checks.

Authenticated production Student UI/AI smoke checks require a valid existing Student test-account session. Bundle availability and API health/CORS checks alone do not establish authenticated production feature success.
