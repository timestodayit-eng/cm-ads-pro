# Coastal Ads Command Center 0.3 - COMPLETE NEW INSTALL

This is the ENTIRE React + Express + MySQL source project, not a patch. For a clean install, follow this guide IN ORDER. Do NOT use older Creative International / bottol databases, administrator SQL or upgrade scripts. The version is 0.3.0; the *fresh-install bundle* repackages that code with one combined SQL import and this guide.

## 0. What this version really does

- Login, initial super-admin setup, MySQL persistence and 12 mapped Meta accounts.
- Meta Facebook OAuth connection and read-only insights (requires correct Meta app permissions/credentials and real-world verification).
- Direct 1 GiB video or smaller image upload from the browser to your private Cloudflare R2 bucket: Media Library, progress, pause/resume, and attachment to campaign drafts.
- Call vs website destination settings, captions/headlines, configurable starting budget and increases across selected accounts, per-account overrides, ad-set-per-content planning.
- Account overview / spend / available billing information *when Meta exposes it*, hourly reporting and conversion estimates (not a guaranteed real-time or completed-call feed).
- Automatic sync settings (5-1440-minute cadence) using a separate Hostinger Cron Job.
- Read-only AI performance reports using a server-side OpenAI API key.

**NOT IMPLEMENTED:** actually publishing, changing or turning on Meta campaigns. The app saves drafts; `/api/publish` intentionally returns HTTP 501. Never assume the existence of the Call Ad field makes a live Call Ad.

## 1. Create a new PRIVATE GitHub repository

Suggested name: `coastal-ads-command-center`.

Unzip this download **on your computer**. Upload the INSIDE contents, not the ZIP, directly to your repository root. Make sure root `server.js`, `package.json`, `client/`, `server/`, `shared/`, `sql/`, `.github/` are visible. Do not create an extra nested folder, and do not upload any credentials, `.env`, or media files. In Mac Finder press Command+Shift+Period to show hidden dotfiles.

Before deployment, in GitHub > Actions, execute `Build and verify`. It may create a lockfile for the tested release. Do not mistake its results for live Meta/Hostinger confirmation.

## 2. Create a NEW database in Hostinger

In hPanel create a new MySQL database and a dedicated database username/password. Open phpMyAdmin, **select this NEW EMPTY database**, choose Import, and upload:

`sql/FRESH-INSTALL-v0.3.sql`  <-- just ONE SQL file

**Do not also import** `001-initial.sql`, `002-media-finance.sql`, `003-monitoring.sql`, or `UPGRADE-TO-0.3.sql` into this same new database: their contents are already included in the combined file.

Confirm that tables such as `users`, `app_locks`, `ad_accounts`, `media_assets`, `workspace_settings`, and `account_sync_state` exist. No admin email/password is seeded; `/setup` creates the first administrator securely.

## 3. Hostinger: configure the environment variables

For your currently mentioned domain, set:

```
NODE_ENV=production
APP_ORIGIN=https://pro.coastalmanpoweragency.com
DB_HOST=YOUR_REAL_MYSQL_HOST
DB_PORT=3306
DB_NAME=YOUR_NEW_FULL_MYSQL_DATABASE_NAME
DB_USER=YOUR_NEW_FULL_MYSQL_USERNAME
DB_PASSWORD=YOUR_NEW_MYSQL_PASSWORD
DB_SSL=false
SESSION_SECRET=UNIQUE_RANDOM_32_PLUS_CHARACTERS
FIRST_ADMIN_SETUP_SECRET=ANOTHER_UNIQUE_RANDOM_32_PLUS_CHARACTERS
TOKEN_ENCRYPTION_KEY=EXACTLY_64_RANDOM_HEX_CHARACTERS
MONITOR_ENABLED=false
```

For `APP_ORIGIN`, use the HTTPS origin of your *actual new deployed domain*: no path, no trailing `/`. The sample above is only for `pro.coastalmanpoweragency.com`. Copy your complete Hostinger database name/username including the hPanel prefix. Only set `DB_HOST=127.0.0.1` if Hostinger confirms the Node app can reach the database on that address; otherwise use the assigned hostname. Generate independent secrets with `tools/secret-generator.html`, opened locally. Keep secrets out of screenshots/GitHub. Node server receives `PORT` automatically; do not override it.

## 4. Deploy GitHub source as an EXPRESS application

| Hostinger setting | Value |
| --- | --- |
| Framework | Express / Node.js web app |
| Branch | main |
| Root directory | `./` |
| Entry file | `server.js` |
| Node version | 22.x (>= 22.12) |
| Package manager | npm |
| Build command (if shown) | `npm run build` |

Use your NEW repository. The frontend `dist/` is built at install/build time; this is NOT a React-only static deployment. `server.js` includes the Hostinger `require()`/ESM startup compatibility fix. Wait for the deployment to complete, then test:

