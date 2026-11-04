# v0.7.3 — Meta Publishing Hardening

This release repairs multiple source-level issues identified by auditing the v0.7.2 campaign → ad set → media → creative → ad → activation flow. **It is not a claim of successful live Meta publishing.** Meta account permissions, supported objectives, ad account eligibility, Page access, and video ingestion still require live acceptance testing.

## Changes

1. **Explicit budget location:** Easy Ads and Campaign Workspace allow **Ad Set Budget (ABO)** (default) or **Campaign Budget (CBO)** (explicit selection). In ABO, each ad set receives its own daily budget and the campaign has no budget. In CBO, the campaign receives the account's combined planned daily amount and the ad sets do not receive individual daily budgets. A CBO campaign uses lowest-cost bidding only in this release. CBO can distribute the total unevenly among ad sets. **The application never automatically switches budget modes after an API error.**
2. **Meta campaign budget flags:** ABO campaigns include `is_adset_budget_sharing_enabled=false`. Campaign-level `bid_strategy` is not included in ABO. A CBO campaign includes `daily_budget` and `bid_strategy` but not ABO-only budget-sharing fields. A real Meta campaign account may still reject a valid-looking configuration; use the error details to guide subsequent changes.
3. **Employment country:** Employment special-category campaigns include `special_ad_category_country` derived from the approved target countries. Targeting limitations remain enforced.
4. **Actionable API errors:** The Publishing Center shows each account's `error_code` **and** sanitized `error_message`. The backend now retains the Meta user title, user message, Graph API error code and subcode (if present) without exposing tokens or full URLs.
5. **Video status:** Meta video readiness supports the nested `status.video_status` response, including `ready`, `processing`, `error`, and `expired`. It no longer treats the entire status object as perpetually waiting.
6. **Activation correctness:** The activation runner checks persisted state after the final step instead of relying on stale state and scheduling an extra failing activation. On an activation error it attempts to reassert PAUSED on the campaign and flags an urgent manual review if the pause could not be confirmed.
7. **Regression tests:** Dedicated tests exercise ABO/CBO payloads, Employment country, video processing, safe Meta diagnostics, and call CTA. All 147 unit tests pass in the build environment used for source-level checks.

## Upgrade from v0.7.2

1. Back up GitHub source and MySQL first.
2. Replace source files with this project's contents and commit.
3. **No new SQL migration is required by v0.7.3**. Earlier migrations including `sql/004-publishing.sql` must already have succeeded, and `/api/ready` should show `publishingSchema:true`.
4. Let GitHub Actions run `npm install`, source checks, unit tests, **production Vite build**, and MySQL integration tests. **Do not deploy if they fail.**
5. Deploy the tested build to Hostinger and restart Node 22.
6. Keep `ACTIVATION_ENABLED=false`. Set `PUBLISH_ENABLED=true` only when you intend an authorized test of creating PAUSED objects.
7. In Meta Ads Manager, check for existing paused/partial campaigns from previous tests before making another batch. Old `needs_review` batches should not be blindly retried.
8. Test **one authorized account, one content, new draft, PAUSED**. Start in ABO, since this preserves individual ad-set budgets. If that account again returns **No Budget for Campaign**, try a **new draft using the explicitly selected Campaign Budget (CBO) mode**, with conscious acceptance that the planned budget is now at campaign level. Do NOT try to repair an in-flight batch by changing its database rows.
9. Inspect Publishing Center's error detail and compare Meta Ads Manager. Do not activate any campaign before it is independently verified.

## Known deployment / external limitations

- No live Meta token, account, Page or R2 credentials were available in the isolated environment; therefore none of the changes is certified by a live Meta API test.
- The current creative implementation supports the existing image/video inputs, but placement-specific creative requirements and other Meta policy restrictions may still produce further API validation errors.
- Call destination eligibility depends on Meta objectives, account permissions, and formats.
- Network ambiguity after remote mutations is intentionally marked `needs_review` rather than retried blindly, to avoid duplicates.
- Node dependencies could not be downloaded here because registry.npmjs.org returned `EAI_AGAIN`, so the React/Vite production bundle must pass in GitHub Actions before deployment.

## Read-only error query (if needed)

```sql
SELECT LEFT(b.id, 8) AS batch_id, r.account_id, r.status,
       r.stage, r.inflight_stage, r.campaign_id,
       r.error_code, r.error_message
FROM publish_account_runs r
JOIN publish_batches b ON b.id = r.batch_id
ORDER BY b.created_at DESC
LIMIT 10;
```

Do not share access tokens, signed R2 URLs, API secrets, or private Page credentials with support.
