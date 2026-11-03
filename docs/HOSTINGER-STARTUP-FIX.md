# Hostinger startup fix: ERR_REQUIRE_ASYNC_MODULE

This patch applies to Coastal Ads Command Center v0.1.0. It fixes the startup
boundary shown in the supplied LiteSpeed/Hostinger stack trace. It does not add
ad publishing, video uploads, or other unfinished features.

## Cause

The original root server.js contains a module-level `await import('./server/app.js')`.
The hosting launcher calls `require(server.js)`. Node cannot synchronously require
an ESM graph with top-level await.

## Minimum change

Replace ONLY the repository-root `server.js` with the provided `server.js`.
The application is dynamically imported inside an async `start()` function. The
entry itself has no top-level await and only statically imports Node built-ins.
The existing `.env` loading order, port binding, routes and application factory
are retained. Startup/import/listen errors now produce sanitized structured logs.

Keep package.json's `"type": "module"`. Do not rename the entry, convert the app to
CommonJS, remove await from asynchronous work, or add experimental Node flags.
Do not reset the database, re-import the SQL schema, recreate users, or rotate
existing encryption/session keys solely to apply this patch.

## GitHub and Hostinger (no terminal required)

1. Download the standalone server.js, or extract it from the full fixed ZIP.
2. Open the current Coastal repository. Replace root server.js and commit to the
   branch Hostinger deploys. Do not upload the ZIP as the only repository file.
3. Keep Framework=Express, Root=./, Entry=server.js, Package manager=npm.
4. Keep a supported Node release: 22.x at least 22.12 (the project requires it).
5. Redeploy the latest commit. Verify the log references the new commit, not an
   earlier release. There is no need to delete or recreate the hosting site.
6. Check runtime logs for `event: server_ready` and
   `startupFix: hostinger-require-1`.

For the domain shown in the supplied log, the origin setting is:

```
APP_ORIGIN=https://pro.coastalmanpoweragency.com
```

Use no path or trailing slash. Preserve your other credentials. Origin settings
are separate from the loader fix. Hostinger should supply PORT; do not hardcode it.
If Meta OAuth is configured, its redirect must use this same origin followed by
`/api/meta/callback`, matching the Meta developer configuration.

## Verification

- `/api/health`: server running; `frontend` separately indicates built files exist.
- `/api/ready`: database/schema and essential origin/session configuration readiness.
- `/`: login interface, provided the frontend deployment build succeeded.

A successful `/api/health` does not prove MySQL, Meta, or OpenAI are configured.
A 503 from `/api/ready` with `database:false` is a separate database/setup issue.
Do not use a successful install/build log alone as proof of runtime readiness.

## Tests performed for this patch

- Node v22.16.0.
- Original entry reproduced ERR_REQUIRE_ASYNC_MODULE under CommonJS require().
- JavaScript syntax checks: passed.
- 50 unit tests: passed (42 existing plus 8 startup regression tests).
- Startup tests use a lightweight HTTP fixture, not the complete Express app.
  The fixture intentionally has its own top-level await to verify dynamic import.
- Cases: require-style startup, direct-node startup, environment loading from a
  different working directory, hosting environment precedence, graceful shutdown,
  invalid port, missing app module, sanitized errors, and port-binding failure.
- npm dependency installation: blocked here by EAI_AGAIN (npm registry DNS).
- Full frontend build, dependency audit, real MySQL/Meta/OpenAI integration and
  actual Hostinger/LiteSpeed deployment: not verified in this environment.

The tests verify the loader fix, not production readiness of the whole application.

## References

Node.js v22.16.0 CommonJS documentation:
https://nodejs.org/download/release/v22.16.0/docs/api/modules.html

Hostinger redeployment guide:
https://www.hostinger.com/support/how-to-redeploy-a-node-js-application/

Hostinger runtime log guide:
https://www.hostinger.com/support/how-to-use-node-js-runtime-logs-at-hostinger/
