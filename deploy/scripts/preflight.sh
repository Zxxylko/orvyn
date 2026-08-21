#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

# shellcheck source=deploy/scripts/lib.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/lib.sh"

usage() {
    printf 'Usage: %s --env-file /absolute/path/.env.production [--release GIT_SHA] [--rollback]\n' "${0##*/}" >&2
}

env_file=""
release_id=""
rollback_mode=false

while (($# > 0)); do
    case "$1" in
        --env-file)
            (($# >= 2)) || fail "--env-file requires a value"
            env_file="$2"
            shift 2
            ;;
        --release)
            (($# >= 2)) || fail "--release requires a value"
            release_id="$2"
            shift 2
            ;;
        --rollback)
            rollback_mode=true
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

[[ -n "${env_file}" ]] || {
    usage
    fail "--env-file is required"
}

ORVYN_ENV_FILE="$(absolute_existing_file "${env_file}")"
export ORVYN_ENV_FILE
require_private_path "${ORVYN_ENV_FILE}" "production environment file"
reject_repository_path "${ORVYN_ENV_FILE}" "production environment file"
load_env_file "${ORVYN_ENV_FILE}"

for command_name in awk docker fold getent git grep jq openssl readlink sed sha256sum sort stat wc; do
    require_command "${command_name}"
done

[[ "$(uname -s)" == "Linux" ]] || fail "Production deployment is supported only on a Linux VPS"
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable to the deployment user"

compose_version="$(docker compose version --short 2>/dev/null | sed 's/^v//')"
[[ "${compose_version}" =~ ^[0-9]+[.][0-9]+([.][0-9]+)? ]] \
    || fail "Could not determine Docker Compose version"
minimum_compose=2.24.0
[[ "$(printf '%s\n%s\n' "${minimum_compose}" "${compose_version}" | sort -V | head -n1)" == "${minimum_compose}" ]] \
    || fail "Docker Compose ${minimum_compose} or newer is required"

[[ -z "${APP_KEY:-}${DB_PASSWORD:-}${REDIS_PASSWORD:-}${REVERB_APP_SECRET:-}${WHATSAPP_SERVICE_TOKEN:-}${WHATSAPP_WEBHOOK_SECRET:-}${EXPO_ACCESS_TOKEN:-}${GEMINI_API_KEY:-}" ]] \
    || fail "Raw application secrets are forbidden in the production environment file"

: "${ORVYN_DOMAIN:?ORVYN_DOMAIN is required}"
: "${ORVYN_COOKIE_DOMAIN:?ORVYN_COOKIE_DOMAIN is required}"
: "${ORVYN_TRUSTED_HOSTS:?ORVYN_TRUSTED_HOSTS is required}"
: "${ORVYN_EXPECTED_PUBLIC_IP:?ORVYN_EXPECTED_PUBLIC_IP is required}"
: "${ORVYN_SECRETS_DIR:?ORVYN_SECRETS_DIR is required}"
: "${ACME_EMAIL:?ACME_EMAIL is required}"
: "${REVERB_APP_KEY:?REVERB_APP_KEY is required}"
: "${WHATSAPP_SESSION_ADMIN_EMAILS:?WHATSAPP_SESSION_ADMIN_EMAILS is required}"
: "${ORVYN_IMAGE_NAMESPACE:?ORVYN_IMAGE_NAMESPACE is required}"

[[ "${ORVYN_DOMAIN}" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,63}$ ]] \
    || fail "ORVYN_DOMAIN must be a lowercase public DNS hostname"
[[ "${ORVYN_COOKIE_DOMAIN}" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,63}$ ]] \
    || fail "ORVYN_COOKIE_DOMAIN must be a lowercase dotted DNS domain"
[[ "${ORVYN_DOMAIN}" == "${ORVYN_COOKIE_DOMAIN}" ]] \
    || fail "ORVYN_COOKIE_DOMAIN must equal ORVYN_DOMAIN for this same-origin topology"
[[ "${ACME_EMAIL}" =~ ^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$ ]] \
    || fail "ACME_EMAIL is invalid"
[[ "${ORVYN_IMAGE_NAMESPACE}" =~ ^[a-z0-9][a-z0-9._/-]{0,99}$ \
    && "${ORVYN_IMAGE_NAMESPACE}" != */ \
    && "${ORVYN_IMAGE_NAMESPACE}" != *//* ]] \
    || fail "ORVYN_IMAGE_NAMESPACE must be a lowercase local image namespace"
[[ "${REVERB_APP_KEY}" =~ ^[A-Za-z0-9_-]{20,80}$ && "${REVERB_APP_KEY}" != replace-* ]] \
    || fail "REVERB_APP_KEY must be a generated public identifier"
[[ "${WHATSAPP_BAILEYS_PRODUCTION_ACKNOWLEDGED:-}" == "true" ]] \
    || fail "Baileys production risk must be explicitly acknowledged with true"
[[ ",${COMPOSE_PROFILES:-}," == *,ai,* ]] \
    || fail "COMPOSE_PROFILES must include ai while the production backend uses Ollama"
: "${OLLAMA_MODEL:?OLLAMA_MODEL is required}"
: "${OLLAMA_EMBEDDING_MODEL:?OLLAMA_EMBEDDING_MODEL is required}"
[[ "${OLLAMA_MODEL}" =~ ^[A-Za-z0-9._/-]+(:[A-Za-z0-9._-]+)?$ ]] \
    || fail "OLLAMA_MODEL contains unsupported characters"
[[ "${OLLAMA_EMBEDDING_MODEL}" =~ ^[A-Za-z0-9._/-]+(:[A-Za-z0-9._-]+)?$ ]] \
    || fail "OLLAMA_EMBEDDING_MODEL contains unsupported characters"
ollama_pull_timeout="${ORVYN_OLLAMA_PULL_TIMEOUT_SECONDS:-1800}"
[[ "${ollama_pull_timeout}" =~ ^[0-9]+$ ]] \
    || fail "ORVYN_OLLAMA_PULL_TIMEOUT_SECONDS must be numeric"
(( ollama_pull_timeout >= 300 && ollama_pull_timeout <= 7200 )) \
    || fail "ORVYN_OLLAMA_PULL_TIMEOUT_SECONDS must be between 300 and 7200"
unset ollama_pull_timeout

escaped_public_host="${ORVYN_DOMAIN//./[.]}"
expected_trusted_hosts="$(printf '^%s$,^api$' "${escaped_public_host}")"
[[ "${ORVYN_TRUSTED_HOSTS}" == "${expected_trusted_hosts}" ]] \
    || fail "ORVYN_TRUSTED_HOSTS must be exactly ${expected_trusted_hosts}"
unset escaped_public_host expected_trusted_hosts

IFS=',' read -r -a whatsapp_admins <<< "${WHATSAPP_SESSION_ADMIN_EMAILS}"
for admin_email in "${whatsapp_admins[@]}"; do
    [[ "${admin_email}" =~ ^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$ ]] \
        || fail "Invalid email in WHATSAPP_SESSION_ADMIN_EMAILS"
done

is_public_ipv4() {
    local ip="$1"
    local a b c d
    IFS='.' read -r a b c d <<< "${ip}"
    [[ -n "${a:-}" && -n "${b:-}" && -n "${c:-}" && -n "${d:-}" ]] || return 1
    for octet in "${a}" "${b}" "${c}" "${d}"; do
        [[ "${octet}" =~ ^[0-9]{1,3}$ ]] && ((10#${octet} <= 255)) || return 1
    done
    a=$((10#${a}))
    b=$((10#${b}))
    c=$((10#${c}))
    d=$((10#${d}))
    (( a != 0 && a != 10 && a != 127 && a < 224 )) || return 1
    ! (( a == 169 && b == 254 )) || return 1
    ! (( a == 172 && b >= 16 && b <= 31 )) || return 1
    ! (( a == 192 && b == 168 )) || return 1
    ! (( a == 100 && b >= 64 && b <= 127 )) || return 1
    ! (( a == 192 && b == 0 && (c == 0 || c == 2) )) || return 1
    ! (( a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)) )) || return 1
    ! (( a == 203 && b == 0 && c == 113 )) || return 1
}

is_public_ipv4 "${ORVYN_EXPECTED_PUBLIC_IP}" \
    || fail "ORVYN_EXPECTED_PUBLIC_IP must be a globally routable IPv4 address"
getent ahostsv4 "${ORVYN_DOMAIN}" \
    | awk '{print $1}' \
    | grep -Fqx -- "${ORVYN_EXPECTED_PUBLIC_IP}" \
    || fail "DNS A record for ORVYN_DOMAIN does not include ORVYN_EXPECTED_PUBLIC_IP"

[[ "${ORVYN_SECRETS_DIR}" == /* ]] || fail "ORVYN_SECRETS_DIR must be absolute"
[[ -d "${ORVYN_SECRETS_DIR}" && -r "${ORVYN_SECRETS_DIR}" ]] \
    || fail "ORVYN_SECRETS_DIR is missing or unreadable"
reject_repository_path "${ORVYN_SECRETS_DIR}" ORVYN_SECRETS_DIR
require_private_path "${ORVYN_SECRETS_DIR}" ORVYN_SECRETS_DIR
: "${ORVYN_STATE_DIR:=/var/lib/orvyn}"
reject_repository_path "${ORVYN_STATE_DIR}" ORVYN_STATE_DIR

for secret_spec in \
    "app_key:APP key" \
    "postgres_admin_password:PostgreSQL administrator password" \
    "postgres_app_password:PostgreSQL application password" \
    "postgres_backup_password:PostgreSQL backup password" \
    "redis_password:Redis password" \
    "reverb_app_secret:Reverb application secret" \
    "whatsapp_service_token:WhatsApp service token" \
    "whatsapp_webhook_secret:WhatsApp webhook secret" \
    "firebase_credentials.json:Firebase service account" \
    "google-services.json:Firebase Android client configuration" \
    "expo_access_token:Expo access token" \
    "restic_repository:restic repository" \
    "restic_password:restic repository password" \
    "restic_ssh_key:restic SSH key" \
    "restic_known_hosts:restic SSH known-hosts"; do
    require_secret_file "${secret_spec%%:*}" "${secret_spec#*:}"
done

app_key="$(read_one_line_secret app_key "APP key" 39)"
[[ "${app_key}" == base64:* ]] || fail "APP key must use Laravel base64: format"
encoded_key="${app_key#base64:}"
[[ "${encoded_key}" =~ ^[A-Za-z0-9+/]+={0,2}$ ]] || fail "APP key is not valid base64"
decoded_key_length="$(printf '%s' "${encoded_key}" | openssl base64 -d -A 2>/dev/null | wc -c | tr -d ' ')"
[[ "${decoded_key_length}" -ge 32 ]] || fail "APP key must decode to at least 32 random bytes"
unset app_key encoded_key decoded_key_length

postgres_admin_password="$(read_one_line_secret postgres_admin_password "PostgreSQL administrator password" 32)"
postgres_app_password="$(read_one_line_secret postgres_app_password "PostgreSQL application password" 24)"
postgres_backup_password="$(read_one_line_secret postgres_backup_password "PostgreSQL backup password" 24)"
redis_password="$(read_one_line_secret redis_password "Redis password" 24)"
reverb_secret="$(read_one_line_secret reverb_app_secret "Reverb application secret" 32)"
whatsapp_service_token="$(read_one_line_secret whatsapp_service_token "WhatsApp service token" 32)"
whatsapp_webhook_secret="$(read_one_line_secret whatsapp_webhook_secret "WhatsApp webhook secret" 32)"
restic_password="$(read_one_line_secret restic_password "restic repository password" 32)"

require_secret_entropy_shape() {
    local value="$1"
    local label="$2"
    local unique_count

    unique_count="$(printf '%s' "${value}" | fold -w1 | sort -u | wc -l | tr -d ' ')"
    (( unique_count >= 10 )) \
        || fail "${label} does not look independently random"
    [[ "${value,,}" != *password* && "${value,,}" != *changeme* && "${value,,}" != *replace* ]] \
        || fail "${label} contains a placeholder"
}

require_secret_entropy_shape "${postgres_admin_password}" "PostgreSQL administrator password"
require_secret_entropy_shape "${postgres_app_password}" "PostgreSQL application password"
require_secret_entropy_shape "${postgres_backup_password}" "PostgreSQL backup password"
require_secret_entropy_shape "${redis_password}" "Redis password"
require_secret_entropy_shape "${reverb_secret}" "Reverb application secret"
require_secret_entropy_shape "${whatsapp_service_token}" "WhatsApp service token"
require_secret_entropy_shape "${whatsapp_webhook_secret}" "WhatsApp webhook secret"
require_secret_entropy_shape "${restic_password}" "restic repository password"

[[ "${postgres_admin_password}" != "${postgres_app_password}" \
    && "${postgres_admin_password}" != "${postgres_backup_password}" \
    && "${postgres_app_password}" != "${postgres_backup_password}" ]] \
    || fail "Every PostgreSQL role must use a distinct password"
[[ "${whatsapp_service_token}" != "${whatsapp_webhook_secret}" ]] \
    || fail "WhatsApp service and webhook secrets must differ"
[[ "${redis_password}" =~ ^[A-Za-z0-9_-]+$ ]] \
    || fail "Redis password must use only A-Z, a-z, 0-9, underscore, or hyphen"
unset postgres_admin_password postgres_app_password postgres_backup_password
unset redis_password reverb_secret whatsapp_service_token whatsapp_webhook_secret restic_password

firebase_file="${ORVYN_SECRETS_DIR}/firebase_credentials.json"
jq -e '
    type == "object"
    and .type == "service_account"
    and (.project_id | type == "string" and length > 2)
    and (.client_email | type == "string" and test("^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$"))
    and (.private_key | type == "string" and contains("-----BEGIN PRIVATE KEY-----") and contains("-----END PRIVATE KEY-----"))
' "${firebase_file}" >/dev/null \
    || fail "Firebase credentials must be valid service_account JSON with project_id, client_email, and private_key"

: "${VITE_FIREBASE_API_KEY:?Firebase web API key is required}"
: "${VITE_FIREBASE_AUTH_DOMAIN:?Firebase auth domain is required}"
: "${VITE_FIREBASE_PROJECT_ID:?Firebase project ID is required}"
: "${VITE_FIREBASE_STORAGE_BUCKET:?Firebase storage bucket is required}"
: "${VITE_FIREBASE_MESSAGING_SENDER_ID:?Firebase messaging sender ID is required}"
: "${VITE_FIREBASE_APP_ID:?Firebase app ID is required}"
: "${FIREBASE_PROJECT_ID:?FIREBASE_PROJECT_ID is required}"
[[ "${FIREBASE_REAUTH_MAX_AGE_SECONDS:-}" == "300" ]] \
    || fail "FIREBASE_REAUTH_MAX_AGE_SECONDS must be exactly 300"
firebase_project_id="$(jq -r '.project_id' "${firebase_file}")"
firebase_client_email="$(jq -r '.client_email' "${firebase_file}")"
[[ "${firebase_project_id}" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] \
    || fail "Firebase project_id format is invalid"
[[ "${VITE_FIREBASE_PROJECT_ID}" == "${firebase_project_id}" ]] \
    || fail "Firebase web project and backend service account must use the same project_id"
[[ "${FIREBASE_PROJECT_ID}" == "${firebase_project_id}" ]] \
    || fail "FIREBASE_PROJECT_ID must match the service-account project_id"
[[ "${firebase_client_email}" == *"@${firebase_project_id}.iam.gserviceaccount.com" ]] \
    || fail "Firebase service-account client_email must belong to FIREBASE_PROJECT_ID"
[[ "${VITE_FIREBASE_API_KEY}" =~ ^AIza[0-9A-Za-z_-]{35}$ ]] \
    || fail "Firebase web API key format is invalid"
[[ "${VITE_FIREBASE_AUTH_DOMAIN}" == "${firebase_project_id}.firebaseapp.com" ]] \
    || fail "Firebase auth domain must be the exact project firebaseapp.com domain"
[[ "${VITE_FIREBASE_STORAGE_BUCKET}" == "${firebase_project_id}.appspot.com" \
    || "${VITE_FIREBASE_STORAGE_BUCKET}" == "${firebase_project_id}.firebasestorage.app" ]] \
    || fail "Firebase storage bucket must belong to FIREBASE_PROJECT_ID"
[[ "${VITE_FIREBASE_MESSAGING_SENDER_ID}" =~ ^[0-9]{6,20}$ ]] \
    || fail "Firebase messaging sender ID must be numeric"
firebase_app_id_pattern="^1:${VITE_FIREBASE_MESSAGING_SENDER_ID}:web:[0-9A-Za-z]+$"
[[ "${VITE_FIREBASE_APP_ID}" =~ ${firebase_app_id_pattern} ]] \
    || fail "Firebase web app ID format/project number is invalid"
unset firebase_project_id firebase_client_email firebase_app_id_pattern

[[ "${EXPO_PUSH_ENABLED:-}" == "true" ]] \
    || fail "EXPO_PUSH_ENABLED must remain true for the complete production deployment"
expo_token="$(read_one_line_secret expo_access_token "Expo access token" 20)"
unset expo_token

: "${EXPO_PUBLIC_API_URL:?EXPO_PUBLIC_API_URL is required for EAS production}"
: "${EXPO_PUBLIC_FIREBASE_API_KEY:?EXPO_PUBLIC_FIREBASE_API_KEY is required}"
: "${EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN:?EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN is required}"
: "${EXPO_PUBLIC_FIREBASE_PROJECT_ID:?EXPO_PUBLIC_FIREBASE_PROJECT_ID is required}"
: "${EXPO_PUBLIC_FIREBASE_APP_ID:?EXPO_PUBLIC_FIREBASE_APP_ID is required}"
: "${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:?EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is required}"
: "${EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:?EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is required}"
: "${ORVYN_ANDROID_RELEASE_SHA1:?ORVYN_ANDROID_RELEASE_SHA1 is required}"
[[ "${EXPO_PUBLIC_ORVYN_BUILD_ENV:-}" == "production" ]] \
    || fail "EXPO_PUBLIC_ORVYN_BUILD_ENV must be production"
[[ "${EXPO_PUBLIC_API_URL}" == "https://${ORVYN_DOMAIN}/api/v1" ]] \
    || fail "EXPO_PUBLIC_API_URL must be the public HTTPS /api/v1 endpoint"
[[ "${EXPO_PUBLIC_FIREBASE_PROJECT_ID}" == "${VITE_FIREBASE_PROJECT_ID}" ]] \
    || fail "Mobile and web must use the same Firebase project"
[[ "${EXPO_PUBLIC_FIREBASE_API_KEY}" == "${VITE_FIREBASE_API_KEY}" ]] \
    || fail "Mobile Firebase API key must match the configured web project"
[[ "${EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN}" == "${VITE_FIREBASE_AUTH_DOMAIN}" ]] \
    || fail "Mobile Firebase auth domain must match the configured web project"
[[ "${EXPO_PUBLIC_FIREBASE_APP_ID}" == "${VITE_FIREBASE_APP_ID}" ]] \
    || fail "Mobile Firebase app ID must match the reviewed web Firebase app"
google_client_pattern="^${VITE_FIREBASE_MESSAGING_SENDER_ID}-[0-9A-Za-z_-]+[.]apps[.]googleusercontent[.]com$"
[[ "${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID}" =~ ${google_client_pattern} ]] \
    || fail "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID format/project number is invalid"
[[ "${EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID}" =~ ${google_client_pattern} ]] \
    || fail "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID format/project number is invalid"
[[ "${EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID}" != "${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID}" ]] \
    || fail "Google Web and iOS OAuth client IDs must be distinct"
[[ "${ORVYN_ANDROID_RELEASE_SHA1}" =~ ^([A-F0-9]{2}:){19}[A-F0-9]{2}$ ]] \
    || fail "ORVYN_ANDROID_RELEASE_SHA1 must be an uppercase colon-delimited SHA-1 fingerprint"
[[ "${EXPO_PUBLIC_DEMO_LOGIN_ENABLED:-false}" != "true" \
    && "${EXPO_PUBLIC_MANUAL_TOKEN_LOGIN_ENABLED:-false}" != "true" ]] \
    || fail "Diagnostic mobile login modes are forbidden in production"

google_services_file="${ORVYN_SECRETS_DIR}/google-services.json"
google_services_size="$(stat -Lc '%s' -- "${google_services_file}")"
(( google_services_size > 0 && google_services_size <= 65536 )) \
    || fail "google-services.json must be non-empty and no larger than 64 KiB"
android_release_hash="${ORVYN_ANDROID_RELEASE_SHA1//:/}"
android_release_hash="${android_release_hash,,}"
jq -e \
    --arg project_id "${VITE_FIREBASE_PROJECT_ID}" \
    --arg project_number "${VITE_FIREBASE_MESSAGING_SENDER_ID}" \
    --arg storage_bucket "${VITE_FIREBASE_STORAGE_BUCKET}" \
    --arg package_name "app.orvyn.mobile" \
    --arg web_client_id "${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID}" \
    --arg release_hash "${android_release_hash}" '
    type == "object"
    and .project_info.project_id == $project_id
    and (.project_info.project_number | tostring) == $project_number
    and .project_info.storage_bucket == $storage_bucket
    and any(.client[]?;
        .client_info.android_client_info.package_name == $package_name
        and ((.client_info.mobilesdk_app_id | type) == "string")
        and (.client_info.mobilesdk_app_id
            | startswith("1:" + $project_number + ":android:"))
        and any(.api_key[]?;
            ((.current_key | type) == "string")
            and (.current_key | test("^AIza[0-9A-Za-z_-]{35}$")))
        and any(.oauth_client[]?;
            .client_type == 1
            and .android_info.package_name == $package_name
            and ((.android_info.certificate_hash | type) == "string")
            and ((.android_info.certificate_hash
                | gsub(":"; "")
                | ascii_downcase) == $release_hash)
            and ((.client_id | type) == "string")
            and (.client_id | startswith($project_number + "-"))
            and (.client_id | endswith(".apps.googleusercontent.com")))
        and any(.oauth_client[]?;
            .client_type == 3 and .client_id == $web_client_id)
    )
' "${google_services_file}" >/dev/null \
    || fail "google-services.json does not match the production Firebase project, app.orvyn.mobile, release SHA-1, or Web OAuth client"
unset google_client_pattern google_services_file google_services_size android_release_hash

restic_repository="$(read_one_line_secret restic_repository "restic repository" 12)"
[[ "${restic_repository}" == sftp:* && "${restic_repository}" != *"://"* ]] \
    || fail "restic_repository must use passwordless SFTP syntax"
[[ "${restic_repository}" != *"@localhost"* && "${restic_repository}" != *"@127."* ]] \
    || fail "restic repository must be offsite"
unset restic_repository
grep -Eq '^-----BEGIN OPENSSH PRIVATE KEY-----$' "${ORVYN_SECRETS_DIR}/restic_ssh_key" \
    || fail "restic_ssh_key must be an OpenSSH private key"
grep -Eq '^[^#[:space:]].+[[:space:]]+(ssh-|ecdsa-|sk-)' "${ORVYN_SECRETS_DIR}/restic_known_hosts" \
    || fail "restic_known_hosts must contain a pinned SSH host key"

for retention_name in RESTIC_KEEP_DAILY RESTIC_KEEP_WEEKLY RESTIC_KEEP_MONTHLY; do
    retention_value="${!retention_name:-}"
    [[ "${retention_value}" =~ ^[0-9]+$ ]] \
        || fail "${retention_name} must be numeric"
    (( retention_value >= 1 && retention_value <= 365 )) \
        || fail "${retention_name} must be between 1 and 365"
done
unset retention_name retention_value

if [[ -z "${release_id}" ]]; then
    release_id="$(git -C "${ORVYN_REPO_ROOT}" rev-parse HEAD)"
fi
validate_release_id "${release_id}"
ORVYN_RELEASE_ID="${release_id}"
export ORVYN_RELEASE_ID

if ! ${rollback_mode}; then
    git_head="$(git -C "${ORVYN_REPO_ROOT}" rev-parse HEAD)"
    [[ "${ORVYN_RELEASE_ID}" == "${git_head}" ]] \
        || fail "Release ID must equal the checked-out Git commit"
    [[ -z "$(git -C "${ORVYN_REPO_ROOT}" status --porcelain=v1 --untracked-files=all)" ]] \
        || fail "Deployment source tree must be completely clean"
fi

[[ -f "${ORVYN_DEPLOY_DIR}/docker/backend.Dockerfile.dockerignore" \
    && -f "${ORVYN_DEPLOY_DIR}/docker/frontend.Dockerfile.dockerignore" \
    && -f "${ORVYN_DEPLOY_DIR}/docker/whatsapp.Dockerfile.dockerignore" \
    && -f "${ORVYN_DEPLOY_DIR}/docker/backup.Dockerfile.dockerignore" ]] \
    || fail "Every production Dockerfile needs a context-specific ignore file"

grep -Fxq 'FROM composer:2.9.8 AS composer' "${ORVYN_DEPLOY_DIR}/docker/backend.Dockerfile" \
    || fail "Backend Composer build image differs from the reviewed exact version"
grep -Fxq 'FROM caddy:2.11.4-alpine AS caddy' "${ORVYN_DEPLOY_DIR}/docker/backend.Dockerfile" \
    || fail "Backend Caddy build image differs from the reviewed exact version"
grep -Fxq 'FROM php:8.3.32-fpm-bookworm' "${ORVYN_DEPLOY_DIR}/docker/backend.Dockerfile" \
    || fail "Backend PHP runtime image differs from the reviewed exact version"
grep -Fxq 'FROM node:22.23.1-bookworm-slim AS build' "${ORVYN_DEPLOY_DIR}/docker/frontend.Dockerfile" \
    || fail "Frontend Node build image differs from the reviewed exact version"
grep -Fxq 'FROM caddy:2.11.4-alpine' "${ORVYN_DEPLOY_DIR}/docker/frontend.Dockerfile" \
    || fail "Frontend Caddy runtime image differs from the reviewed exact version"
grep -Fxq 'FROM node:22.23.1-bookworm-slim AS build' "${ORVYN_DEPLOY_DIR}/docker/whatsapp.Dockerfile" \
    || fail "WhatsApp Node build image differs from the reviewed exact version"
grep -Fxq 'FROM node:22.23.1-bookworm-slim' "${ORVYN_DEPLOY_DIR}/docker/whatsapp.Dockerfile" \
    || fail "WhatsApp Node runtime image differs from the reviewed exact version"
grep -Fxq 'FROM restic/restic:0.19.1 AS restic' "${ORVYN_DEPLOY_DIR}/docker/backup.Dockerfile" \
    || fail "Backup restic image differs from the reviewed exact version"
grep -Fxq 'FROM pgvector/pgvector:0.8.5-pg17-bookworm' "${ORVYN_DEPLOY_DIR}/docker/backup.Dockerfile" \
    || fail "Backup PostgreSQL client image differs from the reviewed exact version"

temporary_config="$(mktemp)"
trap 'rm -f -- "${temporary_config}"' EXIT
compose config --format json > "${temporary_config}" \
    || fail "Docker Compose production configuration is invalid"

jq -e '.networks.data_net.internal == true' "${temporary_config}" >/dev/null \
    || fail "data_net must be internal"
jq -e '
    [.services | to_entries[]
      | select(.key != "edge")
      | select((.value.ports // []) | length > 0)] | length == 0
' "${temporary_config}" >/dev/null \
    || fail "Only the edge service may publish host ports"
jq -e '
    [.services | to_entries[]
      | select(.value.privileged == true or .value.read_only != true)] | length == 0
' "${temporary_config}" >/dev/null \
    || fail "Every production service must be unprivileged and read-only"
jq -e '
    [.services | to_entries[]
      | select(((.value.cap_drop // []) | index("ALL")) == null)
      | .key] | length == 0
' "${temporary_config}" >/dev/null \
    || fail "Every production service must drop the default Linux capability set"
jq -e '.services.edge.networks.app_net.ipv4_address == "172.28.0.10"' "${temporary_config}" >/dev/null \
    || fail "The edge proxy must keep the exact trusted IP 172.28.0.10"
jq -e '
    ((.services.postgres.ports // []) | length == 0)
    and ((.services.redis.ports // []) | length == 0)
    and (.services.postgres.networks | keys == ["data_net"])
    and (.services.redis.networks | keys == ["data_net"])
    and ((.services.edge.networks | has("data_net")) | not)
' "${temporary_config}" >/dev/null \
    || fail "PostgreSQL and Redis must not publish ports"
jq -e '
    .services.postgres.image == "pgvector/pgvector:0.8.5-pg17-bookworm"
    and .services.redis.image == "redis:7.4.9-alpine"
    and .services.ollama.image == "ollama/ollama:0.32.3"
' "${temporary_config}" >/dev/null \
    || fail "A runtime data/AI image tag differs from the reviewed exact version"

[[ "${ORVYN_REQUIRE_TRIVY:-true}" == "true" ]] \
    || fail "ORVYN_REQUIRE_TRIVY cannot be disabled in production"
require_command trivy

log "Production preflight passed for release ${ORVYN_RELEASE_ID}"
