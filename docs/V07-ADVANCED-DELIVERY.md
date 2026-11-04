# v0.7: Audience, Placements, Reach & Delivery

This version adds an **Advanced Audience, Placements & Delivery** section to both **Easy Ads Setup** and the **Campaign Workspace**. It does NOT replace or bypass live Meta validation or Meta's own permissions and restrictions.

## What is implemented

- Shared account selection, uploaded media, ad copy, and approval flow remain intact.
- **Audience modes**: Broad; Advantage+ Audience (Meta optimization, eligibility dependent); Manual (only when the ad is NOT Employment).
- **Geography**: selectable ISO country codes from the common-country UI list (BD, MY, SA, AE, QA, KW, PT, IT, JP, US, CA, GB). Saved payloads support validated two-letter uppercase ISO country codes. City/radius targeting and location exclusions are **not** implemented.
- **Employment policy guard**: full adult range (18-65+), all genders; no arbitrary interest lists, custom audiences, manual narrow targeting, or exclusions. Some other employment restrictions vary by jurisdiction/account. Meta still independently rejects noncompliant delivery.
- **Manual placements**: curated Facebook, Instagram, Messenger Inbox, and Audience Network position options; mobile-only or desktop-only targeting. Automatic mode leaves Meta free to choose eligible placements. Account/objective/creative eligibility must be verified live; a particular placement is not guaranteed.
- **Reach and impressions**: when using Website link-click destination, choosing Reach or Impressions switches to `OUTCOME_AWARENESS`, with `optimization_goal` = `REACH` or `IMPRESSIONS`. This may not be supported by every account and is **not** a replacement for the Call Ads destination.
- **Frequency caps**: on Reach campaigns only, submit `frequency_control_specs` at Ad Set creation. Meta can reject unsupported caps; actual frequency is not guaranteed exactly.
- **Bid strategy**: Lowest Cost, Bid Cap or Cost Cap. Dollar/taka amounts converted to the Meta account's minor currency units. Some strategies require account eligibility or budget minima. Verify in paused test.
- **Server-side safety**: the server normalizes a whitelist of supported fields and reruns validation when saving, previewing, and creating paused campaigns. It never forwards raw targeting objects from AI or from the browser. The selected values are present in the Meta Ad Set creation payload.
- **Zero new SQL migration**: advanced values live within the existing `campaign_drafts.config_json.input.advanced` and the rebuilt normalized plan. Old drafts default to Broad, Bangladesh, Auto Placements, and Lowest Cost when loaded.

## What is not implemented

Not every Ads Manager feature is exposed. Missing features include live interest/audience search, city/radius geocodes, lookalike audience controls, per-account placement overrides, creative variants by placement, dynamic creative, experiments, CBO/lifetime budgets, attribution-window controls, A/B tests, reach estimates from Meta, and arbitrary Ads Manager settings. Do **not** claim full Meta Ads Manager parity.

## Rollout

1. Back up existing MySQL data and GitHub source.
2. Upload full v0.7 source; do not import Fresh Install SQL into your existing DB.
3. Run the GitHub Actions `Build and verify` workflow (tests, production build and MySQL integration). This sandbox did not install React/Vite dependencies, so production build remains unverified here.
4. Check `GET /api/ready`; all schema checks, including `publishingSchema`, must be true. If false, complete outstanding migration from earlier versions first.
5. Keep `PUBLISH_ENABLED=false`, `ACTIVATION_ENABLED=false` until config/Meta Access/Permissions are verified. Configure publishing only when ready for paused creation and test **one account and one media item**.
6. Open Easy Ads Setup, configure Audience/Placements/Delivery, save, preview and explicitly approve paused creation. Confirm campaign objective, targeting, frequency/placement fields and errors inside Meta Ads Manager.
7. Activate only when results reviewed and separate activation gate intentionally enabled.

This release has local unit and syntax checks but **no live Meta publishing acceptance test**. Existing live publishing blockers (missing `publishingSchema`, Meta App access, R2 issues, blocked feature flag, invalid Page access, account eligibility) are not solved merely by adding controls.
