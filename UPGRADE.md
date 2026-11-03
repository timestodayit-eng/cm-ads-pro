# Upgrade your existing Coastal app to 0.3.0

This is the complete source project, not a patch-only archive. Keep your existing
Coastal MySQL database, users, session secret, encryption key, Meta connection and
Hostinger domain. Do not reuse the older Creative International `staff` schema.

## A. Back up, then import ONE upgrade file

Back up the existing database in phpMyAdmin and record the current GitHub commit.
Pause automatic Hostinger redeployment while uploading the changed files.

Select the SAME database used in DB_NAME, then import:

    sql/UPGRADE-TO-0.3.sql

It combines migrations 002 and 003. It creates media, finance, monitoring,
hourly-report and settings tables without dropping data. Existing users and tokens
are not reset. For a completely new database, import 001-initial.sql FIRST, then
the upgrade file. Do not run /setup again when you already have an administrator.

## B. Upload the extracted project contents to GitHub

Extract this ZIP locally. Upload the files INSIDE it into the root of your existing
Coastal repository. Include `server`, `shared`, `client`, `sql`, `storage-config`,
`scripts`, `.github`, `package.json`, and root `server.js`.
Never upload the ZIP itself, a real `.env`, videos, or storage credentials.
On macOS use Command+Shift+Period to show hidden files in Finder.

The provided Build and verify workflow installs dependencies, checks syntax and
unit tests, builds Vite, runs MySQL integration tests and audits dependencies.
Do not assume Hostinger waits for it. Deploy the same commit only after it passes.
A generated lockfile and built frontend are available in the workflow's
`coastal-tested-build` artifact. The downloaded source bundle has no installed
node_modules, compiled dist, or verified dependency audit.

## C. Keep these Hostinger settings

| Setting | Value |
| --- | --- |
| Framework | Express |
| Root | ./ |
| Entry file | server.js |
| Node.js | 22.x, at least 22.12 |
| Package manager | npm |
| Build command, if shown | npm run build |

The install lifecycle builds the frontend. Runtime startup does not compile React.
Root server.js preserves the tested fix for LiteSpeed require()/top-level await.
Do not change entry file to `dist` or remove `type: module`.

Keep working DB_*, SESSION_SECRET, TOKEN_ENCRYPTION_KEY, META_* and OPENAI_* values.
For this domain:

    APP_ORIGIN=https://pro.coastalmanpoweragency.com
    META_REDIRECT_URI=https://pro.coastalmanpoweragency.com/api/meta/callback

Do not replace real credentials with the placeholders in .env.example.

## D. Enable ACTUAL content upload (required storage setup)

1. Create a PRIVATE Cloudflare R2 bucket, for example `coastal-ad-content`.
2. Create bucket-scoped R2 S3 credentials with object read/write permissions.
   Use the S3 Access Key ID and Secret Access Key, not a generic Cloudflare bearer token.
3. Add these Hostinger environment variables with their real values:

    R2_ACCOUNT_ID=YOUR_32_HEX_ACCOUNT_ID
    R2_ACCESS_KEY_ID=YOUR_S3_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY=YOUR_S3_SECRET_KEY
    R2_BUCKET=coastal-ad-content
    MEDIA_MAX_VIDEO_BYTES=1073741824
    MEDIA_STORAGE_QUOTA_BYTES=53687091200

4. In the bucket's Settings > CORS policy, paste storage-config/r2-cors.json.
   Change AllowedOrigins only when your actual HTTPS app origin changes. Keep
   the bucket private; CORS is not public access permission.
5. Set an R2 lifecycle rule to abort incomplete multipart uploads after 7 days.
   The app permits resuming an upload for 6 days. The lifecycle avoids forgotten
   storage parts being retained indefinitely.
6. Save environment values, deploy/restart, sign in, open Content library.
7. Use Test storage connection. Then upload a small JPG/PNG as a browser CORS test.
8. Upload a video, pause/resume it, preview it, then choose it in a campaign plan.

Uploads are direct browser-to-R2 in signed 8 MiB parts, with two concurrent parts,
progress and retries. They do NOT stream 1 GiB through Hostinger or MySQL. After
closing the browser, choose the same original file to resume confirmed parts.

Supported: MP4, MOV, WebM (up to 1 GiB); JPG/PNG/WebP (up to 30 MiB). Codecs still
need to be playable by the browser and accepted by Meta in a later publishing
integration. Upload completion checks type signatures, size, ordered parts and
object metadata. It is NOT an antivirus scanner or transcoder.

If the browser reports storage/CORS errors, verify the exact origin, bucket,
credential scope and signed-URL expiry. Do not fix it by making the bucket public.

## E. Automatic sync: every 5 minutes or a custom interval

Set in Hostinger:

    MONITOR_ENABLED=true

Open Settings > Automatic sync & reporting. Enable Auto-sync all mapped accounts,
set Sync interval to 5 (default), or choose any integer 5-1440. Save.
These values persist in MySQL and are read on each scheduler tick, without a code
change/redeploy for each interval change.

### One-time Hostinger cron (no Terminal needed)

Hostinger > your Node.js website > Advanced > Cron Jobs.
Use the command below if the username and deployment paths still match your logs:

    /opt/alt/alt-nodejs22/root/bin/node --env-file=/home/u671858476/domains/pro.coastalmanpoweragency.com/hbuilds/config/.env /home/u671858476/domains/pro.coastalmanpoweragency.com/hbuilds/current/nodejs/scripts/cron.js

