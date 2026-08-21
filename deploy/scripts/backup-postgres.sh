#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

TEMP_ARCHIVE=""

log() {
    printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

fail() {
    log "ERROR: $*"
    exit 1
}

cleanup() {
    if [[ -n "${TEMP_ARCHIVE}" && -f "${TEMP_ARCHIVE}" ]]; then
        rm -f -- "${TEMP_ARCHIVE}"
    fi
}
trap cleanup EXIT HUP INT TERM

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

require_non_secret_setting() {
    local name="$1"
    [[ -n "${!name:-}" ]] || fail "${name} must be set"
}

for command_name in pg_dump age sha256sum mktemp stat flock; do
    require_command "${command_name}"
done

[[ -z "${PGPASSWORD:-}" ]] || fail "PGPASSWORD is forbidden; use PGPASSFILE"
[[ -z "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is forbidden; use PG* settings and PGPASSFILE"

require_non_secret_setting PGHOST
require_non_secret_setting PGDATABASE
require_non_secret_setting PGUSER

export PGPORT="${PGPORT:-5432}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
export PGPASSFILE="${PGPASSFILE:-/run/secrets/postgres_pgpass}"
readonly AGE_RECIPIENT_FILE="${BACKUP_AGE_RECIPIENT_FILE:-/run/secrets/backup_age_recipient}"
readonly BACKUP_DIR="${BACKUP_DIR:-/var/backups/orvyn}"
readonly RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

[[ "${PGPORT}" =~ ^[0-9]{1,5}$ ]] || fail "PGPORT must be numeric"
(( PGPORT >= 1 && PGPORT <= 65535 )) || fail "PGPORT is outside the valid range"
[[ "${PGCONNECT_TIMEOUT}" =~ ^[0-9]+$ ]] || fail "PGCONNECT_TIMEOUT must be a non-negative integer"
[[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]] || fail "BACKUP_RETENTION_DAYS must be a non-negative integer"

require_absolute_readable_file "${PGPASSFILE}" "PGPASSFILE"
require_absolute_readable_file "${AGE_RECIPIENT_FILE}" "BACKUP_AGE_RECIPIENT_FILE"
require_private_file_permissions "${PGPASSFILE}" "PGPASSFILE"
[[ "${BACKUP_DIR}" == /* ]] || fail "BACKUP_DIR must be an absolute path"
[[ ! -L "${BACKUP_DIR}" ]] || fail "BACKUP_DIR must not be a symbolic link"

mkdir -p -- "${BACKUP_DIR}"
chmod 0700 -- "${BACKUP_DIR}"
exec 9> "${BACKUP_DIR}/.backup.lock"
chmod 0600 -- "${BACKUP_DIR}/.backup.lock"
flock -n 9 || fail "Another backup process is already running"

readonly TIMESTAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
readonly ARCHIVE_BASENAME="orvyn-postgres-${TIMESTAMP}.dump.age"
readonly ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_BASENAME}"
readonly CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"

[[ ! -e "${ARCHIVE_PATH}" && ! -e "${CHECKSUM_PATH}" ]] || fail "Backup destination already exists"
TEMP_ARCHIVE="$(mktemp "${BACKUP_DIR}/.${ARCHIVE_BASENAME}.partial.XXXXXX")"
chmod 0600 -- "${TEMP_ARCHIVE}"

log "Creating encrypted PostgreSQL backup"
if ! pg_dump \
    --format=custom \
    --compress=6 \
    --no-owner \
    --no-privileges \
    | age \
        --encrypt \
        --recipients-file "${AGE_RECIPIENT_FILE}" \
        --output "${TEMP_ARCHIVE}"; then
    fail "PostgreSQL backup or encryption failed"
fi

[[ -s "${TEMP_ARCHIVE}" ]] || fail "Encrypted backup is empty"
mv -- "${TEMP_ARCHIVE}" "${ARCHIVE_PATH}"
TEMP_ARCHIVE=""
chmod 0600 -- "${ARCHIVE_PATH}"

readonly ARCHIVE_HASH="$(sha256sum -- "${ARCHIVE_PATH}" | awk '{print $1}')"
printf '%s  %s\n' "${ARCHIVE_HASH}" "${ARCHIVE_BASENAME}" > "${CHECKSUM_PATH}"
chmod 0600 -- "${CHECKSUM_PATH}"

if [[ -n "${BACKUP_S3_URI:-}" ]]; then
    require_command aws
    [[ "${BACKUP_S3_URI}" == s3://* ]] || fail "BACKUP_S3_URI must start with s3://"

    export AWS_SHARED_CREDENTIALS_FILE="${BACKUP_AWS_CREDENTIALS_FILE:-/run/secrets/aws_credentials}"
    require_absolute_readable_file "${AWS_SHARED_CREDENTIALS_FILE}" "BACKUP_AWS_CREDENTIALS_FILE"
    require_private_file_permissions "${AWS_SHARED_CREDENTIALS_FILE}" "BACKUP_AWS_CREDENTIALS_FILE"

    unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
    aws_global_args=()
    if [[ -n "${BACKUP_S3_ENDPOINT_URL:-}" ]]; then
        [[ "${BACKUP_S3_ENDPOINT_URL}" == https://* ]] || fail "BACKUP_S3_ENDPOINT_URL must use HTTPS"
        [[ "${BACKUP_S3_ENDPOINT_URL}" != *'@'* ]] \
            || fail "BACKUP_S3_ENDPOINT_URL must not contain embedded credentials"
        aws_global_args+=(--endpoint-url "${BACKUP_S3_ENDPOINT_URL}")
    fi

    readonly REMOTE_PREFIX="${BACKUP_S3_URI%/}"
    log "Uploading encrypted backup to offsite storage"
    aws "${aws_global_args[@]}" s3 cp \
        "${ARCHIVE_PATH}" "${REMOTE_PREFIX}/${ARCHIVE_BASENAME}" --only-show-errors
    aws "${aws_global_args[@]}" s3 cp \
        "${CHECKSUM_PATH}" "${REMOTE_PREFIX}/${ARCHIVE_BASENAME}.sha256" --only-show-errors
fi

if (( RETENTION_DAYS > 0 )); then
    find "${BACKUP_DIR}" -maxdepth 1 -type f \
        \( -name 'orvyn-postgres-*.dump.age' -o -name 'orvyn-postgres-*.dump.age.sha256' \) \
        -mtime "+${RETENTION_DAYS}" -delete
fi

log "Encrypted backup completed: ${ARCHIVE_PATH}"
