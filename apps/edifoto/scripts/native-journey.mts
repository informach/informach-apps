import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ElectronApplication, Page } from "playwright";
import { z } from "zod";
import { windowsPowerShellEnvironment } from "../../../packages/edi-desktop/src/windows-powershell.ts";
import { decodeArchive } from "../src/shared/documentFormat.ts";

const execute = promisify(execFile);
export async function verifyFotoNativeJourney(
  editor: Page,
  application: ElectronApplication,
  root: string,
  results: string,
): Promise<void> {
  editor.setDefaultTimeout(15000);
  const preferences: unknown = await editor.evaluate(async () => {
    const bridge: unknown = Reflect.get(window, "api");
    if (
      !bridge ||
      typeof bridge !== "object" ||
      !("saveAiSettings" in bridge) ||
      !("aiSettings" in bridge)
    )
      throw new Error("Missing AI preferences bridge");
    const save = bridge.saveAiSettings,
      read = bridge.aiSettings;
    if (typeof save !== "function" || typeof read !== "function")
      throw new Error("Invalid preferences bridge");
    try {
      await Promise.all([
        Reflect.apply(save, bridge, [{ confirmDeletes: false }]),
        Reflect.apply(save, bridge, [{ allowFileWrites: true }]),
      ]);
      const result: unknown = await Reflect.apply(read, bridge, []);
      return result;
    } finally {
      await Reflect.apply(save, bridge, [{ confirmDeletes: true, allowFileWrites: false }]);
    }
  });
  const verified = z
    .object({ confirmDeletes: z.boolean(), allowFileWrites: z.boolean() })
    .parse(preferences);
  assert.equal(verified.confirmDeletes, false);
  assert.equal(verified.allowFileWrites, true);
  console.log("Verified concurrent personal AI settings preserve independent choices");

  console.log("EdiFoto native: create, save and cancel");
  const pid = await application.evaluate(() => process.pid),
    destination = join(root, "edifoto-test-project.edifoto"),
    output = join(root, "edifoto-test-export.png");
  const respond = (action: "Save" | "Open" | "Cancel", path = destination) =>
    execute(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-File",
        resolve("apps/edifoto/scripts/respond-native-file.ps1"),
        "-TestProcessId",
        String(pid),
        "-Action",
        action,
        "-SelectedPath",
        path,
      ],
      { windowsHide: true, timeout: 30000, maxBuffer: 32768, env: windowsPowerShellEnvironment() },
    );
  const menu = async (name: string) => {
    await editor.getByRole("button", { name: "Arquivo", exact: true }).click();
    await editor.getByRole("button", { name, exact: true }).click();
  };
  await editor.locator(".template-card").first().click();
  await editor.locator(".viewport").waitFor();
  await editor.getByRole("button", { name: "Propriedades", exact: true }).click();
  // Template description is selected initially; content remains editable in the native renderer.
  const text = editor.locator(".rpanel textarea");
  await text.fill("Texto nativo salvo");
  await text.blur();
  const saving = respond("Save");
  await editor.keyboard.press("Control+s");
  await saving;
  await editor.waitForFunction(() => !document.title.startsWith("•"));
  const bytes = await readFile(destination),
    doc = decodeArchive(bytes).doc;
  assert.equal(
    doc.layers
      .filter((layer) => layer.kind === "text")
      .some((layer) => layer.kind === "text" && layer.text.content === "Texto nativo salvo"),
    true,
  );
  await text.fill("Rascunho nativo recuperável");
  await text.blur();
  const cancelling = respond("Cancel");
  await editor.keyboard.press("Control+Shift+s");
  await cancelling;
  assert.deepEqual(await readFile(destination), bytes);
  assert.equal(await text.inputValue(), "Rascunho nativo recuperável");
  await editor.waitForFunction(
    async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("edifoto-recovery", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<boolean>((resolve, reject) => {
          const request = database.transaction("drafts").objectStore("drafts").get("latest");
          request.onsuccess = () =>
            resolve(
              new TextDecoder()
                .decode(request.result?.bytes)
                .includes("Rascunho nativo recuperável"),
            );
          request.onerror = () => reject(request.error);
        });
      } finally {
        database.close();
      }
    },
    null,
    { timeout: 15000 },
  );
  console.log("EdiFoto native: restore durable draft and export");
  await editor.reload();
  await editor.getByRole("button", { name: "Recuperar trabalho", exact: true }).click();
  await editor.locator(".viewport").waitFor();
  await editor.getByRole("button", { name: "Propriedades", exact: true }).click();
  assert.equal(await text.inputValue(), "Rascunho nativo recuperável");
  assert.deepEqual(await readFile(destination), bytes);
  await editor.keyboard.press("Control+Shift+e");
  const exportDialog = editor.getByRole("dialog", { name: "Exportar imagem", exact: true });
  await exportDialog.locator(".export-preview img").waitFor();
  const exporting = respond("Save", output);
  await exportDialog.getByRole("button", { name: "Exportar…", exact: true }).click();
  await exporting;
  await exportDialog.waitFor({ state: "detached" });
  const png = await readFile(output);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1920);
  assert.equal(png.readUInt32BE(20), 1080);
  console.log("EdiFoto native: open saved original");
  const opening = respond("Open");
  await editor.keyboard.press("Control+o");
  await opening;
  const discard = editor.getByRole("dialog", { name: "Descartar alterações?", exact: true });
  await discard.getByRole("button", { name: "Descartar", exact: true }).click();
  await editor.waitForFunction(() => !document.title.startsWith("•"));
  await editor.getByRole("button", { name: "Propriedades", exact: true }).click();
  assert.equal(await text.inputValue(), "Texto nativo salvo");
  await editor.screenshot({ path: join(results, "edifoto-native-project.png") });
  await menu("Fechar imagem");
  await editor.locator(".home").waitFor();
  console.log(
    "Verified EdiFoto native Save/Open, canceled Save As, detached durable recovery and PNG export with original preserved",
  );
}
