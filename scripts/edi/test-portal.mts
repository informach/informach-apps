import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { promisify } from "node:util";

const database = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.EDI_ISOLATED_DATABASE !== "1" ||
  !["127.0.0.1", "localhost"].includes(database.hostname)
)
  throw new Error("Standalone verification requires the disposable integration database");
const layout = resolve("apps/edi/.next/standalone/apps/edi");
await access(resolve(layout, "server.js"));
await access(resolve(layout, "setup-oauth.cjs"));
const probe = createServer();
await new Promise<void>((done, reject) => {
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", done);
});
const address = probe.address();
if (!address || typeof address === "string") throw new Error("Cannot reserve portal test port");
await new Promise<void>((done, reject) => probe.close((error) => (error ? reject(error) : done())));
const origin = `http://127.0.0.1:${address.port}`;
const environment = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(address.port),
  HOSTNAME: "127.0.0.1",
  NEXT_PUBLIC_APP_URL: "https://edi.example.test",
  BETTER_AUTH_URL: "https://edi.example.test",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  CRON_SECRET: randomBytes(32).toString("hex"),
  EDI_BILLING_ENABLED: "false",
  EDI_LICENSE_PRIVATE_KEY: generateKeyPairSync("ed25519")
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString(),
  EDI_LICENSE_KEY_ID: "ephemeral-portal-test",
  EDI_DESKTOP_CLIENT_ID: "edi-portal-deployment-test",
  EDI_UPDATE_PUBLIC_KEYS: "{}",
  SENDGRID_API_KEY: "SG.never-sent-portal-test",
  EMAIL_SANDBOX_MODE: "live",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  STRIPE_MODE: "prod",
};
const execute = promisify(execFile);
for (let attempt = 0; attempt < 2; attempt++)
  await execute(process.execPath, [resolve(layout, "setup-oauth.cjs")], {
    env: environment,
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 1048576,
  });
console.log("Bundled OAuth pre-deploy command is idempotent and closes its owned connection.");
const server = spawn(process.execPath, [resolve(layout, "server.js")], {
  env: environment,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
const exited = new Promise<void>((done, reject) => {
  server.once("error", reject);
  server.once("exit", () => done());
});
const failures: unknown[] = [];
server.stderr.resume();
try {
  await new Promise<void>((done, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Standalone startup exceeded 30 seconds")),
      30000,
    );
    let output = "";
    server.stdout.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4096);
      if (output.includes("Ready in")) {
        clearTimeout(timer);
        done();
      }
    });
    server.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Standalone exited before readiness"));
    });
  });
  const request = (path: string, options?: RequestInit) =>
    fetch(`${origin}${path}`, {
      ...options,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
  const health = await request("/api/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).app, "edi");
  const ready = await request("/api/ready");
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).ok, true);
  const home = await request("/");
  assert.equal(home.status, 200);
  const html = await home.text();
  const assets = new Set(
    [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"\s]+)"/g)].map((match) => {
      const asset = match[1];
      if (!asset) throw new Error("Missing compiled asset path");
      return asset;
    }),
  );
  assert.ok(assets.size > 0, "Standalone home must reference real compiled assets");
  for (const asset of assets) {
    const response = await request(asset);
    assert.equal(response.status, 200, `Missing standalone asset: ${asset}`);
    await response.body?.cancel();
  }
  const session = await request("/api/auth/get-session");
  assert.equal(session.status, 200);
  assert.equal(await session.json(), null);
  const invalidBytes = await request("/api/desktop/license", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new Uint8Array([255]),
  });
  assert.equal(invalidBytes.status, 400);
  assert.deepEqual(await invalidBytes.json(), { error: "invalid_input" });
  const oversized = await request("/api/desktop/license", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new Uint8Array(16385),
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: "payload_too_large" });
  const account = await request("/conta");
  if (account.status === 307) {
    assert.equal(account.headers.get("location"), "/entrar");
    await account.body?.cancel();
  } else {
    // Next.js emits a refresh meta tag if the RSC stream has already started.
    assert.equal(account.status, 200);
    const page = await account.text();
    assert.ok(
      /<meta[^>]+http-equiv="refresh"[^>]+content="[0-9]+;url=\/entrar"/.test(page),
      "Expected the documented streamed redirect to /entrar",
    );
    assert.ok(
      !page.includes("Sua assinatura"),
      "Anonymous account response must contain no account content",
    );
  }
  const device = await request("/api/auth/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: environment.EDI_DESKTOP_CLIENT_ID,
      scope: "edi:license edi:devices offline_access",
      resource: "https://edi.example.test/api/desktop",
    }),
  });
  assert.equal(device.status, 200);
  const code = await device.json();
  assert.equal(code.verification_uri, "https://edi.example.test/conectar");
  assert.equal(typeof code.device_code, "string");
  assert.equal((await request("/api/jobs/reconcile", { method: "POST" })).status, 401);
  const disabledBilling = await request("/api/jobs/reconcile", {
    method: "POST",
    headers: { Authorization: `Bearer ${environment.CRON_SECRET}` },
  });
  assert.equal(disabledBilling.status, 503);
  assert.equal((await disabledBilling.json()).error, "billing_disabled");
  console.log(
    `Standalone HTTP verified: readiness, home, ${assets.size} assets, session, account guard, desktop OAuth and disabled billing.`,
  );
} catch (error) {
  failures.push(error);
}
try {
  if (server.exitCode === null) server.kill("SIGTERM");
  await exited;
} catch (error) {
  failures.push(error);
}
if (failures.length) throw new AggregateError(failures, "Standalone portal verification failed");
