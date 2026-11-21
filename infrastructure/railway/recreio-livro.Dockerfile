# Same fixed Node/pnpm toolchain as the qualified backup role. No PostgreSQL,
# application server, private art or source tree is copied to the final image.
FROM node@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS builder
WORKDIR /build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_DEFAULT_TO_LATEST=0
RUN corepack enable
COPY . .
RUN timeout --signal=TERM --kill-after=10s 120s corepack install
RUN COREPACK_ENABLE_NETWORK=0 timeout --signal=TERM --kill-after=10s 600s pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter @informach/morada-server exec esbuild ../recreio/scripts/inicializar-livro-direitos.ts --bundle --platform=node --format=cjs --conditions=react-server --tsconfig=../recreio/tsconfig.json --outfile=/build/inicializar-livro.cjs --metafile=/build/inicializar-livro.meta.json
RUN node apps/recreio/scripts/conferir-fronteira-livro.mjs /build/inicializar-livro.meta.json /build/apps/morada-server
RUN sha256sum /build/inicializar-livro.cjs

FROM node@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d
WORKDIR /opt/recreio
COPY --from=builder --chown=node:node /build/inicializar-livro.cjs /opt/recreio/inicializar-livro.cjs
USER node
ENTRYPOINT ["node", "--max-old-space-size=256", "/opt/recreio/inicializar-livro.cjs"]
