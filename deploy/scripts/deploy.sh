#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

# shellcheck source=deploy/scripts/lib.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/lib.sh"

usage() {
    printf 'Usage: %s --env-file /absolute/path/.env.production [--release GIT_SHA]\n' "${0##*/}" >&2
}

env_file=""
release_id=""
while (($# > 0)); do
    case "$1" in
        --env-file)
            env_file="${2:-}"
            shift 2
            ;;
        --release)
            release_id="${2:-}"
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

if [[ -z "${release_id}" ]]; then
    release_id="$(git -C "${ORVYN_REPO_ROOT}" rev-parse HEAD)"
fi
validate_release_id "${release_id}"
ORVYN_RELEASE_ID="${release_id}"
export ORVYN_RELEASE_ID

"${ORVYN_SCRIPT_DIR}/preflight.sh" \
    --env-file "${ORVYN_ENV_FILE}" \
    --release "${ORVYN_RELEASE_ID}"

require_command curl
require_command flock
require_command jq
require_command timeout

state_dir="$(ensure_state_directory)"
exec 9> "${state_dir}/deploy.lock"
chmod 0600 "${state_dir}/deploy.lock"
flock -n 9 || fail "Another ORVYN deploy or rollback is already running"

previous_release="$(read_current_release "${state_dir}")"
if [[ -n "${previous_release}" ]]; then
    validate_release_id "${previous_release}"
elif [[ -n "$(compose ps --all --quiet 2>/dev/null)" ]]; then
    fail "ORVYN containers exist but no current-release record is present"
fi

maintenance_enabled=false
release_activation_started=false

recover_previous_release() {
    local exit_status="$1"

    trap - ERR INT TERM
    set +e
    log "Deployment failed; starting fail-closed recovery"

    if [[ -n "${previous_release}" ]] \
        && { ${maintenance_enabled} || ${release_activation_started}; }; then
        ORVYN_RELEASE_ID="${previous_release}"
        export ORVYN_RELEASE_ID
        log "Restoring the previously recorded application images; database migrations are not reversed"
        compose up \
            --detach \
            --no-build \
            --pull never \
            --remove-orphans \
            --wait \
            --wait-timeout 300
        compose --profile tools run --rm --no-deps readiness php artisan up --no-interaction
    elif [[ -z "${previous_release}" ]] && ${release_activation_started}; then
        log "No prior release exists; stopping all public/application services from the unverified first release"
        ORVYN_RELEASE_ID="${release_id}"
        export ORVYN_RELEASE_ID
        compose stop --timeout 180 edge api php worker scheduler reverb whatsapp ollama
    fi

    log "Deployment did not complete. Inspect logs and migration compatibility before retrying."
    exit "${exit_status}"
}

trap 'recover_previous_release $?' ERR
trap 'recover_previous_release 130' INT
trap 'recover_previous_release 143' TERM

base_images=(
    php:8.3.32-fpm-bookworm
    caddy:2.11.4-alpine
    pgvector/pgvector:0.8.5-pg17-bookworm
    redis:7.4.9-alpine
    composer:2.9.8
    restic/restic:0.19.1
    ollama/ollama:0.32.3
    node:22.23.1-bookworm-slim
)

log "Resolving and pulling exact production base image tags"
for base_image in "${base_images[@]}"; do
    docker pull --quiet "${base_image}" >/dev/null
done

log "Building immutable application images for ${ORVYN_RELEASE_ID}"
DOCKER_BUILDKIT=1 compose build --pull edge php whatsapp backup

app_images=(
    "${ORVYN_IMAGE_NAMESPACE:-orvyn}/edge:${ORVYN_RELEASE_ID}"
    "${ORVYN_IMAGE_NAMESPACE:-orvyn}/backend:${ORVYN_RELEASE_ID}"
    "${ORVYN_IMAGE_NAMESPACE:-orvyn}/whatsapp:${ORVYN_RELEASE_ID}"
    "${ORVYN_IMAGE_NAMESPACE:-orvyn}/backup:${ORVYN_RELEASE_ID}"
)

