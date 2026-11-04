# Ads Command Center v0.7 — Upgrade instructions

## Upgrade from v0.6/v0.5
1. Download full source ZIP, preserve backup of working GitHub repo and MySQL database.
2. Unzip and commit the source to the existing GitHub repo, excluding any production secrets.
3. No new SQL tables were introduced in v0.7; **do not run a fresh-install SQL file** on an existing DB.
4. If `/api/ready` reports `publishingSchema:false`, fix the older `sql/004-publishing.sql` migration BEFORE testing any publishing.
5. Configure `APP_ORIGIN` to the exact current origin (`https://proads.smenterpriserl1987.com` if that is the live URL) without a trailing slash; update Meta OAuth Redirect URI consistently.
6. In GitHub Actions, run the `Build and verify` workflow; it must pass npm install, source tests, React production build, MySQL integration and audit checks.
7. Redeploy with Hostinger Node.js 22. Preserve Meta, R2, DB, Session and OpenAI environment variables. NEVER commit production `.env`.
8. Leave `PUBLISH_ENABLED=false` and `ACTIVATION_ENABLED=false` until an administrator intentionally conducts the one-account, one-ad paused acceptance test. The first flag controls paused creations; the second permits activation after separate approval.
9. Open `Easy Ads Setup` > `Audience, Placements & Delivery`, choose mode and eligible options, review warnings, and save the plan.

## Troubleshooting
- Generic server error? Read sanitized logs and `/api/ready` before changing settings.
- `publishingSchema:false`? This version is not a substitute for the earlier publishing migration.
- `PUBLISH_DISABLED`? Paused creation is intentionally disabled by configuration.
- `META_WRITE_*`? An actual Meta API write was rejected. Inspect sanitized Meta error code and account/creative/objective, not tokens or full signed URLs.
- `ADVANCED_SETTINGS_INVALID`? Fix incompatible audience/placement/reach/frequency/bid settings.
- Meta may reject custom placements, frequency caps or Advantage+ audience for a selected objective or account; choose automatic/broad defaults for the first acceptance test.

See `docs/V07-ADVANCED-DELIVERY.md` for implemented controls and known gaps.
