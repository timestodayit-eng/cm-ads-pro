# Upgrade from Coastal v0.3 to v0.4

1. Back up existing production MySQL database and GitHub release.
2. Upload full v0.4 source in the existing **private** Coastal repository and run GitHub Actions Build and verify.
3. Import **only** `sql/004-publishing.sql` into the already-working v0.3 database. This changes the `jobs.kind` enum and adds publishing batches, runs, item IDs and per-account media cache. Do not re-import `FRESH-INSTALL-v0.4.sql` into the existing database.
4. Keep the old environment secrets. Add `PUBLISH_ENABLED=false` and `ACTIVATION_ENABLED=false`.
5. Redeploy after build success; check `/api/ready` includes `publishingSchema:true`, login, account mapping, content uploads and old reports.
6. Verify Meta ads_management, Page access and appropriate Employment category before testing one PAUSED campaign. Only then enable publish; activate separately after a review.

See `START-HERE.md` and `docs/PUBLISHING-AND-COMMAND.md`.

## Upgrade from v0.4 to v0.5
1. Back up your MySQL database and your GitHub repository.
2. Import `sql/005-custom-reports.sql` and then `sql/006-workspace-branding.sql` into your EXISTING database with phpMyAdmin. These create tables only; do not use the full fresh-install SQL on existing data.
3. Upload all source files to the repository root and run `npm test` and `npm run build` on GitHub Actions, then redeploy Express on Hostinger.
4. Open Settings → Panel name (Super Admin only) and Custom reports.
5. No additional env secrets are required by the two new features.
