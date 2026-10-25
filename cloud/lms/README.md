# LMS sync while the Mac is off

**Deployment status, 25 October 2026:** prepared but suspended. Hosted reads receive a Cloudflare challenge (HTTP 403) from the university; no cloud writes have been enabled. The local connector still requires the Mac. See [verification and next step](../../docs/qa/2026-10-25-lms-cloud-sync.md).

The default-branch workflow `.github/workflows/lms-cloud-sync.yml` runs a read-only Moodle collector on standard GitHub-hosted Ubuntu, about every 15 minutes (UTC minutes 7, 22, 37, 52). It needs no running Mac, Laravel server, application database, APP_KEY, paid Firebase plan or GCP service-account key. Firebase stays on Spark with billing disabled and unlinked.

The deployed connector is paired to the existing student's LMS source and Firebase UID. This is a single-account deployment, not a token provisioning service for other users. Each additional student needs their own verified credentials and separately scoped deployment.

## Identity and secrets

- `ORVYN_LMS_CONFIG`: encrypted GitHub Actions repository secret containing only `project`, `uid`, `source_id`, `calendar_url` and `api_token`. Never commit it or print it. The export command verifies the API account matches the calendar owner before writing to a new private file. Upload using `gh secret set ...` over stdin, then delete that temporary file.
- `ORVYN_WIF_PROVIDER`, `ORVYN_CLOUD_SERVICE_ACCOUNT`: repository variables for Google Workload Identity Federation.
- `ORVYN_CLOUD_ENABLED=true`: enables scheduled jobs after a successful dry run and coordinated cutover. Dispatch remains available for verification.
- The identity provider trusts numeric repository and owner IDs, `refs/heads/main`, this exact workflow path, and only `schedule`/`workflow_dispatch` events. No pull-request trigger. Actions are pinned to verified commits. Dependencies install before the LMS secret is passed to the collector step.
- Google issues a short-lived access token. No Firebase CLI session, personal refresh token, Laravel encryption key or service-account private key is stored in GitHub.
- Dedicated custom IAM role: `datastore.databases.get`, `datastore.entities.get`, `datastore.entities.create`, `datastore.entities.update`. No list/delete or Auth administration. **Firestore IAM permissions apply at database/project scope, not per document**; the connector separately restricts REST destinations to the paired user's four document paths. A compromised trusted main-branch workflow could use the service account's database permissions. Review repository collaborators and changes to this workflow accordingly.

## Data and pause controls

The collector only calls six allowed Moodle read APIs. It never submits assignments, starts quizzes or writes grades. Hidden grades remain hidden; ungraded results remain null. Personal completion and financial data are preserved.

A compare-and-set transaction writes the account state, connection status, and the previous account snapshot to `lms_cloud_backups/{uid}` together. The backup contains private student data and remains inaccessible to client applications under the existing catch-all rules. It is a latest pre-sync recovery snapshot, not a versioned archive. On conflicts the connector re-reads the account and rechecks pause/deletion/source identity, with at most five attempts. Oversize data fails closed. Failed reads keep the last data.

Pause/resume and manual requests in the app take effect on the next scheduled run. Manual requests do not start an immediate GitHub job. Cloud status allows 35 minutes before reporting a delay. The local LaunchAgent detects `mode=github_actions` at startup and handles only local reminders, so it does not overwrite cloud status. Restart it during cutover. Push reminders are still a local service and require the Mac; this workflow moves LMS synchronization only.

## Verification and operation

1. `composer install --working-dir=cloud/lms --no-plugins --no-scripts`
2. `php cloud/lms/test-collector.php` and `node --test scripts/test/lms-cloud.test.cjs` (fixtures, no credentials).
3. Dispatch `LMS cloud sync` with `dry_run=true`. It reads the account and LMS without writing Firestore. Logs contain aggregate counts only.
4. Save a private account snapshot, stop the local bridge, dispatch with `dry_run=false`, and verify the cloud status, preserved data, backup and successful hosted run. Then enable scheduled jobs and restart the local LaunchAgent in cloud mode.
5. Inspect GitHub Actions run failures and the app's last successful sync timestamp. Re-pair/re-export the LMS secret if access expires. Never paste credentials into issues or logs.

To fall back, set `ORVYN_CLOUD_ENABLED=false`, let any in-flight run finish, change the protected status mode back to `local_bridge` using an authorized owner tool and restart the local bridge. Avoid simultaneous writers during a mode change.

## Free-service limits

Standard GitHub-hosted runners are free for this public repository. This setup does not use paid runners, Cloud Functions, Cloud Run, Cloud Scheduler or a billing account. Spark quotas still apply; a normal run uses a few Firestore reads and at most three writes, with one latest backup document.

GitHub schedules can be delayed or dropped during heavy load and do not provide a precise 15-minute guarantee. Public-repository scheduled workflows are automatically disabled after 60 days without repository activity; re-enable in Actions if this happens. Moving to a private repository changes the included minutes and should be reviewed before doing so. Do not enable paid overages for this setup.

References: [GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [schedule limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [Google WIF](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines), [Firestore IAM](https://docs.cloud.google.com/firestore/docs/security/iam).
