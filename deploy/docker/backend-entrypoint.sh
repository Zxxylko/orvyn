#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

fail() {
    printf 'ORVYN backend startup refused: %s\n' "$*" >&2
    exit 1
}

load_secret() {
    local name="$1"
    local file_name="${name}_FILE"
    local minimum_length="$2"
    local path="${!file_name:-}"
    local value

    [[ -n "${path}" ]] || fail "${file_name} is required"
    [[ "${path}" == /run/secrets/* ]] || fail "${file_name} must use /run/secrets"
    [[ -f "${path}" && -r "${path}" && ! -L "${path}" ]] || fail "${file_name} is not a readable regular file"

    value="$(< "${path}")"
    [[ "${value}" != *$'\n'* && "${value}" != *$'\r'* ]] || fail "${file_name} must contain one line"
    (( ${#value} >= minimum_length )) || fail "${name} is shorter than ${minimum_length} characters"

    printf -v "${name}" '%s' "${value}"
    export "${name}"
    unset value
}

load_secret APP_KEY 32
load_secret DB_PASSWORD 24
load_secret REDIS_PASSWORD 24
load_secret REVERB_APP_SECRET 32
load_secret WHATSAPP_SERVICE_TOKEN 32
load_secret WHATSAPP_WEBHOOK_SECRET 32

if [[ "${EXPO_PUSH_ENABLED:-true}" == "true" ]]; then
    load_secret EXPO_ACCESS_TOKEN 20
fi

[[ "${WHATSAPP_SERVICE_TOKEN}" != "${WHATSAPP_WEBHOOK_SECRET}" ]] \
    || fail "WhatsApp service and webhook secrets must differ"

[[ "${FIREBASE_CREDENTIALS:-}" == /run/secrets/* ]] \
    || fail "FIREBASE_CREDENTIALS must use /run/secrets"
[[ -f "${FIREBASE_CREDENTIALS}" && -r "${FIREBASE_CREDENTIALS}" && ! -L "${FIREBASE_CREDENTIALS}" ]] \
    || fail "FIREBASE_CREDENTIALS is not a readable regular file"

firebase_source="${FIREBASE_CREDENTIALS}"
firebase_runtime_dir="/tmp/orvyn-runtime-secrets"
firebase_runtime_file="${firebase_runtime_dir}/firebase_credentials.json"
mkdir -p "${firebase_runtime_dir}"
chmod 0700 "${firebase_runtime_dir}"
cp --no-preserve=mode,ownership,timestamps "${firebase_source}" "${firebase_runtime_file}"
chmod 0400 "${firebase_runtime_file}"
chown -R 10001:10001 "${firebase_runtime_dir}"
FIREBASE_CREDENTIALS="${firebase_runtime_file}"
export FIREBASE_CREDENTIALS
unset firebase_source firebase_runtime_dir firebase_runtime_file

mkdir -p \
    bootstrap/cache \
    storage/app/private \
    storage/app/public \
    storage/framework/cache/data \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs

if [[ "${ORVYN_CACHE_CONFIG:-true}" == "true" ]]; then
    php artisan package:discover --ansi >/dev/null
    php artisan config:cache --no-interaction >/dev/null
fi

if [[ "$(id -u)" -eq 0 ]]; then
    chown -R 10001:10001 bootstrap/cache storage
    exec gosu 10001:10001 "$@"
fi

[[ "$(id -u)" -eq 10001 ]] || fail "runtime must execute as root during initialization or UID 10001"
exec "$@"
