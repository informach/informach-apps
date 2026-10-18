import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { nativeFailure, nativeStage } from "./native-diagnostics.mts";

async function runMedia() {
  const root = await mkdtemp(join(tmpdir(), "edi-capture-media-"));
  const workspace = fileURLToPath(new URL("../../", import.meta.url));
  const electron: unknown = createRequire(import.meta.url)("electron");
  assert.equal(typeof electron, "string");
  if (typeof electron !== "string") throw new Error("Missing Electron");
  const injectFailure = process.argv.includes("--fixture-failure");
  let childClosed = false;
  let failed = false;
  try {
    const result = await nativeStage(
      "capture-media",
      "functional",
      [root, workspace],
      () =>
        new Promise<{ code: number | null; output: string }>((resolve, reject) => {
          const env = Object.fromEntries(
            Object.entries(process.env).filter(
              ([name, value]) =>
                value !== undefined && !["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS"].includes(name),
            ),
          );
          const child = spawn(
            electron,
            [
              join(workspace, "apps/edicaptura/tests/media-native.cjs"),
              `--fixture-root=${root}`,
              ...(injectFailure ? ["--fixture-failure"] : []),
            ],
            { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
          );
          console.log(
            JSON.stringify({ mediaChildPid: child.pid, childName: basename(child.spawnfile) }),
          );
          let output = "";
          let failure: Error | undefined;
          const timeout = setTimeout(() => {
            failure = new Error("Owned media child exceeded deadline");
            child.kill();
          }, 60000);
          child.once("error", (error) => {
            failure = error;
          });
          for (const stream of [child.stdout, child.stderr])
            stream.on("data", (data: Buffer) => {
              output = (output + data.toString()).slice(-128001);
              if (output.length > 128000) {
                failure = new Error("Owned media child exceeded output limit");
                child.kill();
              }
            });
          child.once("close", (code, signal) => {
            clearTimeout(timeout);
            childClosed = true;
            if (failure || child.killed || signal)
              reject(failure || new Error("Owned media child was forcibly terminated"));
            else resolve({ code, output });
          });
        }),
    );
    process.stdout.write(result.output);
    console.log(JSON.stringify({ mediaActualChildExitCode: result.code }));
    assert.equal(result.code, 0, "Media child failure must fail its parent runner");
    assert(result.output.includes('"mediaFixtureResult":0'));
    assert(result.output.includes('"allFourProfilesOwned":true'));
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    assert(childClosed, "Retain owned root until child is closed");
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert(basename(root).startsWith("edi-capture-media-"));
    await rm(root, { recursive: true, force: true });
    console.log(
      JSON.stringify({
        mediaParentCleanupComplete: true,
        resultCode: failed ? 1 : 0,
        injectedFailure: injectFailure,
      }),
    );
  }
}

if (process.argv.includes("--verify-failure-exit")) {
  let observed: ReturnType<typeof nativeFailure> | undefined;
  try {
    await promisify(execFile)(
      process.execPath,
      [fileURLToPath(import.meta.url), "--fixture-failure"],
      {
        windowsHide: true,
        timeout: 65000,
        maxBuffer: 256000,
      },
    );
  } catch (error) {
    observed = nativeFailure(error, [resolve(".")]);
  }
  assert.equal(observed?.code, 1, "The parent runner must propagate its child's assertion failure");
  assert.equal(observed.signal, null);
  assert.equal(observed.killed, false);
  assert(observed.stdout?.includes('"mediaActualChildExitCode":1'));
  assert(observed.stdout?.includes('"mediaFixtureResult":1'));
  assert(observed.stdout?.includes('"mediaParentCleanupComplete":true,"resultCode":1'));
  assert(observed.stdout?.includes('"allFourProfilesOwned":true'));
  assert(observed.stdout?.includes("OWNED_MEDIA_ASSERTION_FAILURE"));
  process.stdout.write(observed.stdout || "");
  process.stderr.write(observed.stderr || "");
  console.log(
    JSON.stringify({
      mediaFailureDriverResult: 0,
      actualParentExitCode: observed.code,
      actualChildExitCode: 1,
    }),
  );
} else await runMedia();
