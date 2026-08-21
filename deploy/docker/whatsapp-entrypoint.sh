#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

fail() {
    printf 'ORVYN WhatsApp startup refused: %s\n' "$*" >&2
    exit 1
}

load_secret() {
    local name="$1"
    local file_name="${name}_FILE"
    local path="${!file_name:-}"
    local value

    [[ -n "${path}" ]] || fail "${file_name} is required"
    [[ "${path}" == /run/secrets/* ]] || fail "${file_name} must use /run/secrets"
    [[ -f "${path}" && -r "${path}" && ! -L "${path}" ]] || fail "${file_name} is not a readable regular file"

    value="$(< "${path}")"
    [[ "${value}" != *$'\n'* && "${value}" != *$'\r'* ]] || fail "${file_name} must contain one line"
    (( ${#value} >= 32 )) || fail "${name} must contain at least 32 characters"

    printf -v "${name}" '%s' "${value}"
    export "${name}"
    unset value
}

load_secret WHATSAPP_SERVICE_TOKEN
load_secret WHATSAPP_WEBHOOK_SECRET

[[ "${WHATSAPP_SERVICE_TOKEN}" != "${WHATSAPP_WEBHOOK_SECRET}" ]] \
    || fail "WhatsApp service and webhook secrets must differ"

session_path="${WHATSAPP_SESSION_PATH:-/var/lib/orvyn-whatsapp/session}"
[[ "${session_path}" == /var/lib/orvyn-whatsapp/* ]] \
    || fail "WHATSAPP_SESSION_PATH must stay inside /var/lib/orvyn-whatsapp"
[[ ! -L "${session_path}" ]] || fail "WHATSAPP_SESSION_PATH must not be a symbolic link"

mkdir -p "${session_path}"
chmod 0700 /var/lib/orvyn-whatsapp "${session_path}"

if [[ "$(id -u)" -eq 0 ]]; then
    chown -R 10001:10001 /var/lib/orvyn-whatsapp
    exec gosu 10001:10001 "$@"
fi

[[ "$(id -u)" -eq 10001 ]] || fail "runtime must execute as root during initialization or UID 10001"
exec "$@"
