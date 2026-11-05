# v0.7.4 Video Thumbnail Creative Fix

## Diagnosed error
Meta POST `/act_<account>/adcreatives` returned error code 100, subcode 1443226: `Your ad needs a video thumbnail ... image_hash or image_url in video_data`. This happened after the existing campaign, video, and ad set had been created.

## Implemented changes
1. `shared/publishing.js`: video creative now requires one of `image_hash` or `image_url`, and never sends both.
2. `shared/meta-thumbnail.js`: picks the preferred HTTPS thumbnail from Meta's video thumbnail data, using the standard `picture` field as a fallback.
3. `server/meta-write.js`: retrieves Meta's preferred video thumbnail (GET `/<video_id>/thumbnails`) just before creative creation, with fallback GET `/<video_id>?fields=picture`.
4. `server/publish.js`: resolves thumbnail BEFORE marking the create-creative write as in-flight. Adds tightly scoped `POST /api/publish/batches/:id/recover-thumbnail` for known Meta rejected writes with subcode 1443226.
5. `client/src/components/PublishingCenter.jsx`: shows a `Resume verified thumbnail fix` action only on affected, eligible runs. The Super Admin must manually confirm that no remote creative/ad exists before retrying. Existing campaign/adset and media IDs are retained.
6. `tests/video-thumbnail-v074.test.js`: regression cases for required image, preferred thumbnail, hash precedence, and HTTPS fallback.

## Upgrade
- Back up GitHub source and MySQL database.
- Deploy updated source on Hostinger and restart Node app. Keep `ACTIVATION_ENABLED=false`.
- No MySQL schema changes.
- Run CI (`npm ci` if lockfile exists or `npm install`, `npm test`, `npm run build`).
- Open affected batch in Publishing Center. In Meta Ads Manager verify the PAUSED campaign/ad set are present and NO creative/ad was created under the ad set. Only then choose **Resume verified thumbnail fix**, type **RETRY VERIFIED THUMBNAIL**, process the queue, and refresh status.
- Do not relaunch the same plan or reset database rows. If the Meta response changes, stop and inspect the new message.

## Verification limitations
- Local unit tests and server/shared syntax checks pass. Production React build and real Meta API/permissions are NOT verified in this runtime.
- A Meta CDN image URL may expire or be rejected depending on Meta account/API permissions. A persistent ad image hash obtained from an authorized uploaded thumbnail is an alternative if Meta rejects that URL. This release implements the Meta-generated URL path, not a custom-thumbnail upload UI.
- The recovery route is restricted to explicit Meta subcode 1443226 at `create_creative`. Never retry unknown or ambiguous remote writes without inspecting Meta Ads Manager first.
