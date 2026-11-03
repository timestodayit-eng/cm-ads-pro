# Security and operational boundaries

This is a development release, not an independently security-audited product.

- Server-only credentials. Never use `VITE_OPENAI_API_KEY`, expose the app secret in React, or commit a real `.env`.
- Passwords: salted Node scrypt, N=32768, r=8, p=1, 64-byte derived key; minimum 14 characters. No shared/default admin credentials.
- Session: random 256-bit opaque token; only a SHA-256 digest in MySQL. Production uses Secure + HttpOnly + SameSite=Lax, host-only cookie. Eight-hour expiration. Password changes revoke existing sessions.
- CSRF: exact configured-origin check plus per-session HMAC token for authenticated writes. No wildcard CORS. Verify the reverse-proxy layout; the Express trust-proxy setting is one hop and must be reviewed for the actual deployment.
- SQL: parameterized statements, no client SQL, no multi-statement queries. Dedicated MySQL account and restricted network access recommended.
- First administrator: strong setup key, rate limit and transactional setup lock; blocked after the first user. Remove the setup key after use.
- Meta: session-bound, expiring, consumed OAuth state; callback code exchanged server-side. AES-256-GCM token encryption. App secret proof on Graph reads. Provider errors and requests are not logged with token values.
- Token expiry requires reconnection. Meta has no universal refresh-token assumption in this implementation. Local disconnect removes the stored connection and current insights cache; saved report snapshots and drafts are retained. It is NOT remote revocation or complete data erasure. Handle provider deauthorization/data-deletion callbacks before broad production rollout.
- OpenAI: fixed server-side endpoint; structured response, known evidence references, no tools. `store:false` does not itself promise zero retention of all provider logs. Verify your own data-sharing obligations and provider settings.
- AI gets pseudonymous entity references and aggregates; no applicant profiles, phone destinations, names, passports or raw videos are included. Reports still contain business-sensitive performance figures; restrict team access.
- AI report attempts are capped by UTC date, including failures, but the cap is not a currency-denominated billing guarantee. Project-level API spend controls should also be configured.
- Job leases and retries: only read-sync jobs automatically retry. Timed-out AI jobs can have incurred a charge; do not blindly replay them. Jobs and failures remain visible.
- App output escapes text through React. No `dangerouslySetInnerHTML`, arbitrary code execution, or AI-driven ad mutations.
- No actual ad-spend operations in this release. `/api/publish` returns 501 even for administrators.
- Currencies are never blindly combined. A Meta billing balance must not be relabeled as available prepaid funds without account-type-specific interpretation; billing UI is deferred.
- Rotate any password/secret exposed in earlier screenshots. Back up TOKEN_ENCRYPTION_KEY securely; rotation requires re-encrypting saved tokens or reconnecting Meta.

Before production: run the dependency audit and integration workflow, verify backup/restore, add monitoring of job failures, review access permissions, implement retention/deletion policies and provider callbacks, consider MFA, and review account recovery. No claim of zero vulnerabilities is made in this archive.


## 0.3 upload/scheduler additions
- Storage is private; short-lived signed multipart URLs do not expose R2 credentials.
- Upload type/header/size validation is not antivirus scanning. Do not accept untrusted
  public uploads without additional content security controls.
- Real keys stay in Hostinger, not VITE_ variables or this repository.
- Sync interval and FX/metric mapping changes require super_admin and CSRF validation.
- Scheduled requests use a separate secret header or direct cron with server env.
- The queue has a global expiring runner lease and per-account active deduplication.
- No ad spend changes occur: live publishing remains disabled.
- Run the provided dependency audit/build gate before production. The authoring
  environment could not install npm dependencies and did not complete npm audit.
