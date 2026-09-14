import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

const local = parse(readFileSync(resolve(import.meta.dirname, "../.env.local")));
if (local.STRIPE_MODE !== "dev" || !/^(sk|rk)_test_/.test(local.STRIPE_SECRET_KEY ?? ""))
  throw new Error("Local forwarding requires a test Stripe key");
const origin = new URL(local.NEXT_PUBLIC_APP_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
  throw new Error("Local forwarding requires a loopback URL");
const listener = spawn(
  "stripe",
  [
    "listen",
    "--events",
    [
      "checkout.session.completed",
      "checkout.session.expired",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
    ].join(","),
    "--forward-to",
    `${origin.origin}/api/webhooks/stripe`,
  ],
  {
    env: { ...process.env, STRIPE_API_KEY: local.STRIPE_SECRET_KEY },
    stdio: "inherit",
    windowsHide: true,
  },
);
listener.on("error", () => {
  console.error("Install the Stripe CLI before starting the listener");
  process.exitCode = 1;
});
listener.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
