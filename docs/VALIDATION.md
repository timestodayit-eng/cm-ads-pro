# Coastal 0.3.0 validation record

## Executed here

- Node.js 22.16.0 `node --test tests/*.test.js`: **114 passed, 0 failed**.
- JavaScript syntax check over server, shared, scripts, tests and root entry: passed.
- Client JS/JSX syntax transpilation with locally installed TypeScript: passed.
  This is a syntax/transpilation check, NOT a Vite production bundle.
- Regression tests cover the Hostinger require() startup compatibility fix.
- Unit tests include upload validation, multipart boundaries/completion, resume,
  access controls using repository/storage fakes, metadata/size checks, budgets,
  destination validation, billing semantics, FX, metrics and sync cadence logic.
- ZIP integrity and exclusion of real .env/node_modules checked at packaging.

## Not completed / not verified

- `npm install --ignore-scripts` failed with EAI_AGAIN resolving registry.npmjs.org.
  No successful production npm build or npm audit is claimed.
- 19 integration tests were discovered but SKIPPED here because RUN_DB_TESTS and
  a disposable real MySQL service/dependencies were unavailable. GitHub CI runs them.
- Browser navigation was blocked by the environment (ERR_BLOCKED_BY_ADMINISTRATOR),
  including the local offline fixture. No new browser end-to-end checks passed.
  Earlier-version screenshots are not included as evidence for this release.
- No actual upload to your R2 bucket, 1 GiB live transfer, Meta OAuth/Insights call,
  scheduled Hostinger run, live currency rate or paid OpenAI report was verified.
- No production deployment or repository write was performed on your account.

## Before accepting this release

Run GitHub Build and verify against a disposable MySQL database. Resolve any build,
security audit or integration failures before Hostinger deployment. Then run the
live acceptance checklist in UPGRADE.md with a small file and one Meta account
before trying twelve accounts and 1 GiB files.

Known scope: real upload implementation and configured polling are included; real
Meta ad creation/activation remains disabled. Upload codec compatibility, any
antivirus scanning, account-specific API permissions and minute-exact real-time
attribution are not claimed.
