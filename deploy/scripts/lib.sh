#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly ORVYN_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly ORVYN_DEPLOY_DIR="$(cd -- "${ORVYN_SCRIPT_DIR}/.." && pwd -P)"
readonly ORVYN_REPO_ROOT="$(cd -- "${ORVYN_DEPLOY_DIR}/.." && pwd -P)"
readonly ORVYN_COMPOSE_FILE="${ORVYN_DEPLOY_DIR}/compose.production.yml"

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

absolute_existing_file() {
    local path="$1"
    local directory
    local basename

    [[ -f "${path}" && ! -L "${path}" ]] || fail "Not a regular, non-symlink file: ${path}"
    directory="$(cd -- "$(dirname -- "${path}")" && pwd -P)"
    basename="$(basename -- "${path}")"
    printf '%s/%s\n' "${directory}" "${basename}"
}

load_env_file() {
    local path="$1"
    local line
    local key
    local value
    local line_number=0

    while IFS= read -r line || [[ -n "${line}" ]]; do
        ((line_number += 1))
        line="${line%$'\r'}"
        [[ -z "${line}" || "${line}" == \#* ]] && continue
        [[ "${line}" != export\ * ]] \
            || fail "Do not use export in ${path}:${line_number}"
        [[ "${line}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] \
            || fail "Invalid environment assignment in ${path}:${line_number}"

        key="${line%%=*}"
        value="${line#*=}"
        [[ "${value}" != *$'\n'* && "${value}" != *$'\r'* ]] \
            || fail "Multiline values are forbidden in ${path}:${line_number}"

        if [[ "${value}" == \"*\" ]]; then
            [[ "${value}" == *\" && ${#value} -ge 2 ]] \
                || fail "Unbalanced quote in ${path}:${line_number}"
            value="${value:1:${#value}-2}"
        elif [[ "${value}" == \'*\' ]]; then
            [[ "${value}" == *\' && ${#value} -ge 2 ]] \
                || fail "Unbalanced quote in ${path}:${line_number}"
            value="${value:1:${#value}-2}"
        fi

        export "${key}=${value}"
    done < "${path}"
}

compose() {
    docker compose \
        --env-file "${ORVYN_ENV_FILE}" \
        --file "${ORVYN_COMPOSE_FILE}" \
        "$@"
}

require_private_path() {
    local path="$1"
    local label="$2"
    local mode
    local mode_value
    local owner

    [[ ! -L "${path}" ]] || fail "${label} must not be a symbolic link"
    mode="$(stat -Lc '%a' -- "${path}")" || fail "Could not read permissions for ${label}"
    mode="${mode: -3}"
    [[ "${mode}" =~ ^[0-7]{3}$ ]] || fail "Could not parse permissions for ${label}"
    mode_value=$((8#${mode}))
    (( (mode_value & 077) == 0 )) \
        || fail "${label} must not grant group or other permissions (expected 0600/0700)"
    owner="$(stat -Lc '%u' -- "${path}")"
    [[ "${owner}" == "$(id -u)" ]] \
        || fail "${label} must be owned by the deployment user"
}

reject_repository_path() {
    local path="$1"
    local label="$2"
    local canonical

    [[ "${path}" == /* ]] || fail "${label} must be absolute"
    command -v readlink >/dev/null 2>&1 || fail "Required command is unavailable: readlink"
    canonical="$(readlink -m -- "${path}")" \
        || fail "Could not canonicalize ${label}"
    [[ "${canonical}" != "${ORVYN_REPO_ROOT}" && "${canonical}" != "${ORVYN_REPO_ROOT}/"* ]] \
        || fail "${label} must be outside the Git checkout"
}

require_secret_file() {
    local filename="$1"
    local label="$2"
    local path="${ORVYN_SECRETS_DIR}/${filename}"

    [[ -f "${path}" && -r "${path}" ]] || fail "Missing or unreadable secret: ${label}"
    require_private_path "${path}" "${label}"
}

read_one_line_secret() {
    local filename="$1"
    local label="$2"
    local minimum_length="$3"
    local path="${ORVYN_SECRETS_DIR}/${filename}"
    local value

    require_secret_file "${filename}" "${label}"
    value="$(< "${path}")"
    [[ "${value}" != *$'\n'* && "${value}" != *$'\r'* ]] \
        || fail "${label} must contain one line"
    (( ${#value} >= minimum_length )) \
        || fail "${label} must contain at least ${minimum_length} characters"
    printf '%s' "${value}"
}

ensure_state_directory() {
    local state_dir="${ORVYN_STATE_DIR:-/var/lib/orvyn}"

    [[ "${state_dir}" == /* ]] || fail "ORVYN_STATE_DIR must be absolute"
    [[ ! -L "${state_dir}" ]] || fail "ORVYN_STATE_DIR must not be a symbolic link"
    reject_repository_path "${state_dir}" ORVYN_STATE_DIR
    [[ ! -e "${state_dir}/releases" || ( -d "${state_dir}/releases" && ! -L "${state_dir}/releases" ) ]] \
        || fail "ORVYN release state path must be a real directory"
    mkdir -p -- "${state_dir}/releases"
    chmod 0700 -- "${state_dir}" "${state_dir}/releases"
    require_private_path "${state_dir}" ORVYN_STATE_DIR
    printf '%s\n' "${state_dir}"
}

read_current_release() {
    local state_dir="$1"

    if [[ -f "${state_dir}/current-release" && ! -L "${state_dir}/current-release" ]]; then
        tr -d '\r\n' < "${state_dir}/current-release"
    fi
}

write_atomic_line() {
    local destination="$1"
    local value="$2"
    local temporary="${destination}.tmp.$$"

    printf '%s\n' "${value}" > "${temporary}"
    chmod 0600 "${temporary}"
    mv -f -- "${temporary}" "${destination}"
}

validate_release_id() {
    [[ "$1" =~ ^[a-f0-9]{40,64}$ ]] \
        || fail "Release ID must be a full lowercase Git object ID (40-64 hex characters)"
}
