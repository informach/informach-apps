import assert from "node:assert/strict";
import { test } from "node:test";
import { describeScanner, listScanners } from "../src/main/scanner.ts";
import { scannerSettingsSchema } from "../src/shared/scanner-format.ts";

test("real WIA enumeration returns scanner identities or reports OS unavailability explicitly", {
  skip: process.platform !== "win32",
}, async () => {
  try {
    const scanners = await listScanners(new AbortController().signal);
    assert.ok(scanners.length <= 128);
    assert.equal(new Set(scanners.map((scanner) => scanner.id)).size, scanners.length);
    assert.ok(scanners.every((scanner) => scanner.id.length && scanner.name.length));
  } catch (error) {
    assert.ok(error instanceof Error);
    // Missing COM registration is an explicit unavailable state, never an empty fake list.
    assert.match(error.message, /WIA não está disponível/);
  }
});
test("WIA device IDs remain data on stdin and cannot become PowerShell code", {
  skip: process.platform !== "win32",
}, async () => {
  await assert.rejects(
    describeScanner("'; throw 'EDIPDF_INJECTED'; #", new AbortController().signal),
    /escolhido foi desconectado|WIA não está disponível/,
  );
});
test("an already cancelled scanner operation starts no OS acquisition", async () => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(listScanners(abort.signal), { name: "AbortError" });
  assert.equal(
    scannerSettingsSchema.safeParse({
      deviceId: "scanner",
      sourceId: "1",
      dpi: 2400,
      color: "color",
      paper: "a4",
      maximumPages: 1,
    }).success,
    false,
  );
});
