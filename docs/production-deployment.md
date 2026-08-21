# Production deployment entrypoint

The supported one-VPS production path is
[`deploy/README.md`](../deploy/README.md). Operators must use the production
Compose file and its fail-closed scripts:

- `deploy/scripts/preflight.sh`
- `deploy/scripts/deploy.sh`
- `deploy/scripts/rollback.sh`
- `deploy/scripts/run-offsite-backup.sh`

Do not deploy by running a generic Laravel migration/server command, exposing a
development Vite server, publishing PostgreSQL/Redis ports, or copying local
`.env` files. The hardened path provides TLS Caddy, private data networks,
file-mounted secrets, non-root/read-only application containers, production
readiness enforcement, encrypted offsite backup, immutable release records,
security scanning, smoke tests, and image-only rollback without automatic
down-migrations.

Android production release is a separate external step. The deploy preflight
validates the owner-only `google-services.json` copy in
`ORVYN_SECRETS_DIR` against the Firebase project, `app.orvyn.mobile`, the
declared release signing SHA-1, and Web OAuth client. That file is never
included in server images; upload the same reviewed file to EAS as the
production File variable `GOOGLE_SERVICES_JSON` and configure EAS FCM
credentials before releasing Android.
