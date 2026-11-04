# Coastal Ads Command Center v0.5 - release notes

## What's new

- **No hard-coded 12-account selection cap:** discover all account pages through Meta, map any number of authorized accounts, and select them for campaigns and reports. Actual Meta limits, rate limits, data volumes, job throughput and Hostinger timeouts remain in force.
- **Custom Reports:** new Custom reports navigation tab. Select mapped accounts (search, select all, incremental list), reporting dates, grouping (account, campaign, ad set, ad, day), and up to 11 supported measures. Reports read from your already-synced Meta data. Export CSV, save and reuse templates. Currency totals remain separate; any converted values are estimates from manually supplied dated rates.
- **Editable panel name:** Settings > Panel name, Super Admin only. Updates the sidebar, login page, document/browser title and footer. Does not modify domain, Business Portfolio, business legal name, Ad Account names or RL number.
- **Large-selection request safety:** Performance and Finance panels use protected POST endpoints for selected account IDs instead of placing potentially thousands of IDs in the URL. Account selectors can search and load additional entries.
- **Migrations:** additive tables `005-custom-reports.sql` and `006-workspace-branding.sql`. Existing project: import in this order after backup. Fresh DB: import only `FRESH-INSTALL-v0.5.sql`.

## Important factual limitations

- "Unlimited account selection" means **no product-defined 12-account selection cap**. It does not imply unlimited Meta access, sync throughput, API usage, Hostinger capacity or ad publishing simultaneously.
- A single custom report operation currently supports at most 93 account-local reporting dates, 100,000 synced daily rows and 25,000 grouped rows. If exceeded, split the report into smaller date ranges. Its account selection has no fixed count cap.
- Historical reports are based on stored, last-synced data and may be revised by Meta; there is no instant/live guarantee. Link clicks are not completed calls. Leads and calls depend on configured action type. Distinct currencies are not added without verified manually entered exchange rates.
- Recruitment/Employment adverts must comply with Meta's applicable Special Ad Category, permissions and audience restrictions. The new interface does not bypass those rules.
- Publishing is still behind `PUBLISH_ENABLED` and `ACTIVATION_ENABLED`. Keep both false until authenticated acceptance testing with one paused campaign succeeds.

## Test state

- 128 local unit tests pass including account-selection and report validation tests.
- Server/shared JavaScript syntax checks pass; a TypeScript parser check found no client JavaScript/JSX syntax errors.
- Production npm install/build was blocked by registry DNS `EAI_AGAIN` in the creation environment, and live Hostinger/Meta/MySQL tests were not run. GitHub Actions must pass build, npm audit and MySQL integration tests before deployment.
- Secrets are not included. Do not upload a real `.env` to GitHub.
