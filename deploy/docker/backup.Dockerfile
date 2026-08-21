FROM restic/restic:0.19.1 AS restic

FROM pgvector/pgvector:0.8.5-pg17-bookworm

ARG ORVYN_RELEASE_ID=development

LABEL org.opencontainers.image.title="ORVYN encrypted backup runner" \
      org.opencontainers.image.revision="${ORVYN_RELEASE_ID}"

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        openssh-client \
        redis-tools; \
    rm -rf /var/lib/apt/lists/*

COPY --from=restic /usr/bin/restic /usr/local/bin/restic

COPY deploy/scripts/compose-backup.sh /usr/local/bin/orvyn-compose-backup

RUN chmod 0755 /usr/local/bin/orvyn-compose-backup

ENTRYPOINT ["/usr/local/bin/orvyn-compose-backup"]
CMD ["backup"]
