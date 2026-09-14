# VoiceDots student dashboard

React + TypeScript + Vite frontend, following the separate frontend/backend layout of the client dashboard. Uses the existing website's VoiceDots SVG, Inter/Outfit fonts, violet palette, light/dark modes, and responsive navigation.

## Local development

```bash
cp .env.example .env
npm ci
npm run dev
```

Open `http://localhost:5175`. Start the student backend on port 8005 (see its README). Vite proxies `/api` and `/ws` to that backend, including cookie authentication and WebSocket upgrades. Use the same hostname consistently throughout a login session.

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

## Production at students.voicedots.io

Set these Vercel build variables and deploy:

```dotenv
VITE_WEBSITE_URL=https://voicedots.io
VITE_API_URL=https://student-api.voicedots.io
```

Remove `STUDENT_API_PROXY_TARGET` from Vercel; it only configures the local development proxy. The build emits `student-api-config.js` so the retained interview runtime uses the same API origin and connects directly to its `wss://` endpoint. Report links also target that API. Vercel rewrites cover the React dashboard routes.

The backend must allow `https://students.voicedots.io` in `CORS_ALLOWED_ORIGINS`. Both HTTPS domains share the same site, so Strict cookies remain valid; sessions stay host-only and HttpOnly. The authenticated student identity response supplies the CSRF token to the frontend because JavaScript cannot read the API host's cookie. Unrelated Vercel preview domains are not enabled for authenticated use.

The retained college admin portal is served at `https://student-api.voicedots.io/admin-panel/`; its existing authentication uses that same API origin. Alternatively, serving the entire frontend through the backend with `VITE_API_URL` empty still works.
