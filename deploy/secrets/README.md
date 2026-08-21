# Secret contract

Do not store production values in this directory. It exists only to document
the filenames consumed from the absolute `ORVYN_SECRETS_DIR` host path.

Required owner-only files:

- `app_key`
- `postgres_admin_password`
- `postgres_app_password`
- `postgres_backup_password`
- `redis_password`
- `reverb_app_secret`
- `whatsapp_service_token`
- `whatsapp_webhook_secret`
- `firebase_credentials.json`
- `google-services.json`
- `expo_access_token`
- `restic_repository`
- `restic_password`
- `restic_ssh_key`
- `restic_known_hosts`

The production directory must be mode `0700`, every file mode `0600`, and all
paths must be owned by the deployment account. Docker Compose mounts them only
into consumers. Application entrypoints read them briefly as container root,
then use `gosu` to run backend and WhatsApp processes as UID/GID 10001. This
avoids weakening host files merely to make ordinary Compose bind-mounted
secrets readable by a non-root UID.

Firebase JSON is copied to a per-container `/tmp` tmpfs file owned by UID 10001
so runtime token verification remains readable after privilege drop; it never
enters the image or a persistent volume. PostgreSQL similarly copies its three
role passwords into a protected tmpfs directory owned by the `postgres` user
before the official image drops privileges. Redis writes its password into a
mode-0600 tmpfs configuration file, never a process argument.

Generate independent random values on the VPS with `umask 077`. Use Laravel's
`base64:` prefix for `app_key`; use at least 48 random bytes for other generated
tokens/passwords. The Redis password is deliberately restricted to letters,
digits, underscore, and hyphen because it is written into a protected Redis
configuration file rather than process arguments.

`firebase_credentials.json` must be a Firebase/Google service-account JSON with
`type=service_account`, `project_id`, `client_email`, and a PEM private key.
Copy it directly from the trusted provider console and never convert it into a
single-line environment variable. `expo_access_token` is required whenever
push delivery is enabled.

`google-services.json` is the reviewed Firebase Android client configuration,
not a server credential. It is kept owner-only here so preflight can verify the
Firebase project, `app.orvyn.mobile` package, production signing SHA-1, Android
OAuth client, and matching Web OAuth client. Compose never mounts or copies it
into a server image. Upload the same reviewed file separately to the EAS
production environment as the File variable `GOOGLE_SERVICES_JSON`.

`restic_repository` must use passwordless SFTP syntax, for example
`sftp:backup@backup.example.net:/srv/restic/orvyn`. Put the dedicated OpenSSH
private key in `restic_ssh_key`. Pin the verified remote host key in
`restic_known_hosts`; compare its fingerprint through an independent channel
before trusting it. The repository must be on a different failure domain from
the VPS.
