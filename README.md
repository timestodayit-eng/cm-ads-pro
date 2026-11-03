> **New installation?** Follow [FRESH-INSTALL.md](FRESH-INSTALL.md), import **only** [sql/FRESH-INSTALL-v0.3.sql](sql/FRESH-INSTALL-v0.3.sql) into a new database, and create the first admin at `/setup`. This bundle contains the full project.

# Coastal Manpower Ads Command Center - 0.3.0

Complete React + Express + MySQL source. Single-origin Hostinger Node.js deployment,
root `server.js`, GitHub source workflow. Coastal branding; up to twelve mapped Meta
ad accounts. This release adds actual private content uploads and configurable
all-account monitoring. It is not a finished live ad publishing platform.

**Existing installation? Read UPGRADE.md first.** Keep existing users/database/secrets.
**New installation? Read START-HERE.md.** No default login/password is supplied.

## Included implementation

| Module | Implementation |
| --- | --- |
| Content upload | File picker, progress, retries, pause/resume, signed multipart R2 upload |
| Media library | Private image/video preview, resume after selecting the original file, reuse in drafts |
| Files | Videos up to 1 GiB; images up to 30 MiB; server completion validation |
| Destinations | Call or Website; phone/URL overrides; website goal and Pixel/Dataset input |
| Budget rules | Starting amount, increment between accounts, ordering, overrides, ceiling, scope |
| Automatic sync | Default 5 minutes, configurable 5-1440 in Settings; all mapped accounts |
| Scheduler | Finite Hostinger cron, MySQL runner lease, active-account dedupe, retry/backoff |
| Freshness | Last attempt/success, next due, per-account errors, scheduler heartbeat |
| Metrics | Today, yesterday, recent days; closed-hour 12/24-hour UTC windows |
| Metric mapping | All-clicks, link clicks, landing views, lead/call action mapping with nulls preserved |
| Balance totals | Native billing due / spending cap; combined FX estimates with coverage |
| Conversion rates | Manually entered, dated and sourced; no invented or automatic FX rate |
| AI reports | Existing server-side OpenAI Responses integration, read-only advice |
| Security | Existing sessions, CSRF, OAuth state, encrypted Meta tokens, role checks |

Actual R2 credentials/CORS and a Hostinger cron must be configured. Updating the
source cannot create your private bucket or hosting schedule. Do not put keys in
React or GitHub. Media does not pass through the Node.js request body.

## Important data and action boundaries

Five-minute sync means polling Meta; it cannot remove Meta's attribution delays.
Recent-hour views use complete API hour buckets, not event-level rolling minutes.
No synthetic completed calls or leads are manufactured from clicks. Unknown billing
funds are not treated as zero. Currency conversion is a labeled estimate using your
chosen rate, not a change to the account's native currency or actual charges.

Live campaign/ad-set/ad creation, activation, pause/resume and budget writes are not
implemented. `/api/publish` returns 501. The content and conversion form saves a
complete plan without spending money. Policy and destination eligibility must be
validated before implementing a production publishing engine.

## Validation

114 dependency-free tests passed at authoring time, plus server syntax checks and
local JSX transpilation. Full npm install/build/audit and live integrations were
not verified here: npm DNS access failed and browser navigation was blocked.
19 real-MySQL integration tests are included for GitHub CI, not claimed as passed.
See docs/VALIDATION.md. Run the Build and verify workflow before deploying.

## Commands (development/CI)

```
npm install
npm run check
npm test
npm run build
npm run test:integration    # RUN_DB_TESTS=true and a disposable MySQL DB required
npm start
```

`postinstall` runs the Vite build for Hostinger's Express deployment path. Use
`npm install --ignore-scripts` in CI followed by the explicit checks and build.
No top-level await is used in the runtime entry file; all async startup stays
inside its start() function.

Project structure:

```
server.js                  Stable Hostinger entry point
server/                    Express auth, Meta, media, finance, metrics, jobs, settings
client/src/                React UI and actual browser upload client
shared/                    Tested validation, budgets, FX, metrics and scheduling helpers
sql/                       Initial schema and additive upgrade migrations
storage-config/            R2 CORS policy for the Coastal HTTPS origin
scripts/cron.js            Finite all-account job runner
.github/workflows/         Build/integration/audit gate; optional scheduler fallback
UPGRADE.md                 Existing-site deployment instructions
START-HERE.md              Fresh installation instructions
```
