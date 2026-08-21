#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

log() {
    printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

fail() {
    log "ERROR: $*"
    exit 1
}

require_secret_file() {
    local path="$1"
    local label="$2"

    [[ "${path}" == /run/secrets/* ]] || fail "${label} must use /run/secrets"
    [[ -f "${path}" && -r "${path}" && ! -L "${path}" ]] \
        || fail "${label} is not a readable regular file"
}

read_one_line_secret() {
    local path="$1"
    local label="$2"
    local minimum_length="$3"
    local value

    require_secret_file "${path}" "${label}"
    value="$(< "${path}")"
    [[ "${value}" != *$'\n'* && "${value}" != *$'\r'* ]] \
        || fail "${label} must contain one line"
    (( ${#value} >= minimum_length )) \
        || fail "${label} must contain at least ${minimum_length} characters"
    printf '%s' "${value}"
}

escape_pgpass() {
    sed -e 's/\\/\\\\/g' -e 's/:/\\:/g'
}

readonly ACTION="${1:-backup}"
readonly RESTIC_REPOSITORY_FILE="${RESTIC_REPOSITORY_FILE:-/run/secrets/restic_repository}"
readonly RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/run/secrets/restic_password}"
readonly RESTIC_SSH_KEY_FILE="${RESTIC_SSH_KEY_FILE:-/run/secrets/restic_ssh_key}"
readonly RESTIC_KNOWN_HOSTS_FILE="${RESTIC_KNOWN_HOSTS_FILE:-/run/secrets/restic_known_hosts}"
readonly DB_PASSWORD_FILE="${POSTGRES_BACKUP_PASSWORD_FILE:-/run/secrets/postgres_backup_password}"
readonly REDIS_SECRET_FILE="${REDIS_PASSWORD_FILE:-/run/secrets/redis_password}"

require_secret_file "${RESTIC_REPOSITORY_FILE}" RESTIC_REPOSITORY_FILE
require_secret_file "${RESTIC_PASSWORD_FILE}" RESTIC_PASSWORD_FILE
require_secret_file "${RESTIC_SSH_KEY_FILE}" RESTIC_SSH_KEY_FILE
require_secret_file "${RESTIC_KNOWN_HOSTS_FILE}" RESTIC_KNOWN_HOSTS_FILE

repository="$(read_one_line_secret "${RESTIC_REPOSITORY_FILE}" RESTIC_REPOSITORY_FILE 12)"
[[ "${repository}" == sftp:* ]] \
    || fail "Only an encrypted SFTP restic repository is accepted by this production profile"
export RESTIC_REPOSITORY_FILE RESTIC_PASSWORD_FILE
export RESTIC_SFTP_COMMAND="ssh -i ${RESTIC_SSH_KEY_FILE} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${RESTIC_KNOWN_HOSTS_FILE}"

verify_latest_database_archive() {
    local latest_path

    latest_path="$(restic ls \
        --host=orvyn-production \
        --tag=postgres \
        latest \
        | awk '/[/]postgres[/]orvyn-[0-9TZ]+[.]dump$/ {print $NF}' \
        | tail -n1)"
    [[ -n "${latest_path}" ]] || fail "Could not locate the latest PostgreSQL archive in restic"

    log "Decrypting and validating the latest PostgreSQL archive"
    restic dump \
        --host=orvyn-production \
        --tag=postgres \
        latest \
        "${latest_path}" \
        | pg_restore --list >/dev/null
}

case "${ACTION}" in
    init)
        [[ "${RESTIC_INIT_ACK:-}" == "YES" ]] \
            || fail "Repository initialization requires RESTIC_INIT_ACK=YES"
        if restic snapshots >/dev/null 2>&1; then
            fail "Refusing to initialize: the repository already exists"
        fi
        log "Initializing encrypted offsite restic repository"
        restic init
        ;;
    check)
        log "Checking encrypted offsite restic repository"
        restic check
        ;;
    verify)
        restic snapshots >/dev/null \
            || fail "Offsite repository is unavailable or uninitialized"
        verify_latest_database_archive
        restic check
        ;;
    backup)
        restic snapshots >/dev/null \
            || fail "Offsite repository is unavailable or uninitialized"

        : "${PGHOST:=postgres}"
        : "${PGPORT:=5432}"
        : "${PGDATABASE:=orvyn}"
        : "${PGUSER:=orvyn_backup}"
        export PGHOST PGPORT PGDATABASE PGUSER
        export PGPASSFILE=/tmp/orvyn.pgpass

        db_password="$(read_one_line_secret "${DB_PASSWORD_FILE}" POSTGRES_BACKUP_PASSWORD_FILE 24)"
        printf '%s:%s:%s:%s:%s\n' \
            "$(printf '%s' "${PGHOST}" | escape_pgpass)" \
            "$(printf '%s' "${PGPORT}" | escape_pgpass)" \
            "$(printf '%s' "${PGDATABASE}" | escape_pgpass)" \
            "$(printf '%s' "${PGUSER}" | escape_pgpass)" \
            "$(printf '%s' "${db_password}" | escape_pgpass)" \
            > "${PGPASSFILE}"
        chmod 0600 "${PGPASSFILE}"
        unset db_password

        readonly timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
        log "Streaming a consistent PostgreSQL archive into encrypted offsite storage"
        pg_dump \
            --format=custom \
            --compress=6 \
            --no-owner \
            --no-privileges \
            --dbname="${PGDATABASE}" \
            | restic backup \
                --stdin \
                --stdin-filename="postgres/${PGDATABASE}-${timestamp}.dump" \
                --host=orvyn-production \
                --tag=postgres

        verify_latest_database_archive

        redis_password="$(read_one_line_secret "${REDIS_SECRET_FILE}" REDIS_PASSWORD_FILE 24)"
        export REDISCLI_AUTH="${redis_password}"
        unset redis_password
        log "Requesting a Redis point-in-time RDB snapshot"
        redis-cli -h "${REDIS_HOST:-redis}" -p "${REDIS_PORT:-6379}" BGSAVE >/dev/null
        for _ in $(seq 1 60); do
            in_progress="$(redis-cli -h "${REDIS_HOST:-redis}" -p "${REDIS_PORT:-6379}" \
                --raw INFO persistence | awk -F: '/^rdb_bgsave_in_progress:/{gsub("\\r", "", $2); print $2}')"
            [[ "${in_progress}" == "0" ]] && break
            sleep 1
        done
        [[ "${in_progress:-1}" == "0" ]] || fail "Redis snapshot did not complete within 60 seconds"
        unset REDISCLI_AUTH

        log "Backing up persistent volumes to encrypted offsite storage"
        restic backup \
            /data/app-storage \
            /data/caddy \
            /data/redis \
            /data/whatsapp \
            --host=orvyn-production \
            --tag=persistent-volumes \
            --exclude-caches

        log "Applying encrypted repository retention"
        restic forget \
            --keep-daily "${RESTIC_KEEP_DAILY:-14}" \
            --keep-weekly "${RESTIC_KEEP_WEEKLY:-8}" \
            --keep-monthly "${RESTIC_KEEP_MONTHLY:-12}" \
            --prune

        log "Checking repository metadata after backup"
        restic check
        log "Encrypted offsite backup completed"
        ;;
    *)
        fail "Usage: ${0##*/} {backup|check|init|verify}"
        ;;
esac
