FROM node:22.23.1-bookworm-slim AS build

WORKDIR /build

COPY whatsapp-service/package.json whatsapp-service/package-lock.json whatsapp-service/tsconfig.json ./
RUN npm ci --ignore-scripts

COPY whatsapp-service/src ./src
RUN npm run build

FROM node:22.23.1-bookworm-slim

ARG ORVYN_RELEASE_ID=development

LABEL org.opencontainers.image.title="ORVYN WhatsApp sidecar" \
      org.opencontainers.image.revision="${ORVYN_RELEASE_ID}"

ENV NODE_ENV=production

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends gosu; \
    rm -rf /var/lib/apt/lists/*; \
    groupadd --gid 10001 orvyn; \
    useradd --uid 10001 --gid 10001 --no-create-home --home-dir /opt/orvyn-whatsapp --shell /usr/sbin/nologin orvyn; \
    mkdir -p /opt/orvyn-whatsapp /var/lib/orvyn-whatsapp/session; \
    chown -R 10001:10001 /opt/orvyn-whatsapp /var/lib/orvyn-whatsapp; \
    chmod 0700 /var/lib/orvyn-whatsapp /var/lib/orvyn-whatsapp/session

WORKDIR /opt/orvyn-whatsapp

COPY whatsapp-service/package.json whatsapp-service/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY --from=build --chown=10001:10001 /build/dist ./dist
COPY --chown=10001:10001 deploy/docker/whatsapp-entrypoint.sh /usr/local/bin/orvyn-whatsapp-entrypoint

RUN chmod 0755 /usr/local/bin/orvyn-whatsapp-entrypoint \
    && chown -R 10001:10001 /opt/orvyn-whatsapp

EXPOSE 3100

ENTRYPOINT ["/usr/local/bin/orvyn-whatsapp-entrypoint"]
CMD ["node", "dist/server.js"]
