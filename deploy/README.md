# ORVYN production deployment

This package deploys ORVYN on one Linux VPS with only Caddy ports 80/443
published. PostgreSQL/pgvector and Redis stay on an internal Docker network;
PHP-FPM, Horizon, scheduler, Reverb, WhatsApp, and private Ollama have no host
ports. Caddy obtains and renews public TLS certificates automatically.

The scripts are deliberately fail-closed. A deploy stops before migration when
DNS, secret permissions/content, Firebase project alignment, production app
checks, dependency audits, image scans, encrypted offsite backup, or runtime
configuration validation fails.

## Fixed image versions

- PHP `8.3.32-fpm-bookworm`
- Caddy `2.11.4-alpine`
- PostgreSQL/pgvector `pgvector/pgvector:0.8.5-pg17-bookworm`
- Redis `7.4.9-alpine`
- Composer `2.9.8`
- restic `0.19.1`
- Ollama `0.32.3`
- Node `22.23.1-bookworm-slim`

The deploy manifest records resolved base-image digests and local application
image IDs plus resolved Ollama model IDs. Tags remain registry/model-registry
mutable, so the deploy always pulls, scans/verifies, and records what it used;
rollback refuses an image or model whose ID no longer matches its recorded
manifest.

## Host prerequisites

Use a supported, patched Linux VPS with enough memory for PostgreSQL and the
selected Ollama model (8 GB RAM is a practical starting point; measure your
model). Install Docker Engine, Docker Compose v2.24+, Git, `jq`, `curl`,
`openssl`, GNU core utilities, and Trivy. Enable automatic OS security updates.

Create a dedicated deployment account. Membership in the Docker group is
root-equivalent and must be limited to this account. Keep SSH key-only, disable
password/root login, and restrict administrative SSH by source IP or VPN.

At the provider firewall and host firewall, allow inbound:

- TCP 22 only from administrative sources;
- TCP 80 from the internet for ACME and HTTP-to-HTTPS redirect;
- TCP 443 and UDP 443 from the internet for HTTPS/HTTP3.

Deny every other inbound port. Do not publish PostgreSQL, Redis, Reverb,
WhatsApp, Ollama, or PHP-FPM. Configure a public A record directly to the VPS
address before deployment. The preflight requires that the A record contains
`ORVYN_EXPECTED_PUBLIC_IP`.

Check that Docker subnets `172.28.0.0/24` and `172.29.0.0/24` do not overlap a
host/VPN route. Change both Compose subnets and the exact edge trusted-proxy IP
together if they conflict; never trust `*` or a whole app subnet.

## Configuration and secrets

Install the checkout at `/opt/orvyn` (or adjust paths in systemd units). Copy
[`deploy/.env.production.example`](./.env.production.example) to
`/etc/orvyn/.env.production`, replace every example value, set mode `0600`, and
keep it owned by the deployment account. It contains identifiers and policy,
not secrets.

Create `/etc/orvyn/secrets` as mode `0700`; create every filename documented in
[`deploy/secrets/README.md`](./secrets/README.md) as independent mode `0600`
files. Never place that directory inside the repository. Keep database role
passwords distinct. The same `WHATSAPP_SERVICE_TOKEN` and webhook secret files
are mounted into Laravel and the sidecar, but the two values must differ.

The Firebase service-account `project_id`, web values, and EAS mobile values
must all name one Firebase project. Mobile production builds must use
`EXPO_PUBLIC_API_URL=https://<domain>/api/v1`; Google sign-in then exchanges the
Firebase ID token with the same Laravel/Sanctum backend. Expo push delivery
requires a valid owner-scoped access token file.

Place the reviewed Firebase Android `google-services.json` in
`ORVYN_SECRETS_DIR` and record the canonical production signing fingerprint in
`ORVYN_ANDROID_RELEASE_SHA1`. Preflight requires the file to contain
`app.orvyn.mobile`, that exact signing SHA-1, an Android OAuth client, and the
same Web OAuth client/project number used by the mobile environment. The file
is validation input only: it is never mounted into Compose or included in a
server image. Configure the same file separately in the EAS `production`
environment as a File variable named `GOOGLE_SERVICES_JSON`, and configure the
corresponding FCM credential in EAS before building or releasing Android.

