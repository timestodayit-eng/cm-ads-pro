# v0.7.1 — Meta campaign creation field fix

## Root cause and scope

The v0.7 publisher omits `is_adset_budget_sharing_enabled` when POSTing to `act_{id}/campaigns`.
Some Meta Marketing API accounts now reject this request with error code 100 and a message beginning
`Must specify True or False in is_adset_budget_sharing_enabled`.

The app uses ad-set-level daily budgets (ABO). This patch explicitly sets
`is_adset_budget_sharing_enabled: false` on every new paused campaign.
It does not change the per-account or per-content budget calculation.

The boolean is encoded into the existing form URL payload as `false` by `server/meta-write.js`.

## Changed files

- `shared/publishing.js` — add required campaign API property.
- `tests/publishing-v04.test.js` — assert the property remains `false`.
- `package.json` — patch version bump to 0.7.1.

## Deployment

1. Back up current GitHub source and database.
2. Upload this complete source tree or update only the modified files above.
3. Run CI tests and the frontend build, then deploy to Hostinger.
4. No MySQL migration is needed for this fix.
5. Keep `ACTIVATION_ENABLED=false` during live test. To create paused objects, the existing
   `PUBLISH_ENABLED=true` and valid Meta permissions must already be configured.
6. The two previous batches are in `needs_review`, with `campaign_id=NULL` in the panel.
   Inspect each ad account in Meta Ads Manager for any remotely created paused campaign
   before attempting a new batch. Do not alter historical batch status manually.
7. After ruling out duplicates, create **one new paused test batch with one account and one ad**.
8. Check the new batch. If Meta rejects the ad set or creative, capture that new code/message.

## Confirm the error text without secrets

Use phpMyAdmin (read-only query):

```sql
SELECT LEFT(b.id, 8) AS batch_id,
       r.account_id, r.stage, r.error_code, r.error_message
FROM publish_account_runs AS r
JOIN publish_batches AS b ON b.id=r.batch_id
WHERE r.error_code = 'META_WRITE_100'
ORDER BY b.created_at DESC
LIMIT 4;
```

## Verification limitations

Static/unit tests validate outgoing payload shape. No live Meta API call is made as part
of the tests. This patch addresses the likely cause of the current Meta error; it does not
certify the entire campaign/ad set/creative workflow for a particular account.
