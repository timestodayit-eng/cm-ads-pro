**After updating from v0.7.2, read [FIX-v0.7.3.md](FIX-v0.7.3.md).** No new v0.7.3 SQL migration is required; verify your existing Publishing schema.

# Coastal Ads Command Center v0.4 - Start Here

This is complete **source code**, not a verified, turnkey live Meta advertising service. First run GitHub **Actions -> Build and verify** and resolve any failure. The assistant's environment could run JS unit tests but could not install npm dependencies to verify the React production bundle or conduct a real Meta/R2/MySQL integration test.

## New GitHub / Hostinger installation

1. Create a **private** GitHub repository. Extract this ZIP and upload the files *inside* the extracted folder, not the ZIP itself or a second parent folder. At repository root you should see `server.js`, `package.json`, `client`, `server`, `shared`, `sql`, `.github`, `.env.example`.
2. Run GitHub **Actions -> Build and verify**. The workflow must pass *including* React build, dependency audit and MySQL integration checks. Hostinger can redeploy on Git push; disable automatic deploy until checks pass.
3. Create a new, empty MySQL 8+ database. Import **only** `sql/FRESH-INSTALL-v0.4.sql` in phpMyAdmin. Do not import on an existing production database.
4. Configure Hostinger environment variables (see `.env.example`). Do not commit an actual `.env` or any secrets to GitHub.
5. Deploy to Hostinger Cloud as **Express**, Node **22.x** (at least 22.12), root `./`, entry `server.js`, `npm` package manager, build `npm run build` if prompted. Hostinger may install/build as part of the npm lifecycle.
6. Confirm `/api/health` and `/api/ready` show a running server, production frontend and `publishingSchema:true`. Confirm `APP_ORIGIN` equals the exact HTTPS origin of the deployed app, without a trailing slash.
7. Open `/setup` to create the first administrator. Choose a unique password of 14+ characters. Remove `FIRST_ADMIN_SETUP_SECRET` and restart immediately after successful creation.
8. Configure your authorized Meta Business Login app. The app requires `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_API_VERSION`, and the exact `META_REDIRECT_URI=https://YOUR_HOSTNAME/api/meta/callback`. Request `ads_read` for insight syncing and appropriate `ads_management` permission for publishing. A published Meta app does not automatically have advertising write permissions.
9. Connect Facebook in the app, discover and map up to **12** ad accounts. Connect a Page with permission to create ads for each selected ad account. The Publishing Center requests a real numeric Page ID for each account.
10. Set up Cloudflare R2 to hold the large media. Add `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Configure bucket CORS with the **current live app origin** (see `storage-config/r2-cors.json` and adjust the origin). Test a small upload before attempting a 1 GiB file.
11. Configure the optional OpenAI assistant with `OPENAI_API_KEY` and `OPENAI_MODEL`. The AI Command Center proposes campaign settings; it never publishes or activates without a human's explicit approval.
12. Keep `PUBLISH_ENABLED=false` and `ACTIVATION_ENABLED=false` initially. After verified permissions, CORS and setup, set `PUBLISH_ENABLED=true` for an **individual paused test campaign**. Check all Meta objects are PAUSED. Only after that has been verified consider `ACTIVATION_ENABLED=true` with a separate spending approval.
13. The five-minute dashboard sync and publishing queue require an actual Hostinger Cron Job or authenticated GitHub scheduler. Merely setting `MONITOR_ENABLED=true` does not start a process. Configure a single runner with a strong private `JOB_RUNNER_SECRET`. See `docs/API-AND-SOURCES.md` and the existing `scripts/cron.js`. Cron should be tested before any multi-account launch.

## Upgrade an existing v0.3 database

- Back up the production database and take an application snapshot.
- Import **only** `sql/004-publishing.sql` into the existing v0.3 database.
- Preserve the existing `users`, `sessions`, `meta_connections`, `media_assets`, `campaign_drafts`, reports and settings.
- Update source code and add only the new `PUBLISH_ENABLED` and `ACTIVATION_ENABLED` flags as needed. Keep your existing secrets.
- If `/api/ready` shows `publishingSchema:false`, the migration did not complete.

## Important release boundaries

- The server implements real Meta API write calls to CREATE PAUSED campaign/ad-set/ad objects, plus asynchronous activation/pause workflows. These have **not** been tested against your Meta Business account, API version, employment category, ad placements, phone-call eligibility or R2 objects. Test **one authorized account** first.
- The command assistant only prepares a structured plan from user-selected accounts and uploaded content; budget hard caps, existing credentials and the required review are enforced by code.
- Employment/recruitment advertising uses the Employment Special Ad Category as applicable. Do not select Normal just to evade targeting restrictions. Account-specific narrow age targeting is blocked for Employment.
- A video or image uploads separately to Meta for each ad account. The 1 GiB R2 media library exists in v0.3, but Meta may reject an individual file based on its own size, codec, processing or policy constraints.
- The job engine records each step. An ambiguous Graph write outcome is marked `needs_review` to avoid blind duplicate paid campaigns. Manually inspect Meta before recovery.
- Budget is a planned daily budget, not a guaranteed exact Meta billing cap. Currency mixing in a single campaign batch is prohibited. The system must not make unapproved spending decisions.
- AI commands cannot bypass the explicit `CREATE PAUSED ADS` and `ACTIVATE ADS` approvals.

For deeper detail see `docs/PUBLISHING-AND-COMMAND.md`.

## v0.5: Unlimited selection, custom reports, panel name
For existing v0.4 installations, import `sql/005-custom-reports.sql` and `sql/006-workspace-branding.sql` in that order after backing up MySQL. **Do not reset the database or upload the fresh schema to an active database.**
For a new empty database, import `sql/FRESH-INSTALL-v0.5.sql` only. The dashboard now has Custom reports and Settings → Panel name (Super Admin only). No extra API key is needed for CSV custom reports: they use the data already synced from Meta. A large account count can hit Meta API and Hostinger resource limits; background sync uses queued batches. Publishing still requires the two explicit server-side switches and Meta acceptance testing.