Keep `ORVYN_COOKIE_DOMAIN` exactly equal to `ORVYN_DOMAIN`. This same-origin
topology does not need parent-domain cookies, and avoiding them prevents sibling
subdomains from shadowing or receiving the session cookie. Firebase-sensitive
account deletion requires a fresh identity; production fixes
`FIREBASE_REAUTH_MAX_AGE_SECONDS` at 300 seconds.

Baileys is not an official WhatsApp Business transport. Setting its production
acknowledgement to `true` records acceptance of account-ban/protocol-break risk;
it does not remove that risk. Restrict session-admin email accounts, protect
them with strong Google MFA, and use a dedicated WhatsApp account.

## First deploy

Commit every intended source/deployment change. Deploying a dirty tree or a
short/non-current Git SHA is forbidden.

Initialize the offsite restic repository once after building the first backup
image and before the first normal deploy backup:

```sh
export ORVYN_RELEASE_ID="$(git rev-parse HEAD)"
docker compose --env-file /etc/orvyn/.env.production \
  -f /opt/orvyn/deploy/compose.production.yml build --pull backup
RESTIC_INIT_ACK=YES docker compose --env-file /etc/orvyn/.env.production \
  -f /opt/orvyn/deploy/compose.production.yml --profile backup \
  run --rm --no-deps backup init
```

The initialization acknowledgement is accepted only by the one-off command;
do not save it in the environment file.

Run:

```sh
/opt/orvyn/deploy/scripts/deploy.sh \
  --env-file /etc/orvyn/.env.production
```

The release ID defaults to the full checked-out Git SHA. The deploy:

1. validates DNS, exact host/proxy allowlists, secret ownership/content,
   Firebase service-account and Android client JSON, release signing identity,
   Expo token, Compose isolation, and source cleanliness;
2. pulls exact base tags, builds isolated contexts, runs Composer/npm audits,
   checks PHP requirements, scans images with Trivy, validates Caddy, and proves
   backend/WhatsApp processes drop to UID 10001;
3. starts private PostgreSQL, Redis, and Ollama; verifies non-superuser roles,
   pgvector, and database ownership; then pulls and verifies both configured
   Ollama generation/embedding models with a bounded timeout;
4. runs Laravel's enforced production check and streams a consistent
   PostgreSQL archive into encrypted offsite restic storage;
5. on upgrades, enables shared Redis maintenance mode and stops Horizon and
   scheduler before applying an isolated forward migration;
6. starts every service, exits maintenance, verifies real TLS/security headers,
   CSRF, Host rejection, and valid/hostile WebSocket origins, then atomically
   records the release manifest.

If an upgrade fails after maintenance begins, the script attempts to restore
the previously recorded application images. It never automatically reverses a
database migration or restores a backup.

If the first release fails after public activation starts—including a failed
smoke test or release-manifest write—the script stops every public/application
service from that unverified release while preserving private data volumes for
investigation. A failed command is never recorded as the current release.

After the first deploy, pair WhatsApp from an authorized session-admin account.
The `/health` check proves the sidecar process is alive; it intentionally does
not claim the account is paired.

## Backups and restore drills

The Compose `backup` profile can reach private PostgreSQL/Redis without
publishing them. It streams `pg_dump` directly into restic encryption, decrypts
the newest archive into `pg_restore --list` for validation, asks Redis for a
fresh RDB, and backs up app storage, Caddy state, Redis data, and WhatsApp
session state read-only. It then applies retention and runs `restic check`.

Enable [`orvyn-restic-backup.timer`](./backup/orvyn-restic-backup.timer) after
installing both unit files and adjusting account/paths if needed:

