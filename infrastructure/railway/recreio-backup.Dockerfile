# Node 24.15.0 / PostgreSQL 18.6: digests conferidos em 15/11/2026.
FROM node@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS builder
WORKDIR /build
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter @informach/morada-server exec esbuild ../recreio/scripts/backup/ensaiar.ts --bundle --platform=node --format=esm --outfile=/build/ensaiar-backup.mjs

FROM postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /build/ensaiar-backup.mjs /opt/recreio/ensaiar-backup.mjs
RUN node --version && postgres --version
ENTRYPOINT ["node", "/opt/recreio/ensaiar-backup.mjs"]
CMD []
CMD []