Choose Every minute (`* * * * *`). The cron wakes once a minute; it syncs only due
accounts according to the interval saved in the dashboard. Do not use a version-
specific hbuilds/versions path. Confirm the username/path before saving.

Hostinger's documented command limit is 255 characters; this command is below
that limit. Its Node.js cron does not inherit web-app environment variables, so
--env-file is required. Official guide:
https://www.hostinger.com/support/how-to-run-cron-jobs-for-node-js-websites-at-hostinger/

There is one global runner lease plus per-account active-job deduplication. An
account failure does not intentionally stop other account jobs. Rate-limit and
token errors are recorded with backoff. A sync cycle can exceed five minutes when
Meta is slow or limits access; the UI shows actual timestamps rather than a fake
live indicator. A stopped/crashed job is recovered after its lease expires.

The default is all MAPPED connected accounts (up to 12), not every account that
happens to be discoverable via the Meta user's permissions. Saving a new mapping
changes the scope of automatic syncing. Selecting rows on Overview only changes
what you view; it does not disable background syncing of the other mapped accounts.

The browser refreshes displayed saved data every 15 seconds while visible.
Closing it does not stop the configured cron. Saving an interval in Settings alone
does not install a Hostinger cron. The scheduler heartbeat must appear in Settings.

An optional GitHub HTTPS workflow remains available as a fallback. It requires
JOB_RUNNER_SECRET and can be delayed; use only one scheduler. Hostinger cron is the
preferred route for this five-minute use case. No scheduled OpenAI report is
triggered by default. It has its own switch, hours-based cadence and daily cap.

## F. Set campaign content, conversion destination and budgets

Campaign workspace > Content & destination:
- Call ad: international default phone number, with per-account overrides.
- Website: HTTPS URL, with per-account overrides; select link clicks, landing page
  views, website leads or purchases. Lead/purchase plans require the Pixel/Dataset ID.
- Upload / choose content opens the real media library. Each content gets its own
  caption/headline/description/CTA and its own ad set in the saved plan.

Accounts & budgets:
- Set starting budget and per-account increment (10, 12, 14 ... for a +2 rule).
- Change account order and apply manual overrides.
- Choose per-ad-set budget OR account-total budget split across its ad sets.
- Optional account daily ceiling rejects an over-limit plan.
- Example: 12 accounts, 3 contents, starting USD 10 +2 per account means
  USD 252/day in ACCOUNT_TOTAL mode, or USD 756/day in PER_ADSET mode.
- The increment is BETWEEN accounts, never unattended automatic scaling over time.

Review and save the plan. This release still DOES NOT create/activate live Meta ads.
The Call/Website choices are validated saved configurations, not executed ad requests.
Applicable employment-ad policy, destination eligibility, creative checks and
Meta's actual minimum budgets must be checked by a real publishing module later.

## G. Reporting and balance semantics

Overview now offers Today, Yesterday, 3/7 days including today, and last 12/24 closed
hours. The latter normalize complete provider hour buckets into a shared UTC
window ending at the last UTC hour. It is not minute-exact data ending right now.
No partial-hour spend is prorated. Some timezone boundaries or Meta reporting
availability can leave incomplete coverage; details show dates and bucket counts.
Ambiguous DST hours fail clearly instead of being assigned the wrong timestamp.
Hourly reporting is optional and provider permissions/capabilities can affect it.

All-clicks, link clicks, landing views, configured lead action and configured call
action are separate fields. Missing action keys remain null (Not reported). Select
an exact observed action type in Settings to match your advertising measurement.
Overlapping lead categories are not summed. A reported phone action is not proof
that an actual conversation completed. Pixel/provider/CRM measurement is necessary
for real outcomes Meta does not return. Hourly conversion counts are not invented.

Balance & daily spend includes selected-account totals. Meta's balance is a billing
field, not universally available cash. Unpaid bills, account spending-cap headroom
and available prepaid funds are not interchangeable. This release does not claim
verified available prepaid cash when the API integration cannot establish it.

Settings > Currency conversion accepts verified manual conversion rates, date and
source. Totals show both native values and a converted estimate. Missing rates or
account values reduce the shown coverage count; no value is silently taken as 1.
Changing the display currency clears the editor's previous rates. Rates are not
fetched automatically; they can become stale and are always date-stamped.

## H. Acceptance checklist before normal use

- GitHub Build and verify passes: install, build, DB integration and npm audit.
- /api/health shows release 0.3.0 and frontend:true.
- /api/ready shows database:true and upgradeSchema:true.
- Existing administrator still logs in, and saved Meta connections still work.
- Upload a small image, then your real 500 MB-1 GB video; test pause/resume and preview.
- Select the uploaded item, save Call and Website drafts, check budget totals.
- Sync one account manually; compare today's native-currency spend to Meta.
- Enable cron; close the browser and check that per-account sync timestamps advance.
- Change interval from 5 to 10 minutes, verify the new next-due times.
- Check one expired-token/rate-limit scenario and ensure other accounts still sync.
- Set FX rates and verify a known conversion before relying on combined totals.

See docs/VALIDATION.md for exactly what was and was not tested during authoring.
