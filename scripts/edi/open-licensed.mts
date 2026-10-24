import { isAbsolute, join } from "node:path";
import { desktopAppIdSchema } from "../../packages/edi-contracts/src/index.ts";
import { createNativeHarness, nativeTooling, waitForStatus } from "./native-harness.mts";

/**
 * Opens one desktop tool licensed, for manual testing, without a portal, an account or a
 * subscription: `pnpm edi:open edisvg [args passed to the app]`. It is the native harness of
 * the visual test kept open — a development build with an ephemeral license key, an isolated
 * profile under the OS temp folder and a fixture lease renewed while the app is open. Closing
 * the app (or Ctrl+C here) removes the profile. It never touches the user's own Edi profile.
 *
 * `EDI_OPEN_USER_DATA` (an absolute folder) keeps the tool's own data between sessions there
 * instead: lessons, recordings, transcriptions and the transcription engine survive closing.
 * The license stays ephemeral either way (it lives in the suite folder, not in this one).
 */
const keptUserData = process.env.EDI_OPEN_USER_DATA?.trim();
if (keptUserData && !isAbsolute(keptUserData))
  throw new Error("EDI_OPEN_USER_DATA must be an absolute folder");

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
// Kept outside the try: a failure after launch must close the app before the profile goes.
let application: Awaited<ReturnType<typeof harness.launch>> | undefined;
async function finish(code: number) {
  if (finished) return;
  finished = true;
  if (renewal) clearInterval(renewal);
  await application
    ?.close()
    .catch((error: unknown) => console.error("[edi:open] closing the app failed:", error));
  const failures = await harness.dispose();
  for (const failure of failures) console.error("[edi:open] cleanup failed:", failure);
  process.exit(code);
}
// Registered before the (possibly long) build, so Ctrl+C at any point still cleans up.
process.once("SIGINT", () => void finish(0));
try {
  console.log(`[edi:open] building ${id} with an ephemeral license key`);
  await harness.build(id);
  const profile = {
    userData: keptUserData || join(harness.root, "user-data"),
    suiteData: join(harness.root, "suite"),
  };
  if (keptUserData) console.log(`[edi:open] keeping the tool's data in ${keptUserData}`);
  const launched = await harness.launch(id, profile, {}, appArguments);
  application = launched;
  launched.process().stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
  launched.process().stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  launched.once("close", () => {
    console.log(`[edi:open] ${id} closed; removing ${harness.root}`);
    void finish(0);
  });
  const first = await launched.firstWindow({ timeout: 60_000 });
  await first.waitForFunction(() => typeof window.ediSuite !== "undefined");
  if ((await first.evaluate(async () => (await window.ediSuite.status()).state)) !== "licensed")
    await harness.seedLease(launched, LEASE_SECONDS);
  // The access window closes itself once licensed; the editor window is what remains.
  if (!first.isClosed()) await waitForStatus(first, "licensed").catch(() => undefined);
  renewal = setInterval(() => {
    harness.seedLease(launched, LEASE_SECONDS).then(
      () => console.log("[edi:open] fixture lease renewed"),
      (error: unknown) => console.error("[edi:open] lease renewal failed:", error),
    );
  }, RENEW_MS);
  console.log(`[edi:open] ${id} is open and licensed; profile ${harness.root}`);
} catch (error) {
  console.error(`[edi:open] ${id} did not open:`, error);
  await finish(1);
}
