> v0.6 uses the same fresh-install schema as v0.5: `sql/FRESH-INSTALL-v0.5.sql`. See `INSTALL-v0.6.md`.

# Fresh installation v0.4

**Follow `START-HERE.md`.**

- GitHub: create a private repository, upload extracted source files, then run **Actions -> Build and verify**.
- MySQL: use a NEW empty database. In phpMyAdmin import only **`sql/FRESH-INSTALL-v0.4.sql`**. Do not mix with the old Creative International schema or v0.3 migrations.
- Hostinger: Express, root `./`, entry `server.js`, Node 22.x, npm. Supply environment variables from `.env.example`, with your real HTTPS origin and private secrets.
- First admin: open `/setup`, choose 14+ character password; remove setup secret afterward.
- Configure Meta OAuth and permissions, connect accounts, R2 media storage and CORS, OpenAI if desired, then scheduler.
- Keep `PUBLISH_ENABLED=false` and `ACTIVATION_ENABLED=false` until one-account PAUSED test and policy checks pass.

See `docs/PUBLISHING-AND-COMMAND.md` for all routes and the explicit spend approvals.

## v0.5 fresh install
For a BRAND NEW EMPTY MySQL database import only `sql/FRESH-INSTALL-v0.5.sql` (includes all tables for v0.5). Do not import earlier migration files on top. The first Super Admin account is created via `/setup`; there is no default password.
