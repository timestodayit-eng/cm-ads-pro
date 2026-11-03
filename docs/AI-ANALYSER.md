# AI reports in 0.3

Existing OpenAI Responses API structured-output integration remains read-only.
Snapshots use complete 1/3/7-day reporting periods; the interactive dashboard has
additional today/recent-hour views. Reports now receive separate all-clicks, link
clicks, landing page views and mapped lead/call actions, with missing values kept
null. The configured FX estimate carries rate/date/source/coverage information.

No actual calls, conversions or sales are inferred from click counts. Every finding
must cite an existing account/ad/currency reference in the supplied data. Suggestions
cannot change an ad, budget, audience or destination. No applicant PII is supplied.

Scheduled AI reports have their own Settings toggle (OFF by default), an interval
in hours (AI_REPORT_INTERVAL_HOURS, default 24), and daily report-attempt cap.
A Meta sync every five minutes does not mean 288 OpenAI requests a day. Ambiguous
interrupted AI jobs are not automatically retried because they might have incurred
charges. The model remains configurable; availability depends on the API project.
