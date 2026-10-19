import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, ClipboardItem, clipboard, nativeImage } from "electron";
import koffi from "koffi";
import { readEditorClipboard, writeAnnotationClipboard } from "../../src/main/clipboard.ts";
import { ANNOTATION_CLIPBOARD_MIME } from "../../src/shared/clipboard-format.ts";

const [expectedStation, report, root] = process.argv.slice(2);
if (
  !expectedStation ||
  !/^[a-z\d$-]{1,256}$/i.test(expectedStation) ||
  expectedStation.toLowerCase() === "winsta0" ||
  !report ||
  !root
)
  throw new Error("Missing isolated clipboard fixture arguments.");
const user = koffi.load("user32.dll"),
  station = user.func("void * __stdcall GetProcessWindowStation(void)"),
  information = user.func(
    "int __stdcall GetUserObjectInformationW(void *handle, int index, _Out_ void *buffer, uint32_t length, _Out_ uint32_t *needed)",
  );
function assertPrivateStation(): void {
  const name = Buffer.alloc(2048),
    needed = [0];
  assert.notEqual(information(station(), 2, name, name.length, needed), 0);
  assert.equal(
    name.toString("utf16le").split("\0")[0],
    expectedStation,
    "Refusing to access the user's clipboard outside the private window station.",
  );
}
// Verify isolation before app initialization and again before every OS clipboard transaction.
assertPrivateStation();
app.setPath("userData", join(root, "profile"));
app
  .whenReady()
  .then(async () => {
    const window = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    assertPrivateStation();
    await clipboard.writeText("ISOLATED_SENTINEL");
    const annotations = [
      {
        id: "a",
        page: "p",
        kind: "note",
        x: 20,
        y: 40,
        text: "Olá β",
        color: "#ffaa00",
        group: "g",
      },
    ];
    assertPrivateStation();
    await writeAnnotationClipboard({ version: 1, annotations });
    assert.equal(await clipboard.readText(), "Olá β");
    assert.equal(await clipboard.has(ANNOTATION_CLIPBOARD_MIME), true);
    assert.deepEqual(await readEditorClipboard(), { kind: "annotations", annotations });
    assertPrivateStation();
    await assert.rejects(writeAnnotationClipboard({ version: 2, annotations }));
    assert.equal(
      await clipboard.readText(),
      "Olá β",
      "Rejected copies leave the OS clipboard intact.",
    );
    assertPrivateStation();
    await clipboard.write([
      new ClipboardItem({
        [ANNOTATION_CLIPBOARD_MIME]: new Blob([JSON.stringify({ version: 2, annotations })], {
          type: "application/json",
        }),
        "text/plain": "MUST_NOT_FALL_BACK",
      }),
    ]);
    await assert.rejects(
      readEditorClipboard(),
      "A malformed EdiPDF envelope must not paste stale annotations or silently fall back.",
    );
    assertPrivateStation();
    await clipboard.writeText("<b>Literal</b>\n=SUM(A1) β");
    assert.deepEqual(await readEditorClipboard(), {
      kind: "text",
      text: "<b>Literal</b>\n=SUM(A1) β",
    });
    const png = new Uint8Array(await readFile(join(root, "image.png")));
    assertPrivateStation();
    await clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([png], { type: "image/png" }),
        "text/plain": "IMAGE_HAS_PRIORITY",
      }),
    ]);
    const image = await readEditorClipboard();
    assert.equal(image.kind, "image");
    if (image.kind !== "image") throw new Error("Missing pasted PNG.");
    // The OS may re-encode a PNG; compare actual decoded pixels rather than encoded bytes.
    const originalImage = nativeImage.createFromBuffer(Buffer.from(png)),
      pastedImage = nativeImage.createFromBuffer(Buffer.from(image.bytes));
    assert.deepEqual(pastedImage.getSize(), originalImage.getSize());
    assert.deepEqual(pastedImage.toBitmap(), originalImage.toBitmap());
    await writeFile(join(root, "clipboard-image.png"), image.bytes);
    assertPrivateStation();
    clipboard.clear();
    assert.deepEqual(await readEditorClipboard(), { kind: "empty" });
    await writeFile(
      report,
      JSON.stringify({
        station: expectedStation,
        editableAnnotations: true,
        unicodePlainText: true,
        malformedRefusal: true,
        rejectedCopyPreserved: true,
        png: true,
        empty: true,
        electron: process.versions.electron,
      }),
    );
    window.destroy();
    app.quit();
  })
  .catch(async (failure: unknown) => {
    await writeFile(
      report,
      JSON.stringify({ error: failure instanceof Error ? failure.stack : String(failure) }),
    );
    app.exit(1);
  });
