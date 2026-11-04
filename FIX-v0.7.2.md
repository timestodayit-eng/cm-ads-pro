# v0.7.2 - Campaign ABO budget fix

The current Meta error is `META_WRITE_100` with Meta title `No Budget for Campaign`.

In `shared/publishing.js`, this release removes campaign-level `bid_strategy`
from `metaCampaignForm`. The campaign still specifies `is_adset_budget_sharing_enabled: false`.
The builder uses ad-set budget optimization (ABO), and `metaAdsetForm` still
specifies the `daily_budget` and `bid_strategy` for each ad set.

This is a reasoned payload fix, not proof of successful publishing in Meta.

## Update instructions
1. Back up existing code and database.
2. Replace only `shared/publishing.js`, or deploy the complete source package.
3. Confirm the latest GitHub commit has reached Hostinger; no SQL is required.
4. Do not blindly retry old `needs_review` batches. Check Meta for any paused campaign first.
5. Test a NEW one-account, one-content PAUSED campaign with activation disabled.
6. Check the new run's Meta ID and step in phpMyAdmin if it fails.

The existing source has not been verified end-to-end on a real Meta account.
