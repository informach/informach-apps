import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import Stripe from "../../packages/billing/node_modules/stripe/esm/stripe.esm.node.js";
import { createStripeFutureContractProvider } from "../../packages/billing/src/providers/stripe-future-contract";

// Interactive synthetic fixture. The temporary file contains a test-only
// Checkout capability and is deleted with the customer in the finally block.
const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!/^(sk|rk)_test_/.test(key)) throw new Error("A Stripe test credential is required");
const stripe = new Stripe(key, {
  apiVersion: "2026-04-22.dahlia",
  timeout: 30_000,
  maxNetworkRetries: 2,
});
const provider = createStripeFutureContractProvider({
  secretKey: "unused",
  mode: "dev",
  client: stripe,
});
const path = ".cache/compasso-hosted-session.json";
let customerId: string | undefined;
let setup:
  | {
      intentId: string;
      customerId: string;
      successUrl: string;
      cancelUrl: string;
      expiresAt: number;
    }
  | undefined;
let sessionId: string | undefined;
let createdFile = false;
let failed = false;
try {
  if ((await stripe.balance.retrieve()).livemode) throw new Error("Live mode refused");
  const customer = await stripe.customers.create({
    email: `${randomUUID()}@example.test`,
    metadata: { test_run: "compasso-hosted" },
  });
  customerId = customer.id;
  const returnUrl = `https://example.com/?pagamento=${randomUUID()}#compasso`;
  setup = {
    intentId: randomUUID(),
    customerId,
    successUrl: returnUrl,
    cancelUrl: returnUrl,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const session = await provider.setup(setup);
  if (session.status !== "open" || !session.url) throw new Error("Setup was not opened");
  sessionId = session.id;
  await mkdir(".cache", { recursive: true });
  await writeFile(path, JSON.stringify({ url: session.url }), { flag: "wx" });
  createdFile = true;
  process.stdout.write("Synthetic hosted setup ready.\n");
  await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
  process.stdin.destroy();
  const result = await provider.readSetup(setup, sessionId);
  if (result.status !== "complete" || !result.paymentMethodId)
    throw new Error("Setup did not complete");
  process.stdout.write("Hosted setup confirmed for the synthetic test customer.\n");
} catch {
  failed = true;
  process.stderr.write("Hosted setup verification failed.\n");
} finally {
  try {
    if (setup && sessionId) await provider.expireSetup(setup, sessionId);
  } catch {
    failed = true;
  }
  try {
    if (customerId) await stripe.customers.del(customerId);
  } catch {
    failed = true;
  }
  try {
    if (createdFile) await unlink(path);
  } catch {
    failed = true;
  }
  if (failed) process.exitCode = 1;
}
