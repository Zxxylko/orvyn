#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

# shellcheck source=deploy/scripts/lib.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/lib.sh"

usage() {
    printf 'Usage: %s --env-file /absolute/path/.env.production --release GIT_SHA\n' "${0##*/}" >&2
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

[[ -n "${env_file}" && -n "${release_id}" ]] || {
    usage
    fail "--env-file and --release are required"
}

ORVYN_ENV_FILE="$(absolute_existing_file "${env_file}")"
export ORVYN_ENV_FILE
load_env_file "${ORVYN_ENV_FILE}"
validate_release_id "${release_id}"
ORVYN_RELEASE_ID="${release_id}"
export ORVYN_RELEASE_ID

require_command curl
require_command grep
require_command openssl

readonly resolve_https="${ORVYN_DOMAIN}:443:127.0.0.1"
readonly resolve_http="${ORVYN_DOMAIN}:80:127.0.0.1"
headers_file="$(mktemp)"
trap 'rm -f -- "${headers_file}"' EXIT

log "Checking HTTPS, certificate validation, and frontend response"
curl \
    --fail \
    --silent \
    --show-error \
    --proto '=https' \
    --tlsv1.2 \
    --resolve "${resolve_https}" \
    --dump-header "${headers_file}" \
    --output /dev/null \
    "https://${ORVYN_DOMAIN}/"

grep -Eiq '^strict-transport-security:[[:space:]]*max-age=' "${headers_file}" \
    || fail "Public response is missing HSTS"
grep -Eiq '^content-security-policy:' "${headers_file}" \
    || fail "Public response is missing Content-Security-Policy"
grep -Eiq '^x-content-type-options:[[:space:]]*nosniff' "${headers_file}" \
    || fail "Public response is missing nosniff protection"

redirect_headers="$(mktemp)"
trap 'rm -f -- "${headers_file}" "${redirect_headers}"' EXIT
http_code="$(curl \
    --silent \
    --show-error \
    --resolve "${resolve_http}" \
    --dump-header "${redirect_headers}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "http://${ORVYN_DOMAIN}/")"
[[ "${http_code}" == "301" || "${http_code}" == "308" ]] \
    || fail "HTTP must redirect permanently to HTTPS"
grep -Eiq "^location:[[:space:]]*https://${ORVYN_DOMAIN}(/|[[:space:]]*$)" "${redirect_headers}" \
    || fail "HTTP redirect target is not the canonical HTTPS origin"

log "Checking Sanctum endpoint through the public TLS edge"
csrf_code="$(curl \
    --silent \
    --show-error \
    --proto '=https' \
    --tlsv1.2 \
    --resolve "${resolve_https}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "https://${ORVYN_DOMAIN}/sanctum/csrf-cookie")"
[[ "${csrf_code}" == "204" ]] || fail "Sanctum CSRF endpoint returned HTTP ${csrf_code}"

log "Checking internal API health and host allowlist"
compose exec -T php curl \
    --fail --silent --show-error -H 'Host: api' http://api:8080/up >/dev/null
spoofed_host_code="$(compose exec -T php curl \
    --silent --output /dev/null --write-out '%{http_code}' \
    -H 'Host: attacker.invalid' http://api:8080/up)"
[[ "${spoofed_host_code}" == "400" || "${spoofed_host_code}" == "403" || "${spoofed_host_code}" == "421" ]] \
    || fail "Internal API accepted an untrusted Host header (HTTP ${spoofed_host_code})"

websocket_url="https://${ORVYN_DOMAIN}/app/${REVERB_APP_KEY}?protocol=7&client=js&version=8.5.0&flash=false"
websocket_test_key="$(openssl rand -base64 16)"
websocket_headers=(
    -H "Origin: https://${ORVYN_DOMAIN}"
    -H 'Connection: Upgrade'
    -H 'Upgrade: websocket'
    -H 'Sec-WebSocket-Version: 13'
    -H "Sec-WebSocket-Key: ${websocket_test_key}"
)

log "Checking public Reverb WebSocket origin enforcement"
valid_ws_code="$(curl \
    --http1.1 \
    --silent \
    --show-error \
    --max-time 5 \
    --proto '=https' \
    --tlsv1.2 \
    --resolve "${resolve_https}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "${websocket_headers[@]}" \
    "${websocket_url}" 2>/dev/null || true)"
[[ "${valid_ws_code}" == *"101" ]] \
    || fail "Valid Reverb WebSocket handshake did not return HTTP 101"

hostile_ws_code="$(curl \
    --http1.1 \
    --silent \
    --show-error \
    --max-time 5 \
    --proto '=https' \
    --tlsv1.2 \
    --resolve "${resolve_https}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    -H 'Origin: https://attacker.invalid' \
    -H 'Connection: Upgrade' \
    -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' \
    -H "Sec-WebSocket-Key: ${websocket_test_key}" \
    "${websocket_url}" 2>/dev/null || true)"
[[ "${hostile_ws_code}" != *"101" ]] \
    || fail "Reverb accepted a hostile WebSocket Origin"

log "Production smoke tests passed"
