import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { desktopAppIdSchema, MAX_LEASE_SECONDS } from "../../packages/edi-contracts/src/index.ts";
import { createNativeHarness, nativeTooling, waitForStatus } from "./native-harness.mts";
import { type OpenMode, resolveOpenProfile } from "./open-profile.mts";
import { watchBuildSources } from "./work-freshness.mts";

/**
 * Opens one desktop tool licensed, without a portal, an account or a subscription. It is the
 * native harness of the visual test kept open: a development build with an ephemeral license
 * key and a fixture lease renewed while the app is open. The license always lives in a
 * temporary suite folder, removed on close; the tool's own data depends on the mode
 * (`open-profile.mts`).
 *
 * - `pnpm edi:open edisvg [args passed to the app]`: manual testing. Throwaway profile under the
 *   OS temp folder, removed on close, unless `EDI_OPEN_USER_DATA` names a folder to keep.
 * - `pnpm edi:work ediaula [args]`: daily work on the development build. The tool's own
 *   profile (`%APPDATA%\<tool>`, as the installed app) that is never removed, the real Documents
 *   for EdiAula, and leases as long as the production offline window, so a sleeping computer
 *   does not lock the editor with work open. The desktop shortcuts of `pnpm edi:work:instalar`
 *   call this command.
 *
 * Every run rebuilds the tool from the current source, so a `git pull` or an edit shows up on
 * the next opening. One run per tool at a time (a lock under `.cache/edi-open`): a second build
 * would rewrite `out/` under the open app. In work mode, while the tool is open, a change to its
 * sources marks it stale for the development Hub, which then offers to restart it
 * (`work-freshness.mts`). A test session is never offered: the Hub reopens in work mode, on the
 * real profile.
 */
const argv = process.argv.slice(2);
const mode: OpenMode = argv[0] === "--work" ? "work" : "test";
const command = mode === "work" ? "edi:work" : "edi:open";
const [requested, ...appArguments] = mode === "work" ? argv.slice(1) : argv;
const parsed = desktopAppIdSchema.safeParse(requested);
if (!parsed.success)
  throw new Error(
    `Usage: pnpm ${command} <${desktopAppIdSchema.options.join("|")}> [app arguments]`,
  );
const id = parsed.data;
const { packageManager } = nativeTooling();
const LEASE_SECONDS = mode === "work" ? MAX_LEASE_SECONDS : 1800;
const RENEW_MS = 20 * 60_000;
const log = (message: string) => console.log(`[${command}] ${message}`);

// The lock is taken before the build. A dead owner (crash, closed terminal) does not hold it.
const locks = resolve(".cache", "edi-open");
const lock = join(locks, `${id}.pid`);
mkdirSync(locks, { recursive: true });
try {
  const owner = Number(readFileSync(lock, "utf8"));
  if (owner && owner !== process.pid) {
    process.kill(owner, 0);
    console.error(`[${command}] ${id} is already open (process ${owner}); close it first`);
    process.exit(2);
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "EPERM") {
    console.error(`[${command}] ${id} is already open; close it first`);
    process.exit(2);
  }
}
writeFileSync(lock, String(process.pid));
// Beside the lock, for the development Hub (scripts/edi/hub-dev), in work mode only: `<id>.stale`
// names the first source file changed since this build, and `<id>.stop`, written by the Hub,
// asks the tool to quit through its normal path (an editor may still ask to save first). Both
// are cleared in either mode, so a test session never inherits them.
const stale = join(locks, `${id}.stale`);
const stop = join(locks, `${id}.stop`);
rmSync(stale, { force: true });
rmSync(stop, { force: true });
process.once("exit", () => {
  try {
    if (readFileSync(lock, "utf8") === String(process.pid)) {
      rmSync(lock);
      rmSync(stale, { force: true });
      rmSync(stop, { force: true });
    }
  } catch {
    // Already gone.
  }
});

const harness = await createNativeHarness("edi-open-", packageManager);
let renewal: ReturnType<typeof setInterval> | undefined;
let stopRequests: ReturnType<typeof setInterval> | undefined;
let stopWatching: (() => void) | undefined;
let finished = false;
// Kept outside the try: a failure after launch must close the app before the profile goes.
let application: Awaited<ReturnType<typeof harness.launch>> | undefined;
async function finish(code: number) {
  if (finished) return;
  finished = true;
  if (renewal) clearInterval(renewal);
  if (stopRequests) clearInterval(stopRequests);
  stopWatching?.();
  await application
    ?.close()
    .catch((error: unknown) => console.error(`[${command}] closing the app failed:`, error));
  const failures = await harness.dispose();
  for (const failure of failures) console.error(`[${command}] cleanup failed:`, failure);
  process.exit(code);
}
// Registered before the (possibly long) build, so Ctrl+C at any point still cleans up.
process.once("SIGINT", () => void finish(0));
if (mode === "work") {
  stopRequests = setInterval(() => {
    if (!existsSync(stop)) return;
    rmSync(stop, { force: true });
    log("closing at the development Hub's request");
    if (!application) return void finish(0);
    // app.quit(), as the tool's own menu or tray does, so its normal closing path runs.
    application.evaluate(({ app }) => app.quit()).catch(() => undefined);
  }, 1000);
  stopRequests.unref();
}
try {
  const profile = resolveOpenProfile({
    mode,
    id,
    env: process.env,
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: Windows profile folder of a local launcher, never a Turbo task.
    appData: process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
    temp: tmpdir(),
    harnessRoot: harness.root,
  });
  log(`building ${id} with an ephemeral license key`);
  const buildStarted = Date.now();
  await harness.build(id);
  // From the build's start, so an edit made while it compiled counts. Only a convenience: a
  // failure to watch never keeps the tool from opening.
  if (mode === "work")
    try {
      stopWatching = watchBuildSources(
        resolve("."),
        id,
        (path) => {
          log(`${path} changed after this build; close ${id} and open it again to use it`);
          try {
            writeFileSync(stale, path);
          } catch (error) {
            console.error(`[${command}] marking ${id} as stale failed:`, error);
          }
        },
        buildStarted,
      );
    } catch (error) {
      console.error(`[${command}] watching the source for changes failed:`, error);
    }
  if (profile.kept) log(`the tool's data stays in ${profile.userData}`);
  if (profile.environment.EDIAULA_REAL_DOCUMENTS)
    log("EdiAula saves projects and recordings in Documents\\EdiAula, as the installed app does");
  const launched = await harness.launch(
    id,
    { userData: profile.userData, suiteData: join(harness.root, "suite") },
    profile.environment,
    appArguments,
  );
  application = launched;
  launched.process().stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
  launched.process().stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  launched.once("close", () => {
    log(
      profile.kept
        ? `${id} closed; ${profile.userData} is kept, removing only the license in ${harness.root}`
        : `${id} closed; removing ${harness.root}`,
    );
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
      () => log("fixture lease renewed"),
      (error: unknown) => console.error(`[${command}] lease renewal failed:`, error),
    );
  }, RENEW_MS);
  log(`${id} is open and licensed`);
} catch (error) {
  console.error(`[${command}] ${id} did not open:`, error);
  await finish(1);
}
