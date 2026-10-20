import { join } from "node:path";
import { desktopAppIdSchema } from "../../packages/edi-contracts/src/index.ts";
import { createNativeHarness, nativeTooling, waitForStatus } from "./native-harness.mts";

/**
 * Opens one desktop tool licensed, for manual testing, without a portal, an account or a
 * subscription: `pnpm edi:open edisvg [args passed to the app]`. It is the native harness of
 * the visual test kept open — a development build with an ephemeral license key, an isolated
 * profile under the OS temp folder and a fixture lease renewed while the app is open. Closing
 * the app (or Ctrl+C here) removes the profile. It never touches the user's own Edi profile.
 */

const [requested, ...appArguments] = process.argv.slice(2);
const parsed = desktopAppIdSchema.safeParse(requested);
if (!parsed.success)
  throw new Error(`Usage: pnpm edi:open <${desktopAppIdSchema.options.join("|")}> [app arguments]`);
const id = parsed.data;
const { packageManager } = nativeTooling();
const LEASE_SECONDS = 1800;
const RENEW_MS = 20 * 60_000;

const harness = await createNativeHarness("edi-open-", packageManager);
let renewal: ReturnType<typeof setInterval> | undefined;
let finished = false;
async function finish(code: number) {
  if (finished) return;
  finished = true;
  if (renewal) clearInterval(renewal);
  const failures = await harness.dispose();
  for (const failure of failures) console.error("[edi:open] cleanup failed:", failure);
  process.exit(code);
}
try {
  console.log(`[edi:open] building ${id} with an ephemeral license key`);
  await harness.build(id);
  const profile = {
    userData: join(harness.root, "user-data"),
    suiteData: join(harness.root, "suite"),
  };
  const application = await harness.launch(id, profile, {}, appArguments);
  application.process().stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
  application.process().stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  application.once("close", () => {
    console.log(`[edi:open] ${id} closed; removing ${harness.root}`);
    void finish(0);
  });
  process.once("SIGINT", () => {
    void application.close().finally(() => finish(0));
  });
  const first = await application.firstWindow({ timeout: 60_000 });
  await first.waitForFunction(() => typeof window.ediSuite !== "undefined");
  if ((await first.evaluate(async () => (await window.ediSuite.status()).state)) !== "licensed")
    await harness.seedLease(application, LEASE_SECONDS);
  // The access window closes itself once licensed; the editor window is what remains.
  if (!first.isClosed()) await waitForStatus(first, "licensed").catch(() => undefined);
  renewal = setInterval(() => {
    harness.seedLease(application, LEASE_SECONDS).then(
      () => console.log("[edi:open] fixture lease renewed"),
      (error: unknown) => console.error("[edi:open] lease renewal failed:", error),
    );
  }, RENEW_MS);
  console.log(`[edi:open] ${id} is open and licensed; profile ${harness.root}`);
} catch (error) {
  console.error(`[edi:open] ${id} did not open:`, error);
  await finish(1);
}
