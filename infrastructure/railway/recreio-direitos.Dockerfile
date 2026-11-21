# Standalone bounded round. Only the reviewed server bundle reaches runtime.
FROM node@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS builder
WORKDIR /build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_DEFAULT_TO_LATEST=0
RUN corepack enable
COPY . .
RUN timeout --signal=TERM --kill-after=10s 120s corepack install
RUN COREPACK_ENABLE_NETWORK=0 timeout --signal=TERM --kill-after=10s 600s pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter @informach/morada-server exec esbuild ../recreio/scripts/processar-direitos.ts --bundle --platform=node --format=cjs --conditions=react-server --tsconfig=../recreio/tsconfig.json --outfile=/build/processar-direitos.cjs --metafile=/build/processar-direitos.meta.json
RUN node apps/recreio/scripts/conferir-fronteira-direitos.mjs /build/processar-direitos.meta.json /build/apps/morada-server
RUN sha256sum /build/processar-direitos.cjs

FROM node@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d
WORKDIR /opt/recreio
COPY --from=builder --chown=node:node /build/processar-direitos.cjs /opt/recreio/processar-direitos.cjs
USER node
ENTRYPOINT ["node", "--max-old-space-size=512", "/opt/recreio/processar-direitos.cjs"]