for image_name in "${app_images[@]}"; do
    image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${image_name}")"
    [[ "${image_revision}" == "${ORVYN_RELEASE_ID}" ]] \
        || fail "Image revision label mismatch for ${image_name}"
done

log "Checking backend platform requirements and dependency advisories"
docker run \
    --rm \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
    --env COMPOSER_HOME=/tmp/composer \
    --entrypoint composer \
    "${ORVYN_IMAGE_NAMESPACE:-orvyn}/backend:${ORVYN_RELEASE_ID}" \
    check-platform-reqs --no-dev
docker run \
    --rm \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
    --env COMPOSER_HOME=/tmp/composer \
    --entrypoint composer \
    "${ORVYN_IMAGE_NAMESPACE:-orvyn}/backend:${ORVYN_RELEASE_ID}" \
    audit --locked --no-dev --no-interaction

audit_node_lock() {
    local project="$1"

    docker run \
        --rm \
        --read-only \
        --cap-drop ALL \
        --security-opt no-new-privileges:true \
        --tmpfs /tmp:rw,noexec,nosuid,nodev,size=128m \
        --env npm_config_cache=/tmp/npm-cache \
        --volume "${ORVYN_REPO_ROOT}/${project}/package.json:/package.json:ro" \
        --volume "${ORVYN_REPO_ROOT}/${project}/package-lock.json:/package-lock.json:ro" \
        --workdir / \
        node:22.23.1-bookworm-slim \
        npm audit --omit=dev --audit-level=high
}

log "Checking production Node dependency advisories"
audit_node_lock frontend
audit_node_lock whatsapp-service

log "Scanning every build and runtime image for HIGH and CRITICAL vulnerabilities"
scan_images=("${base_images[@]}" "${app_images[@]}")
for image_name in "${scan_images[@]}"; do
    trivy image \
        --exit-code 1 \
        --severity HIGH,CRITICAL \
        --scanners vuln,secret \
        --no-progress \
        "${image_name}"
done
unset scan_images

log "Validating container runtime identity and server configuration"
[[ "$(compose --profile tools run --rm --no-deps php id -u | tail -n1)" == "10001" ]] \
    || fail "Backend runtime did not drop to UID 10001"
[[ "$(compose run --rm --no-deps whatsapp id -u | tail -n1)" == "10001" ]] \
    || fail "WhatsApp runtime did not drop to UID 10001"
[[ "$(compose run --rm --no-deps api id -u | tail -n1)" == "10001" ]] \
    || fail "Internal API Caddy is not running as UID 10001"
compose run --rm --no-deps edge validate --config /etc/caddy/Caddyfile --adapter caddyfile
compose run --rm --no-deps api caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
compose run --rm --no-deps whatsapp node --check dist/server.js

log "Starting private data and Ollama services"
compose up \
    --detach \
    --no-build \
    --pull never \
    --wait \
    --wait-timeout 180 \
    postgres redis ollama

log "Pulling and verifying the exact configured Ollama model names"
for ollama_model in "${OLLAMA_MODEL}" "${OLLAMA_EMBEDDING_MODEL}"; do
    timeout --foreground "${ORVYN_OLLAMA_PULL_TIMEOUT_SECONDS:-1800}" \
        docker compose \
            --env-file "${ORVYN_ENV_FILE}" \
            --file "${ORVYN_COMPOSE_FILE}" \
            exec -T ollama ollama pull "${ollama_model}"
    compose exec -T ollama ollama show "${ollama_model}" >/dev/null \
        || fail "Ollama model is unavailable after pull: ${ollama_model}"
done

ollama_models_json='{}'
for ollama_model in "${OLLAMA_MODEL}" "${OLLAMA_EMBEDDING_MODEL}"; do
    ollama_model_id="$(compose exec -T ollama ollama list \
        | awk -v requested="${ollama_model}" 'NR > 1 && $1 == requested { print $2; exit }')"
    [[ "${ollama_model_id}" =~ ^[a-f0-9]{12,64}$ ]] \
        || fail "Could not record immutable Ollama model ID for ${ollama_model}"
    ollama_models_json="$(jq \
        --arg key "${ollama_model}" \
        --arg value "${ollama_model_id}" \
        '. + {($key): $value}' <<< "${ollama_models_json}")"
