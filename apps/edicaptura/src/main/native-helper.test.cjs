// The app's own helper (resources/native/edicaptura-helper.exe, built by the test script) through the
// production clients. Read-only queries only: no focus, wheel, global input or clipboard change.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFile, spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  nativeCursor,
  nativeEligibleWindows,
  nativeWindowBounds,
  prepareWindowsCapture,
  queryWindowsCapture,
} = require("@informach/edi-desktop/windows-capture");
const { NATIVE_HELPER, nativeHelperPath, useNativeHelper } = require("./native-helper.ts");
const { writeWindowsFileDrop } = require("./windows-file-clipboard.mts");

const appDir = path.join(__dirname, "..", "..");
const executable = path.join(appDir, "resources", "native", NATIVE_HELPER);
const skip =
  process.platform !== "win32"
    ? "Windows only"
    : !fs.existsSync(executable) && "helper not built (run the package test script)";
if (!skip) useNativeHelper(executable);

/** Raw protocol: one helper run with these arguments and stdin. */
function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    const timer = setTimeout(() => child.kill(), 15_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout });
    });
    child.stdin.end(input);
  });
}

test("the helper is resolved inside the app in development and in resources when installed", () => {
  assert.equal(
    nativeHelperPath({ isPackaged: false, getAppPath: () => "C:\\dev\\edicaptura" }, "C:\\x"),
    path.join("C:\\dev\\edicaptura", "resources", "native", "edicaptura-helper.exe"),
  );
  assert.equal(
    nativeHelperPath({ isPackaged: true, getAppPath: () => "C:\\ignored" }, "C:\\App\\resources"),
    path.join("C:\\App\\resources", "native", "edicaptura-helper.exe"),
  );
});

test("the helper reports the version it was stamped with", { skip }, async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));
  const expected = process.env.EDI_RELEASE_TAG
    ? process.env.EDI_RELEASE_TAG.replace(/^edi-v/, "")
    : manifest.version;
  const stdout = await new Promise((resolve, reject) =>
    execFile(executable, ["--version"], { windowsHide: true, timeout: 15_000 }, (error, out) =>
      error ? reject(error) : resolve(out),
    ),
  );
  assert.equal(stdout, `${expected}\n`);
  assert.equal((await run(["exec"], "")).code, 2);
  assert.equal((await run(["capture", "--session", "extra"], "")).code, 2);
});

test("one-shot queries answer through the validated contract", { skip }, async () => {
  const cursor = await nativeCursor();
  assert.equal(typeof cursor.visible, "boolean");
  if (cursor.visible) {
    assert.ok(cursor.width > 0 && cursor.height > 0);
    assert.ok(cursor.hotspotX < cursor.width && cursor.hotspotY < cursor.height);
  }
  assert.deepEqual(await nativeEligibleWindows([]), []);
  // Handle 1 is never a top-level window: skipped by the list, refused by bounds.
  assert.deepEqual(await nativeEligibleWindows(["1"]), []);
  await assert.rejects(nativeWindowBounds("1"), /WINDOW_UNAVAILABLE/);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(queryWindowsCapture({ op: "cursor" }, { signal: aborted.signal }));
});

test("the helper refuses malformed or unknown requests with a closed code", { skip }, async () => {
  for (const input of [
    "not json\n",
    '{"op":"exec","code":"exit"}\n',
    '{"op":"bounds","handle":"1;exit"}\n',
    '{"op":"bounds","handle":"9223372036854775808"}\n',
    `{"op":"windows","handles":[${Array(129).fill('"1"').join(",")}]}\n`,
    '{"op":"wheel","target":{"handle":"1","identity":"1:2:3","bounds":{"x":0,"y":0,"width":1,"height":1}},"region":{"x":0,"y":0,"width":1,"height":1},"axis":"vertical","delta":240}\n',
    "",
  ]) {
    const result = await run(["capture"], input);
    assert.equal(result.code, 1, input);
    assert.equal(result.stdout, '{"ok":false,"error":"INVALID_ACTION"}\n', input);
  }
});

test("a session answers in order and ends at its first failure", { skip }, async () => {
  const session = await prepareWindowsCapture();
  try {
    assert.ok(session.preparationMs >= 0);
    assert.deepEqual(await session.query({ op: "windows", handles: [] }), []);
    assert.equal(typeof (await session.query({ op: "cursor" })).visible, "boolean");
    await assert.rejects(session.query({ op: "bounds", handle: "1" }), /WINDOW_UNAVAILABLE/);
    await assert.rejects(session.query({ op: "cursor" }), /CAPTURE_CANCELLED/);
  } finally {
    session.close();
  }
  const raw = await run(
    ["capture", "--session"],
    '{"op":"windows","handles":[]}\n{"op":"bounds","handle":"1"}\n{"op":"cursor"}\n',
  );
  assert.equal(
    raw.stdout,
    'READY\n{"ok":true,"result":[]}\n{"ok":false,"error":"WINDOW_UNAVAILABLE"}\n',
  );
  assert.equal(raw.code, 1);
});

test("the file clipboard refuses a missing, changed or malformed export before touching the clipboard", {
  skip,
}, async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "edicaptura-filedrop-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, "Final $(never-executed) [imagem].png");
  const bytes = Buffer.from("89504e470d0a1a0a", "hex");
  fs.writeFileSync(file, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await assert.rejects(
    writeWindowsFileDrop(path.join(folder, "missing.png"), sha256, bytes.length),
    /Não foi possível copiar o arquivo/,
  );
  await assert.rejects(writeWindowsFileDrop(file, "0".repeat(64), bytes.length), /copiar/);
  await assert.rejects(writeWindowsFileDrop(file, sha256, bytes.length + 1), /copiar/);
  await assert.rejects(writeWindowsFileDrop(file, sha256.toUpperCase(), bytes.length), /copiar/);
  await assert.rejects(writeWindowsFileDrop(file, sha256, 400_000_001), /copiar/);
  for (const input of ["not json", JSON.stringify({ file, sha256 }), JSON.stringify([file])]) {
    const result = await run(["filedrop"], input);
    assert.deepEqual(result, { code: 1, stdout: "" });
  }
});
