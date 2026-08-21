#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

# shellcheck source=deploy/scripts/lib.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/lib.sh"

usage() {
    printf 'Usage: %s --env-file /absolute/path/.env.production\n' "${0##*/}" >&2
}

env_file=""
while (($# > 0)); do
    case "$1" in
        --env-file)
            env_file="${2:-}"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            usage
            fail "Unknown argument: $1"
            ;;
    esac
done

[[ -n "${env_file}" ]] || {
    usage
    fail "--env-file is required"
}

ORVYN_ENV_FILE="$(absolute_existing_file "${env_file}")"
export ORVYN_ENV_FILE
load_env_file "${ORVYN_ENV_FILE}"

state_dir="$(ensure_state_directory)"
release_id="$(read_current_release "${state_dir}")"
[[ -n "${release_id}" ]] || fail "No current release is recorded"
validate_release_id "${release_id}"
ORVYN_RELEASE_ID="${release_id}"
export ORVYN_RELEASE_ID

"${ORVYN_SCRIPT_DIR}/preflight.sh" \
    --env-file "${ORVYN_ENV_FILE}" \
    --release "${ORVYN_RELEASE_ID}" \
    --rollback

require_command flock
exec 9> "${state_dir}/deploy.lock"
chmod 0600 "${state_dir}/deploy.lock"
flock -n 9 || fail "Deploy, rollback, or another backup is already running"

manifest="${state_dir}/releases/${ORVYN_RELEASE_ID}.json"
[[ -f "${manifest}" && ! -L "${manifest}" ]] \
    || fail "Current release manifest is missing"

log "Starting scheduled encrypted offsite backup for ${ORVYN_RELEASE_ID}"
compose --profile backup run --rm backup backup
log "Scheduled encrypted offsite backup completed"
