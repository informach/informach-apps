// Sobe o app em desenvolvimento para o playground (/dev/playground), que não
// usa conta, assinatura nem banco. Sem `.env.local`, preenche as variáveis
// obrigatórias com valores de mentira, que só servem para o app abrir: o
// banco aponta para uma porta fechada e o resto do app (login, conta, treinos
// salvos) não funciona assim. Com `.env.local`, ele vale e nada é inventado.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = "3007";
const origin = `http://localhost:${port}`;

const env = { ...process.env };
if (!existsSync(join(app, ".env.local"))) {
  const placeholders = {
    DATABASE_URL: "postgres://playground:playground@127.0.0.1:1/playground",
    BETTER_AUTH_SECRET: "playground-local-only-not-a-secret-000000",
    BETTER_AUTH_URL: origin,
    NEXT_PUBLIC_APP_URL: origin,
    SENDGRID_API_KEY: "SG.playground",
    SENDGRID_FROM: "Bora Treinar <nao-responda@informach.com.br>",
    EMAIL_SANDBOX_MODE: "memory",
    STRIPE_SECRET_KEY: "sk_test_playground",
    STRIPE_WEBHOOK_SECRET: "whsec_playground",
    STRIPE_MODE: "dev",
    CRON_SECRET: "playground-local-only-not-a-secret-000000",
  };
  for (const [key, value] of Object.entries(placeholders)) env[key] ??= value;
}

const assets = spawnSync(process.execPath, [join(app, "scripts/fetch-assets.mjs")], {
  cwd: app,
  stdio: "inherit",
});
if (assets.status !== 0) process.exit(assets.status ?? 1);

console.log(`\n[bora] Playground: ${origin}/dev/playground\n`);
const next = createRequire(join(app, "package.json")).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", "-p", port], {
  cwd: app,
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
