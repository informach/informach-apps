# Mesmos Node 24.15.0 / PostgreSQL 18.6 do executor operacional já qualificado.
FROM node@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS builder
WORKDIR /build
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter @informach/recreio-app typecheck
RUN pnpm --filter @informach/morada-server exec esbuild ../recreio/scripts/backup/provar-arquivo.ts --bundle --platform=node --format=esm --outfile=/build/provar-arquivo.mjs

FROM postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /build/provar-arquivo.mjs /opt/recreio/provar-arquivo.mjs
RUN node --version && postgres --version
ENTRYPOINT ["node", "/opt/recreio/provar-arquivo.mjs"]
CMD []
