#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

# shellcheck source=deploy/scripts/lib.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/lib.sh"

usage() {
    printf 'Usage: %s --env-file /absolute/path/.env.production --to RELEASE_SHA --ack-schema-compatible --ack-current-config\n' "${0##*/}" >&2
}

env_file=""
target_release=""
ack_schema=false
ack_config=false
while (($# > 0)); do
    case "$1" in
        --env-file)
            env_file="${2:-}"
            shift 2
            ;;
        --to)
            target_release="${2:-}"
            shift 2
            ;;
        --ack-schema-compatible)
            ack_schema=true
            shift
            ;;
        --ack-current-config)
            ack_config=true
            shift
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

[[ -n "${env_file}" && -n "${target_release}" ]] || {
    usage
    fail "--env-file and --to are required"
}
${ack_schema} || fail "Rollback requires --ack-schema-compatible; database migrations are never reversed automatically"
${ack_config} || fail "Rollback requires --ack-current-config; current secrets and configuration remain active"

ORVYN_ENV_FILE="$(absolute_existing_file "${env_file}")"
export ORVYN_ENV_FILE
load_env_file "${ORVYN_ENV_FILE}"
validate_release_id "${target_release}"

"${ORVYN_SCRIPT_DIR}/preflight.sh" \
    --env-file "${ORVYN_ENV_FILE}" \
    --release "${target_release}" \
    --rollback

require_command flock
require_command jq

state_dir="$(ensure_state_directory)"
exec 9> "${state_dir}/deploy.lock"
chmod 0600 "${state_dir}/deploy.lock"
flock -n 9 || fail "Another ORVYN deploy or rollback is already running"

current_release="$(read_current_release "${state_dir}")"
[[ -n "${current_release}" ]] || fail "No current release is recorded"
validate_release_id "${current_release}"
[[ "${target_release}" != "${current_release}" ]] || fail "Target release is already current"

target_manifest="${state_dir}/releases/${target_release}.json"
[[ -f "${target_manifest}" && ! -L "${target_manifest}" ]] \
    || fail "Target release manifest does not exist"
require_private_path "${target_manifest}" "target release manifest"
[[ "$(jq -r '.release_id' "${target_manifest}")" == "${target_release}" ]] \
    || fail "Target manifest release ID mismatch"

target_namespace="$(jq -r '.image_namespace' "${target_manifest}")"
[[ "${target_namespace}" == "${ORVYN_IMAGE_NAMESPACE:-orvyn}" ]] \
    || fail "Target release used a different image namespace"

while IFS=$'\t' read -r image_name expected_id; do
    [[ -n "${image_name}" && -n "${expected_id}" ]] || fail "Target manifest has an invalid image entry"
    actual_id="$(docker image inspect --format '{{.Id}}' "${image_name}" 2>/dev/null)" \
        || fail "Required rollback image is missing: ${image_name}"
    [[ "${actual_id}" == "${expected_id}" ]] \
        || fail "Rollback image ID no longer matches its immutable manifest: ${image_name}"
done < <(jq -r '.application_images | to_entries[] | [.key, .value] | @tsv' "${target_manifest}")

while IFS=$'\t' read -r image_name expected_digest; do
    [[ -n "${image_name}" && -n "${expected_digest}" ]] \
        || fail "Target manifest has an invalid base image entry"
    local_digests="$(docker image inspect --format '{{ join .RepoDigests "," }}' "${image_name}" 2>/dev/null)" \
        || fail "Required rollback runtime/base image is missing: ${image_name}"
    [[ ",${local_digests}," == *",${expected_digest},"* ]] \
        || fail "Runtime/base image digest no longer matches target manifest: ${image_name}"
done < <(jq -r '.base_images | to_entries[] | [.key, .value] | @tsv' "${target_manifest}")

while IFS=$'\t' read -r model_name expected_model_id; do
    [[ -n "${model_name}" && -n "${expected_model_id}" ]] \
        || fail "Target manifest has an invalid Ollama model entry"
    actual_model_id="$(compose exec -T ollama ollama list \
        | awk -v requested="${model_name}" 'NR > 1 && $1 == requested { print $2; exit }')"
    [[ "${actual_model_id}" == "${expected_model_id}" ]] \
        || fail "Ollama model ID no longer matches target manifest: ${model_name}"
done < <(jq -r '.ollama_models | to_entries[] | [.key, .value] | @tsv' "${target_manifest}")

log "Re-scanning every rollback build and runtime image before activation"
while IFS= read -r image_name; do
    trivy image \
        --exit-code 1 \
        --severity HIGH,CRITICAL \
        --scanners vuln,secret \
        --no-progress \
        "${image_name}"
done < <(jq -r '[.application_images, .base_images] | add | keys[]' "${target_manifest}")

maintenance_enabled=false

recover_current_release() {
    local exit_status="$1"

    trap - ERR INT TERM
    set +e
    log "Rollback failed; restoring the previously current application images"
    ORVYN_RELEASE_ID="${current_release}"
    export ORVYN_RELEASE_ID
    compose up \
        --detach \
        --no-build \
        --pull never \
        --remove-orphans \
        --wait \
        --wait-timeout 300
    if ${maintenance_enabled}; then
        compose --profile tools run --rm --no-deps readiness php artisan up --no-interaction
    fi
    log "Rollback did not complete. No database migration was reversed."
    exit "${exit_status}"
}

trap 'recover_current_release $?' ERR
trap 'recover_current_release 130' INT
trap 'recover_current_release 143' TERM

ORVYN_RELEASE_ID="${current_release}"
export ORVYN_RELEASE_ID

log "Taking a mandatory encrypted offsite backup before rollback"
compose --profile backup run --rm backup backup

log "Enabling maintenance mode and stopping background writers"
compose --profile tools run --rm --no-deps readiness php artisan down --retry=60 --no-interaction
maintenance_enabled=true
compose stop --timeout 180 worker scheduler

ORVYN_RELEASE_ID="${target_release}"
export ORVYN_RELEASE_ID
log "Activating the recorded application images without changing the database schema"
compose up \
    --detach \
    --no-build \
    --pull never \
    --remove-orphans \
    --wait \
    --wait-timeout 300

compose --profile tools run --rm --no-deps readiness php artisan up --no-interaction

"${ORVYN_SCRIPT_DIR}/smoke-test.sh" \
    --env-file "${ORVYN_ENV_FILE}" \
    --release "${target_release}"

maintenance_enabled=false

write_atomic_line "${state_dir}/previous-release" "${current_release}"
write_atomic_line "${state_dir}/current-release" "${target_release}"

trap - ERR INT TERM
log "Rollback to ${target_release} completed; database schema was left unchanged"