done

database_security_state="$(compose exec -T --user postgres postgres \
    psql --dbname=orvyn --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --command="SELECT
        (SELECT count(*) FROM pg_extension WHERE extname='vector'),
        (SELECT count(*) FROM pg_roles WHERE rolname='orvyn_app' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication),
        (SELECT count(*) FROM pg_roles WHERE rolname='orvyn_backup' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication),
        (SELECT count(*) FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname='orvyn' AND r.rolname='orvyn_app');")"
[[ "${database_security_state}" == "1|1|1|1" ]] \
    || fail "PostgreSQL roles, database ownership, or pgvector initialization is unsafe"

log "Running application-enforced production readiness checks"
compose --profile tools run --rm --no-deps readiness

log "Creating a required encrypted offsite pre-migration backup"
compose --profile backup run --rm backup backup

if [[ -n "${previous_release}" ]]; then
    log "Enabling shared maintenance mode and stopping background writers"
    compose --profile tools run --rm --no-deps readiness php artisan down --retry=60 --no-interaction
    maintenance_enabled=true
    compose stop --timeout 180 worker scheduler
fi

log "Applying forward-only database migrations under an isolated migration lock"
compose --profile tools run --rm --no-deps migrate

log "Starting the complete production release"
release_activation_started=true
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

"${ORVYN_SCRIPT_DIR}/smoke-test.sh" \
    --env-file "${ORVYN_ENV_FILE}" \
    --release "${ORVYN_RELEASE_ID}"

manifest_path="${state_dir}/releases/${ORVYN_RELEASE_ID}.json"
manifest_tmp="${manifest_path}.tmp.$$"
env_sha256="$(sha256sum "${ORVYN_ENV_FILE}" | awk '{print $1}')"

base_json='{}'
for base_image in "${base_images[@]}"; do
    base_digest="$(docker image inspect --format '{{ join .RepoDigests "," }}' "${base_image}" | cut -d, -f1)"
    [[ -n "${base_digest}" ]] || fail "Could not record digest for ${base_image}"
    base_json="$(jq --arg key "${base_image}" --arg value "${base_digest}" '. + {($key): $value}' <<< "${base_json}")"
done

app_json='{}'
for image_name in "${app_images[@]}"; do
    image_id="$(docker image inspect --format '{{.Id}}' "${image_name}")"
    app_json="$(jq --arg key "${image_name}" --arg value "${image_id}" '. + {($key): $value}' <<< "${app_json}")"
done

jq -n \
    --arg release_id "${ORVYN_RELEASE_ID}" \
    --arg git_commit "$(git -C "${ORVYN_REPO_ROOT}" rev-parse HEAD)" \
    --arg deployed_at "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --arg env_sha256 "${env_sha256}" \
    --arg image_namespace "${ORVYN_IMAGE_NAMESPACE:-orvyn}" \
    --argjson application_images "${app_json}" \
    --argjson base_images "${base_json}" \
    --argjson ollama_models "${ollama_models_json}" \
    '{
        release_id: $release_id,
        git_commit: $git_commit,
        deployed_at: $deployed_at,
        environment_sha256: $env_sha256,
        image_namespace: $image_namespace,
        application_images: $application_images,
        base_images: $base_images,
        ollama_models: $ollama_models
    }' > "${manifest_tmp}"
chmod 0600 "${manifest_tmp}"
mv -f -- "${manifest_tmp}" "${manifest_path}"

if [[ -n "${previous_release}" && "${previous_release}" != "${ORVYN_RELEASE_ID}" ]]; then
    write_atomic_line "${state_dir}/previous-release" "${previous_release}"
fi
write_atomic_line "${state_dir}/current-release" "${ORVYN_RELEASE_ID}"

maintenance_enabled=false
release_activation_started=false
trap - ERR INT TERM
log "Release ${ORVYN_RELEASE_ID} deployed successfully"
