import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { isStripeTestSecret } from "../src/lib/environment";

const app = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: app, env, stdio: "inherit", windowsHide: true });
    child.once("error", () => reject(new Error("Sandbox subprocess could not start")));
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Sandbox subprocess verification failed")),
    );
  });
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  const pnpm = process.env.npm_execpath;
  const temporary = process.env.RUNNER_TEMP;
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.CI !== "true" ||
    !isStripeTestSecret(key) ||
    !pnpm ||
    !temporary
  )
    throw new Error(
      `Invalid Stripe journey executor: ${[
        process.env.GITHUB_ACTIONS !== "true" ? "GITHUB_ACTIONS" : null,
        process.env.CI !== "true" ? "CI" : null,
        !isStripeTestSecret(key) ? "STRIPE_SECRET_KEY" : null,
        !pnpm ? "npm_execpath" : null,
        !temporary ? "RUNNER_TEMP" : null,
      ]
        .filter(Boolean)
        .join(", ")}`,
    );
  const port = "3109",
    origin = `http://localhost:${port}`;
  const catalog = resolve(temporary, "recreio-stripe-local-catalog.json");
  await run(process.execPath, [pnpm, "exec", "tsx", "scripts/sandbox-catalogo.ts"], {
    ...process.env,
    RECREIO_SANDBOX_APP_URL: origin,
    RECREIO_SANDBOX_APPLY: "true",
    RECREIO_SANDBOX_RECEIPT_PATH: catalog,
  });
  const listener = spawn(
    "stripe",
    [
      "listen",
      "--forward-to",
      `${origin}/api/webhooks/stripe`,
      "--events",
      "checkout.session.completed,invoice.paid,invoice.payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,charge.refunded,charge.dispute.created",
    ],
    {
      cwd: app,
      env: {
        ...process.env,
        STRIPE_API_KEY: key,
        STRIPE_NO_AUTO_UPDATE: "1",
        STRIPE_CLI_TELEMETRY_OPTOUT: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  try {
    const secret = await new Promise<string>((resolve, reject) => {
      let buffer = "",
        ready = false;
      const timeout = setTimeout(
        () => reject(new Error("Stripe listener did not become ready")),
        45_000,
      );
      const consume = (bytes: Buffer) => {
        // The CLI may print customer data in event output. Never forward its
        // streams or persist them: extract/mask only the session signing secret.
        if (ready) return;
        buffer = stripVTControlCharacters(buffer + bytes.toString("utf8")).slice(-8192);
        const match = /whsec_[A-Za-z0-9_]{16,}/.exec(buffer);
        if (match) {
          ready = true;
          clearTimeout(timeout);
          console.log(`::add-mask::${match[0]}`);
          resolve(match[0]);
          buffer = "";
        }
      };
      listener.stdout.on("data", consume);
      listener.stderr.on("data", consume);
      listener.once("error", () => {
        clearTimeout(timeout);
        reject(new Error("Stripe listener could not start"));
      });
      listener.once("exit", () => {
        clearTimeout(timeout);
        if (!ready) reject(new Error("Stripe listener exited before readiness"));
      });
    });
    await run(process.execPath, [resolve(app, "scripts/isolated.mjs"), "e2e-stripe-sandbox"], {
      ...process.env,
      RECREIO_E2E_PORT: port,
      RECREIO_STRIPE_SANDBOX_KEY: key,
      RECREIO_STRIPE_SANDBOX_WEBHOOK_SECRET: secret,
      RECREIO_STRIPE_SANDBOX_CATALOG_PATH: catalog,
    });
    if (listener.exitCode !== null || listener.signalCode !== null)
      throw new Error("Stripe listener ended during the journey");
  } finally {
    listener.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (listener.exitCode !== null || listener.signalCode !== null) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        listener.kill("SIGKILL");
        resolve();
      }, 5000);
      listener.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: "failed",
      type: "stripe_sandbox_journey",
      message: error instanceof Error ? error.message : "Unknown verification failure",
    }),
  );
  process.exitCode = 1;
});
