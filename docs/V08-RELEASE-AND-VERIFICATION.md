# v0.8 Source implementation and verification

## Carried forward from v0.7.4

Login, multi-account Meta OAuth, account discovery/mapping, media library, paused publishing engine, v0.7.4 thumbnail lookup and recovery, Easy Ads, advanced targeting/placements, AI Command Center, finance, monitoring, Custom Reports, editable panel name and background queue.

## Added in v0.8 source

- New server-side AI Copilot tools (read-only), persisted conversations/messages, authorization, rate limits, untrusted data boundaries, Bengali/English/Banglish instructions.
- Performance, campaign breakdown, account list, publishing failures, scheduler health and draft/report history tools.
- AI Documents: manual and OpenAI generation from a chat, versioned sections, precise section-only revision, optimistic edit conflict detection, restore, finalize, owner-based access.
- Documents UI, exports: HTML, PDF, DOCX, XLSX, CSV.
- AI report input truncation with total aggregation preserved and explicit evidence sampling instead of blanket 250-ad rejection.
- Additive migration 007; fresh-install v0.8 SQL; readiness checks.

## Live release blockers and boundaries

- React production build and full integration suite **need GitHub CI** because npm registry was inaccessible in this environment.
- OpenAI and Meta live integration must be tested using the intended authorized account and API version; do not claim success on real ads just because unit tests pass.
- For server-generated PDFs containing Bengali text set `PDF_FONT_PATH` to an installed Unicode Bengali font. The HTML export offers browser Print/Save as PDF without needing a server font.
- Chat's actual Meta write operations remain deliberately mediated by the existing human-reviewed AI Command Center and Publishing Center. It cannot automatically activate or spend.
- Report source is latest synced Meta Insight data. The previous manual Custom Report engine still limits a single query by date range and size; for huge exports use batches.
- Shared-workspace account permissions are inherited, not multi-tenant isolation.

## Security

Never upload `.env`, OAuth token, R2 Secret or private signed URL to GitHub or AI prompts. Use a private repo and rotate secrets exposed accidentally. Prompt injection risk is handled by tool boundary, but live security review is still needed.
