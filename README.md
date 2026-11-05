**Publishing reliability update (v0.7.3):** See [FIX-v0.7.3.md](FIX-v0.7.3.md) for ABO/CBO choice, safer Meta errors, video status, activation safeguards, and live-testing requirements.

**v0.7 update:** Audience (Broad, Advantage+, permitted Manual), placement selection, Reach/Impressions frequency settings and bidding controls in Easy Ads and Campaign Workspace. Details and caveats: [v0.7 Advanced Delivery](docs/V07-ADVANCED-DELIVERY.md); upgrade: [INSTALL-v0.7](INSTALL-v0.7.md).

# v0.7 Advanced Ads Delivery (based on v0.6 Easy Ads)

See [INSTALL-v0.6.md](INSTALL-v0.6.md) for the new one-screen ad setup, diagnostics and safe upgrade.

# Coastal Ads Command Center v0.5

Source release: **AI Command Center + Meta PAUSED Publishing (beta)**.

Read **`START-HERE.md`** first. New installation: import `sql/FRESH-INSTALL-v0.5.sql` on a NEW empty MySQL 8 database. Existing v0.3 installation: back up, then import `sql/004-publishing.sql` only.

- React dashboard / Express API / MySQL sessions
- Meta OAuth + all authorized mapped ad accounts
- Private Cloudflare R2 video and image library, multipart and resumable upload
- Per-creative ad-set campaign plans, Call/Website destinations, captions/headlines, budget increments and overrides
- Synced finance and hourly reporting, scheduled sync and OpenAI reports
- **AI Command Center:** instructions in Bangla or English to prepare validated plans using explicitly selected accounts and media
- **Publishing Center:** separate final approval, PAUSED Meta Campaign/Ad Set/Ad API creation, per-account job statuses, second activation approval and pause requests

**Read `docs/PUBLISHING-AND-COMMAND.md` for limitations and Meta API integration requirements.** This source has passed JS unit checks but production Vite build, real MySQL migration and live Meta publishing/activation have **not** been verified here. Use `PUBLISH_ENABLED=false` and `ACTIVATION_ENABLED=false` until end-to-end tests pass. No default admin password or bundled credentials.

## v0.5 additional features
- Account selection without a fixed 12-account limit. Meta/API quotas and hosting capacity still apply.
- Custom reports by account/campaign/ad set/ad/day, 11 available metrics, date range, CSV export, and saved templates. Reports operate on stored synced Meta data.
- Workspace panel name editable under Settings by a Super Admin; displayed on login, sidebar, footer and browser title.
- Existing database: import `sql/UPGRADE-TO-v0.5.sql` (or import `005` then `006`). Fresh database: `sql/FRESH-INSTALL-v0.5.sql` once.

## v0.7.4 Video Thumbnail Fix

See `FIX-v0.7.4-VIDEO-THUMBNAIL.md` for the Meta video creative error 1443226 fix, existing-batch recovery, deployment, and safety requirements.
