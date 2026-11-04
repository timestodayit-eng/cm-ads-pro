# Ads Command Center v0.6 - Easy Ads setup and publishing diagnostics

This is a GitHub-ready **source** package. It has not been tested against your actual Facebook / Meta ad accounts and does not include a compiled `dist` directory. GitHub Actions must build and verify it before you deploy.

## What changed

- **Easy Ads Setup** tab: multi-account selection, videos/images from the existing Media Library, caption/headline, call or website destination, account budget rule, single shared Facebook Page ID with optional account overrides.
- The system validates and saves a normal existing campaign draft, then previews actual PAUSED Meta creation before a separate explicit confirmation.
- **Publishing health check** (`GET /api/publish/readiness`, authenticated) explains missing SQL tables, Meta OAuth settings, connection, R2 and `PUBLISH_ENABLED` instead of an unhelpful generic message.
- Optional **Facebook Page picker** (`GET /api/meta/pages`, authenticated) uses the connected Login for Business permissions. If the Page is not listed, enter its authorized ID manually.
- Click-to-call ad sets explicitly request a `PHONE_CALL` destination and authorized Page (best-effort form improvement; verify current API/account support with a one-account test).
- Publishing Progress shows per-account stages, Meta Campaign IDs, safe errors and a manual background-job processing button.
- Existing advanced Campaign Workspace, AI Command Center, Publishing Center, unlimited mapped accounts, custom reporting, panel naming and legacy reports are preserved.
- This release adds **no new database tables or required environment keys** compared with v0.5.

## Upgrade existing v0.5 (no data reset)

1. Back up your current production MySQL database and GitHub repository/commit.
2. Extract the ZIP and upload the **contents** of the folder into your GitHub repository root, replacing the v0.5 source. Do not upload `.env` or production secrets.
3. Check GitHub Actions > `Build and verify` (runs node checks, tests, Vite build and optional MySQL integration tests). Fix any reported failures before production deployment.
4. Keep your existing MySQL data. **There is NO v0.6 SQL migration**. If the `/api/ready` result still shows `publishingSchema:false`, back up the database and check whether `sql/004-publishing.sql` was ever installed; import it **once** only if missing. Your v0.5 tables should remain intact.
5. Redeploy on Hostinger Express/Node 22 using `server.js`, root `./`. Keep `APP_ORIGIN=https://proads.smenterpriserl1987.com` and `META_REDIRECT_URI=https://proads.smenterpriserl1987.com/api/meta/callback` if that is your live domain. Do not add a trailing slash to APP_ORIGIN. Update the Meta app's allowed OAuth redirect as well.
6. Open `/api/ready`: check database, publishing, reports, branding and frontend are all true. Sign in and open `Easy Ads Setup` > Publishing health check.
7. Verify Meta Account connection, `ads_management` permission, authorized Page access, media availability and R2 bucket CORS allows the **exact live site origin**. This page cannot guarantee remote Meta eligibility.
8. Keep `PUBLISH_ENABLED=false` while checking the migration and permissions. For the **first** deliberately approved PAUSED test in **one** account, enable `PUBLISH_ENABLED=true` in Hostinger, restart, then run one small test. It creates Meta objects, but all are intended to be PAUSED. Check Meta Ads Manager directly for results and duplicates.
9. Publishing is queued. Configure your existing protected scheduled `/api/jobs/tick` call with the private JOB_RUNNER_SECRET or click `Process next queued steps` in the Easy Ads screen. Without running the job queue, the ad creation will remain `queued`.
10. Keep `ACTIVATION_ENABLED=false` until the one-account paused test has succeeded and you are ready for spending. Activation is intentionally separate in Publishing Center and requires Super Admin approval.

**Do not blindly retry** a failed `needs_review` account. A network timeout can mean Meta created an object although your browser did not receive the result. Inspect the actual Meta Campaign IDs and Ads Manager first.

## If you still cannot create a campaign

Open `Easy Ads Setup` > Publishing health check. It shows local blockers. For a failed account, open `Publishing Progress` or `Publishing Center` and record **error_code**, **status**, and **stage**. Keep API tokens, session cookies and signed upload URLs private. `META_WRITE_*` errors can reflect permissions, budget minimums, unsupported creative formats, special employment-ad rules, Meta billing or audience eligibility. These require an actual remote Meta API test; a source-unit-test pass does not prove ad creation.

## New installation on an empty database

Follow `FRESH-INSTALL.md` and import `sql/FRESH-INSTALL-v0.5.sql` only into a **new empty** MySQL 8 database. v0.6 uses the same schema as v0.5. Never use fresh-install SQL on an existing populated database.

## Limitations

- Calls are not guaranteed by CTA clicks. Click-to-call destination eligibility varies by account/objective/placement. This version does not automate verification of Meta approval or billing status.
- All selected accounts must have the same currency for a single draft; mixed currencies need separate campaigns.
- Only Bangladesh broad-age employment targeting and website click/view destinations are implemented in the publisher; do not promise other targeting/options until added and tested.
- No arbitrary 12-account cap in the client, but Meta rate limits, Hostinger runtime, payload sizes and job-runner capacity still apply.
- The `PUBLISH_ENABLED` and `ACTIVATION_ENABLED` variables are deliberate server safety controls, not defects to bypass.
