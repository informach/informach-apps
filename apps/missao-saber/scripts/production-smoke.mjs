import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Pass the target service variables through stdin, never command-line arguments.
const env = JSON.parse(readFileSync(0, "utf8"));
const origin = env.NEXT_PUBLIC_APP_URL;
assert.equal(origin, "https://missao-saber.informach.com.br");
const Stripe = createRequire(
  resolve(import.meta.dirname, "../../../packages/billing/package.json"),
)("stripe");
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-04-22.dahlia" });
async function request(path, status, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, status, `${path} returned ${response.status}`);
  console.log(`${path}: ${response.status}`);
  return response;
}
const health = await (await request("/api/health", 200)).json();
console.log(`deployment: ${health.deployment}`);
assert.equal((await (await request("/api/ready", 200)).json()).status, "ready");
for (const path of [
  "/",
  "/entrar",
  "/experimentar",
  "/sobre",
  "/privacidade",
  "/termos",
  "/manifest.webmanifest",
  "/favicon.png",
  "/app-icon.png",
])
  await request(path, 200);
for (const path of ["/familia", "/manutencao"]) {
  const r = await request(path, 307);
  assert.match(r.headers.get("location"), /entrar/);
}
await request("/api/jobs/billing", 401, { method: "POST" });
await request("/api/webhooks/stripe", 400, { method: "POST", body: "{}" });
await request("/api/webhooks/sendgrid", 400, { method: "POST", body: "[]" });
const body = JSON.stringify({
  id: `evt_missao_production_smoke_${randomUUID()}`,
  object: "event",
  type: "missao.production.smoke",
  livemode: true,
  created: Math.floor(Date.now() / 1000),
  data: { object: { metadata: { app: "missao-saber", purpose: "deployment-verification" } } },
});
const signed = {
  method: "POST",
  body,
  headers: {
    "Content-Type": "application/json",
    "stripe-signature": stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: env.STRIPE_WEBHOOK_SECRET,
    }),
  },
};
const first = await (await request("/api/webhooks/stripe", 200, signed)).json();
assert.equal(first.processed, true);
const duplicate = await (await request("/api/webhooks/stripe", 200, signed)).json();
assert.equal(duplicate.deduped, true);
console.log("Signed synthetic event processed and deduplicated; no customer or payment changed.");
const job = await (
  await request("/api/jobs/billing", 200, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  })
).json();
assert.ok(["processed", "scheduled", "busy"].includes(job.status));
console.log(`maintenance: ${job.status}`);
