# LMS cloud sync — 25 October 2026

## Outcome: prepared, not activated

The GitHub-hosted collector cannot currently access the university LMS. Both the authenticated calendar export and the student's read-only API return HTTP 403. A hosted diagnostic run confirms `Server: cloudflare`, HTML content, and `CF-Mitigated: challenge`. This is not evidence of an invalid student token: the same isolated collector on the owner's Mac successfully reads 35 current calendar events and 127 assessments through 148 successful HTTP responses.

No anti-bot bypass, browser-cookie forwarding, token substitution or external proxy is used. The cloud jobs were dry runs and did not write Firestore. The existing local connector stays active. **The Mac is still required for synchronization.** Cloud operation must not be presented as enabled until an authorized host can read LMS and a real hosted write is verified.

Evidence: [initial dry run](https://github.com/Zxxylko/orvyn/actions/runs/40115969382), [sanitized provider diagnosis](https://github.com/Zxxylko/orvyn/actions/runs/40116105793), [confirmed Cloudflare challenge](https://github.com/Zxxylko/orvyn/actions/runs/40154201335). Public logs contain aggregate counts and sanitized transport diagnostics; no tokens, calendar URL, grades or student names.

## Implementation

- Default-branch workflow and independent PHP collector, locked Composer dependencies, six allowed Moodle read functions. No Laravel database or APP_KEY required.
- Standard public GitHub runners, intended 15-minute schedule with bounded requests and run time. Scheduled writes were kept disabled throughout verification.
- Google WIF restricted to numeric repository/owner IDs, main branch, exact workflow path and schedule/manual events. Dedicated Firestore get/create/update role, no permanent Google key.
- Existing calendar/results mergers preserve personal progress and finance. Atomic account/status/pre-sync-backup commit uses compare-and-set with five attempts, rechecking pause, source identity and account deletion. Maximum account size remains 650 KB.
- Local connector recognizes cloud mode on startup and leaves LMS writes to the cloud, retaining only local reminders. Frontend has cloud-specific freshness, accurate queued manual requests, and immediate feedback after saving pause/resume. These cloud-mode changes have not been activated on the live account.

## Verification

- PHP LMS suite: 25 tests, 318 assertions passed.
- Standalone collector fixture passed without Laravel application, database or APP_KEY. Zero grade and submitted status verified.
- Node cloud suite: 11 tests passed, including cross-user transport denial, dry-run no writes, atomic backup, provider failure preservation, concurrent pause and bounded conflicts.
- Final full frontend suite: 326 tests passed across 62 files. Frontend lint and build passed, including the saved cloud-pause feedback change.
- Existing remote CI also fails on unrelated baseline code (GoogleWorkspaceService formatting, AuthContext effect lint, dependency audits). The newly added collector's own hosted tests and Google authentication pass. Full repository CI is not claimed green.
- Firebase billing was checked disabled and unlinked before and after setup.

## Suspension and next step

The unused workflow is disabled, `ORVYN_CLOUD_ENABLED=false`, the uploaded LMS secret is removed, and the unused service account's Firestore role is revoked. The service account and identity provider are disabled. No paid service or billing account was enabled. Identity definitions and source remain available for review, but they must be deliberately re-enabled and re-verified before use.

A free VM with a stable IP is a possible next host, subject to account availability and university access policy. If the LMS still presents Cloudflare challenges, ask campus administrators to authorize that integration/IP. Do not promise that a different host will automatically be accepted. Oracle Free Tier account readiness is awaiting the user.
