# Coastal Ads Command Center v0.5 - GitHub / Hostinger

## Upgrading your existing v0.4 site (recommended)

1. Back up your full MySQL database and GitHub repository. **Do not delete admin, Meta credentials, R2 objects or existing data.**
2. Extract the v0.5 ZIP and upload the **contents** to your GitHub repository root. Do not upload only the ZIP. GitHub Actions > **Build and verify** must pass first. The repository should show `server.js`, `package.json`, `client/`, `server/`, `shared/` and `sql/` directly at its root.
3. In Hostinger > Databases > phpMyAdmin, select your existing Coastal database and import `sql/UPGRADE-TO-v0.5.sql` once (equivalent to importing `005` then `006`). These only add the v0.5 tables. Do not use the fresh-install SQL on an active database.
4. Hostinger Node.js app: Express, Node 22.x (at least 22.12), root `./`, entry `server.js`, build `npm run build` if exposed. Deploy the checked GitHub commit. Keep your existing valid environment secrets.
5. Verify `https://YOUR-APP-DOMAIN/api/health` and `https://YOUR-APP-DOMAIN/api/ready`. `/api/ready` should show `customReportSchema:true` and `brandingSchema:true` with working DB and frontend.
6. Sign in: **Custom reports** in sidebar; **Settings -> Panel name** is editable by Super Admin. Test with a small report first, then more accounts. Your existing campaign data and users remain in place.

## Fresh installation on an empty database

1. Create a new, private GitHub repository and an empty MySQL 8 database.
2. Upload the extracted contents to the repository root.
3. phpMyAdmin: import **only** `sql/FRESH-INSTALL-v0.5.sql` into the new empty database.
4. Read `.env.example`; supply your own secrets in Hostinger (never GitHub). Set `APP_ORIGIN` to your exact HTTPS origin with no trailing slash. Keep `PUBLISH_ENABLED=false`, `ACTIVATION_ENABLED=false` until testing.
5. Hostinger: Deploy Express, Node 22.x, root `./`, entry `server.js`; verify health and readiness, then open `/setup` to create first administrator (no default password). Remove `FIRST_ADMIN_SETUP_SECRET` after setup and restart.
6. Configure Meta OAuth, R2 and scheduler separately according to `START-HERE.md` and check each integration. No actual advertisements should be activated until real Meta authorization, policy validation and paused-publish tests succeed.

## No new secrets are needed for v0.5 panel name or custom reporting.

## Performance and reporting caveats

For many accounts, selected-account results can take longer and may hit Meta/Hostinger request/time limits. A custom report has 93-day / 100,000 source-row / 25,000 grouped-row per-request safety limits but **no arbitrary account-count limit**. Currency values are not totaled without rates. The displayed report uses last synced Meta data, with its actual timestamps.
