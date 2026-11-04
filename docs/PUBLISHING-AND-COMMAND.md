# AI Command Center + Meta Publishing - Technical Notes (v0.4)

## Workflow

`Content Library -> AI Command Center (optional) -> Saved Campaign -> Publishing Center -> Page IDs -> Preflight -> CREATE PAUSED ADS -> Background Job -> Meta Review -> ACTIVATE ADS`

The user selects **only authorized mapped ad accounts**, 1-20 uploaded media assets and a hard combined daily limit. The OpenAI assistant produces a proposed campaign structure, copy, budget start/increment, destinations and per-account overrides. The server validates all AI output using the same `buildPlan` rules as manual drafts. Commands cannot insert new accounts or media, send secrets, or publish automatically.

When the user explicitly approves paused creation, the app writes a durable publish batch and per-account rows in MySQL. The background worker uses Meta Marketing API to (1) create a PAUSED Campaign, (2) upload the account's image/video asset, (3) poll for video processing readiness, (4) create a PAUSED Ad Set per uploaded content, (5) create the related Ad Creative, and (6) create the PAUSED Ad. Each Meta ID is saved before the next call. A network interruption or uncertain remote result is marked `needs_review`, with **no automatic blind retries**. A per-account publish batch can be partial if Meta denies permission for one account. Real Meta behavior still requires end-to-end testing.

**Activation** is a second, independent, super-admin approval, requiring exact text and the full daily amount. The worker activates child ad sets/ads first; it only activates the parent campaign last. **Pause** is queued per account; for emergencies also pause campaigns immediately in Meta Ads Manager until the background worker completes.

## New HTTP API (all require authenticated same-origin cookies)

- `POST /api/command/interpret`: JSON `{instruction,accountIds,mediaIds,maxCombinedDailyBudget}`. Calls your own OpenAI API project; returns a proposed plan and notes, no ad changes.
- `POST /api/command/save`: JSON `{draft,maxCombinedDailyBudget}`. Validates and saves a draft to `campaign_drafts` and `draft_media`.
- `GET /api/publish/batches`: List recent batches with statuses.
- `POST /api/publish/preview`: JSON `{draftId,pageIds,maxCombinedDailyMinor}`. Validates account/currency/media/category/pages; **local checks only**, no live Meta eligibility guarantee.
- `POST /api/publish/launch`: Same fields plus `{requestKey:uuid,confirm:'CREATE PAUSED ADS'}`. Requires `PUBLISH_ENABLED=true`; records batch and queues Meta writes, always PAUSED.
- `GET /api/publish/batches/:id`: Read every account, content and Meta ID.
- `POST /api/publish/batches/:id/process`: Process due job steps promptly, subject to Hostinger runtime constraints.
- `POST /api/publish/batches/:id/activate`: `{confirm:'ACTIVATE ADS',maxCombinedDailyMinor}`; super-admin only; requires `ACTIVATION_ENABLED=true`.
- `POST /api/publish/batches/:id/pause`: `{confirm:'PAUSE ALL'}`; queues status changes.

Preflight does not establish eligibility at Meta. You will encounter real API errors if an ad account does not have `ads_management`, the Page is not authorized, the phone CTA/optimization combination is unsupported, the video is not processed, or Meta policies disallow the creative or audience.

## Meta API and scopes

- `POST /act_{id}/campaigns`, `/adsets`, `/adcreatives`, `/ads` plus `POST /act_{id}/advideos`, `/adimages`.
- The ad creative includes the Page ID and either `video_data` or `link_data`.
- Account-specific budgets are converted to **minor currency units**; all accounts selected for one batch must have the same currency.
- Employment category is required for recruitment ads. The publisher enforces broad 18-65+ ages for this category instead of allowing invalid per-account age variation.
- Phone CTA and Pixel event optimization availability vary by objective, account and placement. The v0.4 publish engine supports Call CTA and Website Link Click/LPV templates; Pixel conversion goals stay draft-only until validated.
- The video source is a one-hour signed **GET** URL for the private R2 object; Meta downloads/uploads its own copy. The code polls video processing before creating dependent ads. No permanent public R2 URL is required.
- Image bytes are read into server memory for the Meta multipart POST and limited to 20 MB in this release.

## Security and responsibility

- OAuth credentials, encrypted Meta tokens, R2 keys and OpenAI keys stay server-side. Avoid sharing signed URLs in logs or screenshots.
- A unique requestKey prevents duplicate launch submissions. Individual steps use an `inflight` flag; any uncertain outcome becomes a manual reconciliation, not an automatic retry.
- `PUBLISH_ENABLED` and `ACTIVATION_ENABLED` are **off by default**. If unsure whether your Meta App has appropriate permissions and advertiser billing authorization, leave them disabled.
- All API mutations use authenticated role checks and CSRF protection. LLM output is untrusted and validated, and user-provided budget limits cannot be exceeded by it.
- Connected accounts may display financial and spend data with delay from the Meta API; do not call snapshots a guaranteed live ledger.
- Do not put applicant names, contact details, passports or other personal data into the AI command instructions.

## Known areas needing a real integration test

1. Meta's latest objective/destination/CTA field compatibility for your specific App and Ads Account.
2. Employment special-ad category country rules and Page ownership/advertiser permissions.
3. Video thumbnail and placements for uploaded videos, processing times, and support for large videos.
4. Hostinger cron throughput, request timeout and Meta rate limits for 12 accounts.
5. Meta delivery status and billing after second approval, including emergency pause response.
6. Production React build, MySQL 8 upgrade migration and configured Meta/R2 credentials.
