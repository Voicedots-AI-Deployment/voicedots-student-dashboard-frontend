# VoiceDots student dashboard

React + TypeScript + Vite frontend, following the separate frontend/backend layout of the client dashboard. Uses the existing website's VoiceDots SVG, Inter/Outfit fonts, violet palette, light/dark modes, and responsive navigation.

## Local development

```bash
cp .env.example .env
npm ci
npm run dev
```

Open `http://localhost:5175`. Start the student backend on port 8002 (see its README). Vite proxies `/api` and `/ws` to that backend, including cookie authentication and WebSocket upgrades. Use the same hostname consistently throughout a login session.

The website at `http://localhost:5173/interviews` links to this portal automatically in development. In deployed builds, set the website's `VITE_STUDENT_DASHBOARD_URL` to the public root URL of this student service and this frontend's `VITE_WEBSITE_URL` to the marketing website URL. Build-time environment changes require rebuilding.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Authenticated overview, eligible drives, readiness, recent reports, resumable interviews |
| `/login` | Student sign-in / roster account activation |
| `/practice` | Upload or reuse a resume, prepare an interview, answer clarification prompts, recover preparation after refresh |
| `/practice?drive=…` | Server-authoritative placement preparation, with frozen role, JD, duration, and assignment/window gates |
| `/placements` | Eligible opportunities and the student's assignment details |
| `/reports` | Released reports and explicit pending-release states |
| `/growth` | Official placement-readiness evidence, including unassessed areas |
| `/profile` | College-managed identity and editable target-role preference |
| `/interview.html?id=…&session_id=…` | Retained live voice engine, device checks, proctoring, reconnect, completion |
| `/admin-panel/` | Retained college administration UI for rostering, drives, and result release |

All student requests use `X-Portal-Role: student`, HttpOnly session cookies, and the student CSRF token for mutations. No raw auth token is placed in browser storage. Only student display hints and durable preparation identifiers are stored per tab for the voice runtime. Client-dashboard auth is a separate identity system; client credentials do not grant student access.

## Build and test

```bash
npm run build
npx playwright install chromium
npm test
```

The build checks TypeScript before bundling. Playwright mocks the student API to verify browser contracts without writing to a real database or calling AI providers. It covers auth, report release, CSRF/idempotency headers, clarification, recovery after reload, API errors, session expiry, mobile navigation, and light/dark screenshots.

`public/interview.js`, its device-check HTML, PCM worklet, panel assets, and pinned MediaPipe assets were migrated from the standalone interview project. They are intentionally retained together to preserve the existing audio/proctoring protocol. The dashboard itself is React; it does not embed the old portal in an iframe. The preserved college admin UI is independently authenticated.

Serve `dist` through the student backend in production so UI, cookies, audio, and WebSockets share one origin. Hosting this frontend alone on a static host requires a reverse proxy for the student API and WebSockets; a SPA rewrite alone is insufficient.
