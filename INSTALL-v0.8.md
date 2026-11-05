# Ads Command Center v0.8 — COMPLETE SOURCE INSTALL / UPGRADE

**This is full application source code, not a deployed, live-verified service.** Start with a BACKUP of your MySQL database and your current GitHub repository.

## Existing v0.7.4 installation

1. In phpMyAdmin, export/backup the existing production database.
2. Import **only** `sql/007-ai-copilot-documents.sql` in the SAME database. It only creates new Copilot/Document tables. Do **not** run `FRESH-INSTALL-v0.8.sql` on a live database.
3. Upload the files **inside** this ZIP to your existing private GitHub repository (do not include a real `.env`).
4. Check **GitHub Actions → Build and verify**: dependency install, `npm run check`, `npm test`, `npm run build`, `npm run test:integration`.
5. Redeploy on Hostinger using Node.js >=22.12, startup entry `server.js`, project root `./`, Express app, production HTTPS.
6. Keep existing `APP_ORIGIN=https://proads.smenterpriserl1987.com` (without trailing slash), `META_REDIRECT_URI=https://proads.smenterpriserl1987.com/api/meta/callback` and R2 bucket CORS for the same exact origin.
7. Keep your existing OAuth/Meta/R2/DB/OpenAI secrets in Hostinger environment, **not** in Git. Set `OPENAI_API_KEY` and a supported `OPENAI_MODEL` for Copilot and AI document generation.
8. Open `/api/ready`. Expect `database`, `publishingSchema`, `customReportSchema`, `brandingSchema`, `copilotSchema`, `documentsSchema` all true, and frontend built.
9. Log in. New navigation: **AI Ads Copilot** and **AI Documents**.
10. Start a conversation, ask for today's account results, ask for a marketing explanation, then select **Generate editable document**; revise a section and check Version History.
11. Test HTML Print→Save as PDF, DOCX and XLSX after npm install. Direct PDF for Bangla text needs `PDF_FONT_PATH` set to a Unicode Bengali font installed and licensed on your Hostinger server. **Do not distribute the font file.**
12. Keep `ACTIVATION_ENABLED=false` until live Meta paused publishing was separately verified. This update does not guarantee Meta campaign creation succeeded on your accounts.

## Fresh database / fresh installation

1. Create an **empty MySQL 8** database. Import ONLY `sql/FRESH-INSTALL-v0.8.sql` with phpMyAdmin.
2. Configure the environment from `.env.example` with private unique secrets.
3. Run GitHub Actions as above, deploy to Hostinger, open `/setup`, create the first Super Admin, and then remove `FIRST_ADMIN_SETUP_SECRET` from Hostinger.
4. Connect authorized Meta accounts via OAuth, map them, configure R2 bucket CORS, test uploads, start the scheduler and test one paused campaign.
5. Never use the fresh schema to upgrade an existing database.

## AI Copilot features and permissions

- Chats stored in MySQL; each conversation belongs to the logged-in user.
- Natural language in Bengali, Banglish, and English.
- Read-only tool calls for real stored Meta insights (today/yesterday/3d/7d/12h/24h), campaign/ad/ad-set breakdowns, account status, pending publish errors, scheduler health, and recent drafts/reports.
- Tool data is read-only; AI cannot execute SQL, publish/activate campaigns or change budgets.
- For campaign preparation, click **Prepare campaign in AI Command Center**; the command is prefilled, but accounts, media, maximum budget and human publishing approval are still required.
- Queries use previously synced Meta metrics, NOT guaranteed real-time data; missing/unsynced metrics are labeled as such.

## AI Documents features

- Generate multi-section professional documents from a conversation and the latest selected actual Meta performance data.
- Every edit/rewrite creates a durable MySQL version. Optimistic locking prevents silent overwrites.
- Export: HTML print-ready, PDF (Unicode font configured when needed), editable DOCX, XLSX table, CSV.
- Manual document creation works without OpenAI API; AI-generated content requires `OPENAI_API_KEY`.
- Document sections are editable text fields; this is **not** a full WYSIWYG design editor.
- When source data changes, generate a NEW document or refresh the analysis; previously saved versions remain as historical snapshots.

## Operating the scheduled worker

A configured `JOB_RUNNER_SECRET` does not start the scheduler. Create a Hostinger-compatible cron or authenticated scheduler to invoke `scripts/cron.js` or `POST /api/jobs/tick`. Verify `scheduler_status.last_tick_at` changes. Previously you saw `SCHEDULER_NOT_STARTED` and overdue queued jobs; this update does not bypass the need to configure an actual runner.

## Production verification still required

This environment cannot connect to your Hostinger, MySQL, Meta Ads Manager, Cloudflare R2, OpenAI billing or install npm dependencies from the registry. Existing Meta writes have been implemented in prior source but **end-to-end live creation remains account-dependent and is not certified by this ZIP**. Always test a single Campaign/Video/Ad Set/Creative/Ad as PAUSED, verify remote IDs and review the recorded Error before larger batches.

## Key APIs

- `GET /api/copilot/conversations`
- `POST /api/copilot/conversations` `{title,accountIds:[]}`
- `GET /api/copilot/conversations/:id`
- `POST /api/copilot/conversations/:id/messages` `{message}`
- `GET /api/documents`
- `POST /api/documents` `{title,sections:[{heading,content}]}`
- `POST /api/documents/generate` `{conversationId,title,period:'7d'}`
- `GET /api/documents/:id`
- `PUT /api/documents/:id` `{expectedVersion,title,sections,changeSummary}`
- `POST /api/documents/:id/revise` `{instruction,sectionId?}`
- `POST /api/documents/:id/restore` `{version}`
- `POST /api/documents/:id/finalize`
- `GET /api/documents/:id/export?format=html|pdf|docx|xlsx|csv`

All user routes require session authentication; mutating routes also require CSRF checks. Documents/conversations are owner-scoped. Ad account ACLs remain shared-workspace as the prior app: do not deploy this as a public multi-tenant SaaS without adding per-tenant ACLs first.
