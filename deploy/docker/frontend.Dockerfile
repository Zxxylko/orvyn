FROM node:22.23.1-bookworm-slim AS build

ARG ORVYN_RELEASE_ID=development
ARG VITE_API_URL
ARG VITE_APP_NAME=ORVYN
ARG VITE_DEMO_LOGIN_ENABLED=false
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_REVERB_APP_KEY
ARG VITE_REVERB_HOST
ARG VITE_REVERB_PORT=443
ARG VITE_REVERB_SCHEME=wss
ARG VITE_CSRF_COOKIE_URL=/sanctum/csrf-cookie
ARG VITE_BROADCAST_AUTH_ENDPOINT=/broadcasting/auth

ENV VITE_API_URL="${VITE_API_URL}" \
    VITE_APP_NAME="${VITE_APP_NAME}" \
    VITE_DEMO_LOGIN_ENABLED="${VITE_DEMO_LOGIN_ENABLED}" \
    VITE_FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY}" \
    VITE_FIREBASE_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN}" \
    VITE_FIREBASE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID}" \
    VITE_FIREBASE_STORAGE_BUCKET="${VITE_FIREBASE_STORAGE_BUCKET}" \
    VITE_FIREBASE_MESSAGING_SENDER_ID="${VITE_FIREBASE_MESSAGING_SENDER_ID}" \
    VITE_FIREBASE_APP_ID="${VITE_FIREBASE_APP_ID}" \
    VITE_REVERB_APP_KEY="${VITE_REVERB_APP_KEY}" \
    VITE_REVERB_HOST="${VITE_REVERB_HOST}" \
    VITE_REVERB_PORT="${VITE_REVERB_PORT}" \
    VITE_REVERB_SCHEME="${VITE_REVERB_SCHEME}" \
    VITE_CSRF_COOKIE_URL="${VITE_CSRF_COOKIE_URL}" \
    VITE_BROADCAST_AUTH_ENDPOINT="${VITE_BROADCAST_AUTH_ENDPOINT}"

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts

COPY frontend/index.html frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json frontend/vite.config.ts ./
COPY frontend/public ./public
COPY frontend/src ./src

RUN npm run build

FROM caddy:2.11.4-alpine

ARG ORVYN_RELEASE_ID=development

LABEL org.opencontainers.image.title="ORVYN frontend edge" \
      org.opencontainers.image.revision="${ORVYN_RELEASE_ID}"

RUN set -eux; \
    addgroup -g 10001 -S orvyn; \
    adduser -u 10001 -S -D -H -G orvyn orvyn; \
    mkdir -p /srv /data/caddy /config/caddy; \
    chown -R 10001:10001 /srv /data /config

COPY --from=build --chown=10001:10001 /build/dist /srv
COPY --chown=10001:10001 deploy/caddy/Caddyfile /etc/caddy/Caddyfile

USER 10001:10001

EXPOSE 80 443 443/udp

ENTRYPOINT ["caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