```sh
systemctl enable --now orvyn-restic-backup.timer
systemctl start orvyn-restic-backup.service
```

Alert on every unit failure and on backup age. Configure remote immutability,
snapshots/object lock, independent credentials, and provider-side retention.
Run a periodic archive verification:

```sh
export ORVYN_RELEASE_ID="$(cat /var/lib/orvyn/current-release)"
docker compose --env-file /etc/orvyn/.env.production \
  -f /opt/orvyn/deploy/compose.production.yml --profile backup \
  run --rm backup verify
```

Perform full restore drills only on an isolated pgvector PostgreSQL 17 verifier
with encrypted disposable storage. Create the `vector` extension as verifier
administrator before restoring, stream the chosen restic dump to
`pg_restore --exit-on-error --no-owner --no-privileges`, run application
queries, then destroy the verifier storage. Never run a full restore drill
against production.

The alternate age/S3 scripts in [`deploy/backup/README.md`](./backup/README.md)
are for hosts that can securely resolve/reach their configured PostgreSQL
endpoint. Their sample `PGHOST=postgres` is not reachable from the host in this
private Compose architecture; use the Compose restic service here. Do not bind
PostgreSQL to the host merely to make the alternate unit work.

PostgreSQL is the authoritative recovery source. Redis and live WhatsApp files
are captured after an RDB request/file snapshot but still have higher recovery
uncertainty than PostgreSQL; disaster recovery may lose active sessions,
queued work, or require WhatsApp re-pairing. Test this explicitly.

## Rollback

Rollback changes application images only. Confirm the target code can operate
on the current forward schema and that current secrets/config are intended:

```sh
/opt/orvyn/deploy/scripts/rollback.sh \
  --env-file /etc/orvyn/.env.production \
  --to <full-recorded-release-sha> \
  --ack-schema-compatible \
  --ack-current-config
```

The script verifies the recorded image IDs, re-scans them, takes a new encrypted
offsite backup, enters maintenance, stops writers, starts the old images with
`--no-build --pull never`, and repeats smoke tests. It does not check out Git,
delete volumes, run `migrate:rollback`, or restore the database automatically.
Incompatible schema recovery requires an approved outage and tested restore
procedure.

## Secret rotation

Rotate app/WhatsApp/Reverb/Expo secrets through new files and a coordinated
restart. PostgreSQL and Redis passwords also exist inside their running data
stores; replacing only the file will break clients. Change the database role or
Redis credential first through a controlled maintenance procedure, atomically
replace the matching file, and redeploy. Keep a tested Laravel previous app key
strategy before rotating `APP_KEY`, otherwise encrypted data/sessions become
unreadable.

## Residual risk and external validation

A single VPS remains one availability and administrative failure domain.
Docker-daemon compromise, host-root compromise, provider outage, DDoS beyond
the provider edge, Baileys account enforcement, offsite provider compromise,
and an Ollama model's output quality cannot be eliminated by Compose. For
higher assurance, split data/backup services across hosts, add managed WAF/DDoS
protection, central immutable logs/metrics, and formal incident response.

Before real production traffic, run the package on a staging VPS and verify:

- all image builds and Trivy scans;
- host port scan shows only intended SSH/80/443;
- Firebase Google login on web and an EAS production build;
- Android push delivery from an EAS production build using the reviewed
  `GOOGLE_SERVICES_JSON` File variable and configured FCM credential;
- authenticated API/CSRF and Reverb reconnect behavior;
- WhatsApp pair/send/inbound flow with authorized recipients;
- queue/scheduler restart and idempotency;
- encrypted backup, isolated full restore, and image rollback drills;
- external TLS scan, CSP behavior, rate limits, resource exhaustion, alerting,
  and OS/provider firewall rules.

Those checks require real DNS, Firebase/Expo accounts and EAS Android FCM
credentials, an offsite SFTP target, WhatsApp pairing, image
registry/advisory access, and a Linux Docker host. They cannot be proven by
repository-only validation.
