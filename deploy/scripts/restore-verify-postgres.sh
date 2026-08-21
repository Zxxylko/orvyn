#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

VERIFY_DATABASE=""

log() {
    printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

fail() {
    log "ERROR: $*"
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "Required command is unavailable: $1"
}

require_absolute_readable_file() {
    local path="$1"
    local label="$2"
    [[ "${path}" == /* ]] || fail "${label} must be an absolute path"
    [[ -f "${path}" && -r "${path}" ]] || fail "${label} is not a readable file: ${path}"
}

require_private_file_permissions() {
    local path="$1"
    local label="$2"
    local mode
    local mode_value

    mode="$(stat -Lc '%a' -- "${path}")" || fail "Could not inspect ${label} permissions"
    mode="${mode: -3}"
    [[ "${mode}" =~ ^[0-7]{3}$ ]] || fail "Could not parse ${label} permissions"
    mode_value=$((8#${mode}))
    (( (mode_value & 077) == 0 )) \
        || fail "${label} must not grant any group or other permissions"
}

drop_verify_database() {
    local original_status="$?"

    if [[ -n "${VERIFY_DATABASE}" ]]; then
        log "Removing temporary verification database"
        if ! dropdb --if-exists --maintenance-db="${PGMAINTENANCE_DB}" -- "${VERIFY_DATABASE}" \
            >/dev/null 2>&1; then
            log "ERROR: could not remove temporary database ${VERIFY_DATABASE}"
            (( original_status != 0 )) || original_status=1
        fi
    fi

    trap - EXIT HUP INT TERM
    exit "${original_status}"
}
trap drop_verify_database EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

[[ "$#" -eq 1 ]] || fail "Usage: ${0##*/} /absolute/path/to/backup.dump.age"
readonly ARCHIVE_PATH="$1"
readonly CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"
readonly VERIFY_MODE="${RESTORE_VERIFY_MODE:-archive}"
readonly AGE_IDENTITY_FILE="${BACKUP_AGE_IDENTITY_FILE:-/run/secrets/backup_age_identity}"

for command_name in age pg_restore sha256sum stat; do
    require_command "${command_name}"
done

require_absolute_readable_file "${ARCHIVE_PATH}" "Encrypted backup"
require_absolute_readable_file "${CHECKSUM_PATH}" "Backup checksum"
require_absolute_readable_file "${AGE_IDENTITY_FILE}" "BACKUP_AGE_IDENTITY_FILE"
require_private_file_permissions "${AGE_IDENTITY_FILE}" "BACKUP_AGE_IDENTITY_FILE"
[[ "${VERIFY_MODE}" == "archive" || "${VERIFY_MODE}" == "database" ]] \
    || fail "RESTORE_VERIFY_MODE must be archive or database"

IFS=' ' read -r EXPECTED_HASH CHECKSUM_NAME EXTRA < "${CHECKSUM_PATH}" \
    || fail "Could not read checksum"
[[ "${EXPECTED_HASH}" =~ ^[[:xdigit:]]{64}$ ]] || fail "Checksum file has an invalid SHA-256 value"
[[ -z "${EXTRA:-}" ]] || fail "Checksum file has an invalid format"
CHECKSUM_NAME="${CHECKSUM_NAME#\*}"
[[ "${CHECKSUM_NAME}" == "${ARCHIVE_PATH##*/}" ]] || fail "Checksum filename does not match the backup"

readonly ACTUAL_HASH="$(sha256sum -- "${ARCHIVE_PATH}" | awk '{print $1}')"
[[ "${ACTUAL_HASH}" == "${EXPECTED_HASH,,}" ]] || fail "Encrypted backup checksum mismatch"

if [[ "${VERIFY_MODE}" == "archive" ]]; then
    log "Verifying encrypted PostgreSQL archive"
    age --decrypt --identity "${AGE_IDENTITY_FILE}" "${ARCHIVE_PATH}" \
        | pg_restore --list >/dev/null
    log "Backup archive verification succeeded"
    exit 0
fi

for command_name in createdb dropdb psql; do
    require_command "${command_name}"
done

[[ "${RESTORE_VERIFY_EPHEMERAL_STORAGE_ACK:-}" == "YES" ]] \
    || fail "Database mode requires RESTORE_VERIFY_EPHEMERAL_STORAGE_ACK=YES"
[[ -z "${PGPASSWORD:-}" ]] || fail "PGPASSWORD is forbidden; use PGPASSFILE"
[[ -z "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is forbidden; use PG* settings and PGPASSFILE"

: "${PGHOST:?PGHOST must be set}"
: "${PGUSER:?PGUSER must be set}"
export PGPORT="${PGPORT:-5432}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
export PGPASSFILE="${PGPASSFILE:-/run/secrets/postgres_pgpass}"
export PGMAINTENANCE_DB="${PGMAINTENANCE_DB:-postgres}"

[[ "${PGPORT}" =~ ^[0-9]{1,5}$ ]] || fail "PGPORT must be numeric"
(( PGPORT >= 1 && PGPORT <= 65535 )) || fail "PGPORT is outside the valid range"
require_absolute_readable_file "${PGPASSFILE}" "PGPASSFILE"
require_private_file_permissions "${PGPASSFILE}" "PGPASSFILE"

VERIFY_DATABASE="orvyn_restore_verify_$(date -u +'%Y%m%d%H%M%S')_${RANDOM}"
[[ "${VERIFY_DATABASE}" =~ ^[a-z0-9_]+$ ]] || fail "Generated verification database name is invalid"

log "Creating temporary database for full restore verification"
createdb --maintenance-db="${PGMAINTENANCE_DB}" -- "${VERIFY_DATABASE}"

log "Pre-creating pgvector in the isolated verification database"
psql --dbname="${VERIFY_DATABASE}" --no-psqlrc --set=ON_ERROR_STOP=1 \
    --command='CREATE EXTENSION IF NOT EXISTS vector' >/dev/null

log "Restoring encrypted backup into temporary database"
age --decrypt --identity "${AGE_IDENTITY_FILE}" "${ARCHIVE_PATH}" \
    | pg_restore \
        --exit-on-error \
        --no-owner \
        --no-privileges \
        --dbname="${VERIFY_DATABASE}"

psql --dbname="${VERIFY_DATABASE}" --no-psqlrc --tuples-only --command='SELECT 1' \
    | tr -d '[:space:]' \
    | grep -qx '1' \
    || fail "Restored database health query failed"

log "Full restore verification succeeded"
