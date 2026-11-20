# Node 24.15.0 / PostgreSQL 18.6: digests conferidos em 15/11/2026.
FROM node@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS builder
WORKDIR /build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_DEFAULT_TO_LATEST=0
RUN corepack enable
COPY . .
# Bootstrap explícito e limitado: indisponibilidade da rede não pode prender
# silenciosamente toda a prova. O projeto continua fixando pnpm 9.15.0.
RUN timeout --signal=TERM --kill-after=10s 120s corepack install
RUN COREPACK_ENABLE_NETWORK=0 timeout --signal=TERM --kill-after=10s 600s pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter @informach/morada-server exec esbuild ../recreio/scripts/backup/ensaiar.ts --bundle --platform=node --format=esm --outfile=/build/ensaiar-backup.mjs
RUN pnpm --filter @informach/morada-server exec esbuild ../recreio/scripts/backup/operar-backup.ts --bundle --platform=node --format=cjs --conditions=react-server --tsconfig=../recreio/tsconfig.json --outfile=/build/operar-backup.cjs --metafile=/build/operar-backup.meta.json
RUN pnpm --filter @informach/morada-server exec esbuild ../recreio/scripts/backup/recuperar-captura-prova.ts --bundle --platform=node --format=cjs --conditions=react-server --tsconfig=../recreio/tsconfig.json --outfile=/build/recuperar-captura-prova.cjs --metafile=/build/recuperar-captura-prova.meta.json

RUN node apps/recreio/scripts/backup/conferir-fronteira-bundle.mjs /build/recuperar-captura-prova.meta.json /build/apps/morada-server
RUN node apps/recreio/scripts/backup/conferir-fronteira-bundle.mjs /build/operar-backup.meta.json /build/apps/morada-server

FROM postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /build/ensaiar-backup.mjs /opt/recreio/ensaiar-backup.mjs
COPY --from=builder /build/operar-backup.cjs /opt/recreio/operar-backup.cjs
COPY --from=builder /build/apps/recreio/scripts/backup/entrada-backup.mjs /opt/recreio/entrada-backup.mjs
COPY --from=builder /build/recuperar-captura-prova.cjs /opt/recreio/recuperar-captura-prova.cjs
COPY --from=builder /build/packages/db/src/migrations/*.sql /opt/recreio/migrations/
COPY --from=builder /build/packages/db/src/migrations/meta/_journal.json /opt/recreio/migrations/meta/_journal.json
RUN node --version && postgres --version
ENTRYPOINT ["node", "/opt/recreio/entrada-backup.mjs"]
CMD []