- `https://YOUR-DOMAIN/api/health` -> `ok:true`, `frontend:true`
- `https://YOUR-DOMAIN/api/ready` -> `database:true`, `upgradeSchema:true`, and eventually `ready:true`

Do not copy any placeholder into a production variable literally.

## 5. Create the FIRST admin (no terminal)

Open `https://YOUR-DOMAIN/setup`. Enter your name, email, a unique 14+ character password, and the **FIRST_ADMIN_SETUP_SECRET** value. It is NOT your normal login password. Only create admin once. Then REMOVE the setup secret from Hostinger and restart the app. Sign in using the email and password you created.

## 6. Connect Meta AFTER admin/login/database work

Add in Hostinger:

```
META_APP_ID=REAL_APP_ID
META_APP_SECRET=REAL_APP_SECRET
META_CONFIG_ID=REAL_FACEBOOK_LOGIN_FOR_BUSINESS_CONFIGURATION_ID
META_API_VERSION=REAL_SUPPORTED_vNN.0
META_REDIRECT_URI=https://YOUR-DOMAIN/api/meta/callback
```

The redirect URI must be registered exactly in your Meta app. Set the *actual version* (e.g. format `vNN.0`), not a placeholder. Do not paste an access token: the OAuth flow manages tokens. Grant appropriate permissions to real ad accounts; published-app status alone does not guarantee connection. Log in -> Meta accounts -> Connect Facebook -> Discover -> select up to 12 -> Save mapping -> Sync insights. Test ONE account first.

## 7. Enable actual browser video/image uploads (Cloudflare R2)

Create a **PRIVATE** R2 bucket and bucket-scoped S3 credentials. In Hostinger set:

```
R2_ACCOUNT_ID=YOUR_32_HEX_R2_ACCOUNT_ID
R2_ACCESS_KEY_ID=YOUR_R2_S3_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_R2_S3_SECRET_ACCESS_KEY
R2_BUCKET=YOUR_PRIVATE_BUCKET_NAME
MEDIA_MAX_VIDEO_BYTES=1073741824
MEDIA_STORAGE_QUOTA_BYTES=53687091200
```

In the bucket CORS settings apply `storage-config/r2-cors.json` using your actual HTTPS origin. Set a lifecycle rule aborting incomplete multipart uploads after 7 days. Restart the app, open **Content Library -> Test storage connection**, upload a small JPG first, then a video. Large files go browser-to-R2 via signed multipart upload, not through MySQL or Hostinger's Express request body. Meta still needs a separate future publishing feature.

## 8. Enable five-minute auto-sync after Meta connection works

Set `MONITOR_ENABLED=true` and configure one scheduler. In **Settings -> Automatic sync & reporting** select auto sync and interval=5 minutes (or any whole number 5-1440). The setting persists in MySQL.

Hostinger cron: hPanel -> Advanced -> Cron Jobs; schedule **once each minute** to wake the runner, which will only sync when due based on your 5-minute setting. The exact command uses your deployment's filesystem path and the `--env-file` argument; see `UPGRADE.md` section E as a TEMPLATE only and check with Hostinger for your actual path. If you cannot use Hostinger cron, the optional GitHub schedule is a fallback; configure only ONE scheduler initially. Without a scheduled runner, an interval setting alone does not automatically sync.

Meta API reporting is not a constant true real-time feed; account balances depend on funding type, Meta insights can be delayed, and some call outcomes require separate measurement. Do not present inferred calls as confirmed completed calls.

## 9. AI reporting is optional

Once actual ad metrics have been synced, configure `OPENAI_API_KEY` server-side, optionally `OPENAI_MODEL`, then generate a manual report. It summarizes the stored metrics; it does not automatically alter budgets, switch off ads or publish campaigns. API usage is billed separately. Do not use `VITE_OPENAI_API_KEY`.

## 10. Troubleshooting and release checks

- `ENOTFOUND` on `/setup`: DB_HOST DNS/hostname. Not an admin-password problem.
- `AUTH_REQUIRED` on `/api/auth/me` before login: expected.
- `META_NOT_CONFIGURED`: check all Meta fields, correct URL and 64-hex encryption key; confirm `/api/settings` configuration after admin login.
- `Frontend build missing`: inspect `npm install` / `postinstall` / Vite build log and verify the latest GitHub commit deployed.
- `Storage disabled` / CORS: check R2 credentials, private bucket CORS origin, and newly installed schema.
- `Jobs queued forever`: ensure cron is actually installed, `MONITOR_ENABLED=true`, and automatic sync is enabled from Settings.
- `/api/publish` returns 501: **expected**; live Meta ads publishing is not present in this release.

Review `README.md`, `UPGRADE.md` for detailed R2/cron logic, and `docs/VALIDATION.md` for test scope. Source unit tests are not a substitute for testing your own MySQL, Meta account and storage permissions.
