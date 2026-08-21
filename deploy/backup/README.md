# ORVYN production PostgreSQL backups

> **Private-Compose warning:** the primary one-VPS stack keeps PostgreSQL on an
> internal Docker network. A host process cannot resolve `PGHOST=postgres`, so
> this host-level age/AWS unit is not the supported scheduler for that stack.
> Use `orvyn-restic-backup.service` and the Compose `backup` profile documented
> in `deploy/README.md`. Do not publish PostgreSQL just to make this alternate
> unit connect. Keep this package only for a separately routed, authenticated
> PostgreSQL endpoint or an independent verification host.

This package creates encrypted PostgreSQL custom-format archives without ever
writing a plaintext dump to disk. The local archive is encrypted with `age`,
checksummed, and can optionally be copied to an S3-compatible offsite store.

## Required software

- PostgreSQL client tools compatible with the server (`pg_dump`, `pg_restore`)
- `age`
- GNU `sha256sum`, `stat`, and `flock` (normally coreutils/util-linux)
- AWS CLI v2 only when offsite upload is enabled

Run the service as a dedicated unprivileged account. The included systemd unit
expects the repository at `/opt/orvyn`, configuration at
`/etc/orvyn/backup.env`, and encrypted archives at `/var/backups/orvyn`.
Adjust these three paths in the unit if the deployment layout differs.

Prepare the account and paths before enabling the unit. Keep the script
root-owned but executable by the backup group:

```sh
useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin orvyn-backup
install -d -o root -g orvyn-backup -m 0750 /etc/orvyn
install -d -o orvyn-backup -g orvyn-backup -m 0700 /var/backups/orvyn
chown root:orvyn-backup /opt/orvyn/deploy/scripts/backup-postgres.sh
chmod 0750 /opt/orvyn/deploy/scripts/backup-postgres.sh
```

## Secrets

Never place secrets in `backup.env`. Mount or provision the following files
with owner-only access (normally mode `0400`) and make them readable by only
the backup service account:

- `/run/secrets/postgres_pgpass`: PostgreSQL password in standard
  [pgpass](https://www.postgresql.org/docs/current/libpq-pgpass.html) format.
- `/run/secrets/backup_age_recipient`: one or more public `age` recipients.
- `/run/secrets/backup_age_identity`: the private `age` identity used only by
  restore verification. Keep this off the database host when operationally
  possible.
- `/run/secrets/aws_credentials`: AWS shared credentials format, required only
  for S3 upload. Give this identity write-only or narrowly scoped access to the
  backup prefix.

The recipient and identity must be generated outside the repository. For
example, on a trusted administration machine:

```sh
age-keygen -o backup_age_identity
age-keygen -y backup_age_identity > backup_age_recipient
chmod 0400 backup_age_identity backup_age_recipient
```

Keep a tested, offline copy of `backup_age_identity`. Losing it makes every
backup permanently unrecoverable. Do not copy the identity into the repository,
container image, environment variables, logs, or backup directory.

## Configuration and scheduling

Copy `backup.env.example` to `/etc/orvyn/backup.env`, set ownership to
`root:orvyn-backup` and mode `0640` or stricter, and edit only non-secret
settings and secret file paths. Install the unit files as `root:root` mode
`0644`, then enable the timer:

```sh
systemctl enable --now orvyn-backup.timer
systemctl start orvyn-backup.service
systemctl status orvyn-backup.service
```

`BACKUP_RETENTION_DAYS=14` removes matching local encrypted archives older than
14 days after a new backup (and any configured upload) succeeds. Set it to `0`
to disable automatic local pruning. Offsite lifecycle and immutability rules
must be configured at the storage provider; the script never deletes remote
objects.

For S3-compatible storage, `BACKUP_S3_ENDPOINT_URL` must use HTTPS. The standard
AWS endpoint needs no endpoint override. Restrict bucket access, enable object
versioning/object lock where available, and alert on backup service failures.

## Verification

First copy both the encrypted archive and its adjacent `.sha256` file to a
trusted verification host. Archive verification checks the ciphertext checksum,
decrypts in a pipeline, and validates the PostgreSQL archive without retaining
plaintext:

```sh
BACKUP_AGE_IDENTITY_FILE=/run/secrets/backup_age_identity \
  /opt/orvyn/deploy/scripts/restore-verify-postgres.sh \
  /var/backups/orvyn/orvyn-postgres-YYYYMMDDTHHMMSSZ.dump.age
```

At least periodically, perform a full restore drill against an isolated
pgvector PostgreSQL instance. The configured verifier role must be allowed to
create/drop databases and create the trusted `vector` extension (normally an
isolated verifier administrator). The script creates a randomly named disposable database,
streams the decrypted archive into it, runs `SELECT 1`, and drops the database.
Because dropping a database is not secure erasure of its underlying pages, use
a disposable verifier with encrypted ephemeral storage and destroy that storage
after the drill. The explicit acknowledgement prevents accidental full restores
on an ordinary host:

```sh
set -a
. /etc/orvyn/backup.env
set +a
RESTORE_VERIFY_MODE=database \
RESTORE_VERIFY_EPHEMERAL_STORAGE_ACK=YES \
  /opt/orvyn/deploy/scripts/restore-verify-postgres.sh \
  /var/backups/orvyn/orvyn-postgres-YYYYMMDDTHHMMSSZ.dump.age
```

Use a verification server, not production, for restore drills. A warning that
the disposable database could not be removed requires immediate manual cleanup.
The script intentionally does not provide an in-place production restore:
production recovery requires an approved change window, a fresh pre-restore
backup, application downtime, and an explicit target database.

## Operational checks

- Monitor the systemd unit and the age of the newest offsite object.
- Perform an archive verification after every backup and a full restore drill
  on a documented schedule.
- Keep multiple generations across failure domains and test key recovery.
- Treat a missing checksum, failed upload, failed decryption, or failed restore
  as a backup failure.
