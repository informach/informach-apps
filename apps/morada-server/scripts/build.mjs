import { build } from "esbuild";

// Os packages internos são TypeScript fonte. O processo de produção leva
// tudo no bundle, sem tsx, watchers ou arquivos de teste/desenvolvimento.
await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "bundle",
  external: ["pino", "ws", "@sentry/node"],
  sourcemap: "external",
  logLevel: "info",
});
