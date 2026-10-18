const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function run(mode) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "edi-capture-pixels-"));
  let output = "";
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        require("electron"),
        [
          path.join(__dirname, "capture-pixels-native.cjs"),
          `--fixture-root=${root}`,
          `--fixture-mode=${mode}`,
          // This GUI fixture must show its owned capture surfaces. STARTUPINFO hiding
          // can override its first ShowWindow call even when BrowserWindow.show is used.
        ],
        { windowsHide: false, stdio: ["ignore", "pipe", "pipe"] },
      );
      const timeout = setTimeout(() => child.kill(), 45000);
      child.once("error", reject);
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (data) => {
          output += data.toString();
          if (output.length > 100000) child.kill();
        });
      child.once("close", (code, signal) => {
        clearTimeout(timeout);
        resolve({ code, signal });
      });
    });
    process.stdout.write(output);
    assert.equal(result.signal, null, "Fixture terminated before its explicit result");
    if (mode === "pixels") {
      assert.equal(result.code, 0, "Native pixel assertions failed");
      assert(output.includes('"actualElectronAllScreens":true'));
      assert(output.includes('"fixtureCleanupComplete":true,"resultCode":0'));
    } else {
      assert.equal(result.code, 1, "Deliberate fixture failure must reach the parent");
      assert(output.includes("FIXTURE_EXPECTED_FAILURE"));
      assert(output.includes('"fixtureCleanupComplete":true,"resultCode":1'));
    }
    assert(output.includes('"ownedProfile":true,"ownedSessionData":true'));
    console.log(JSON.stringify({ fixtureMode: mode, actualExitCode: result.code }));
  } finally {
    // Only this mkdtemp result is removed, after the Electron child has closed.
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert(path.basename(root).startsWith("edi-capture-pixels-"));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
(async () => {
  if (process.argv.includes("--verify-failure-exits")) {
    for (const mode of ["assertion", "uncaught", "rejection", "cleanup"]) await run(mode);
  } else await run("pixels");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
