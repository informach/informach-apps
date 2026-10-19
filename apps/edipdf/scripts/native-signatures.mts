import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { degrees, PDFDocument } from "pdf-lib";
import type { Page } from "playwright";
import { takeEditableAnnotations } from "../src/shared/pdf-annotations.ts";
import type { EdiPdfApi } from "../src/shared/types.ts";

declare const window: Window & { api: EdiPdfApi };

export async function createSignatureFixture(directory: string): Promise<void> {
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 500]).drawText("SIGNATURE_SOURCE", { x: 40, y: 400 });
  pdf.addPage([400, 500]).setRotation(degrees(90));
  const field = pdf.getForm().createTextField("signature_preserved");
  field.setText("UNCHANGED");
  field.addToPage(pdf.getPage(0), { x: 40, y: 100, width: 160, height: 20 });
  await writeFile(join(directory, "signature-editor.pdf"), await pdf.save());
  const require = createRequire(import.meta.url),
    canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json")),
    { createCanvas } = canvasRequire("@napi-rs/canvas");
  const canvas = createCanvas(400, 120),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 400, 120);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(30, 35, 220, 30);
  ctx.fillStyle = "#ffff00";
  ctx.fillRect(360, 40, 20, 20);
  await writeFile(join(directory, "signature-image.png"), canvas.toBuffer("image/png"));
}

export async function verifyNativeSignatures(options: {
  editor: Page;
  directory: string;
  outputDirectory: string;
  resultsDirectory: string;
  command(text: string): Promise<void>;
  respond(action: "Open" | "Save", path: string): Promise<Error | null>;
}): Promise<void> {
  const { editor, directory, outputDirectory, resultsDirectory, command, respond } = options;
  const sourcePath = join(directory, "signature-editor.pdf"),
    before = await readFile(sourcePath);
  let response = respond("Open", sourcePath);
  await editor.keyboard.press("Control+o");
  const opened = await response;
  if (opened) throw opened;
  await editor.locator(".tab-name").filter({ hasText: "signature-editor.pdf" }).waitFor();
  await command("Inserir assinatura gráfica");
  const dialog = editor.getByRole("dialog", { name: "Assinar", exact: true });
  await dialog.getByRole("button", { name: "Imagem", exact: true }).click();
  response = respond("Open", join(directory, "signature-image.png"));
  await dialog.getByRole("button", { name: "Escolher imagem", exact: true }).click();
  const picked = await response;
  if (picked) throw picked;
  const preview = dialog.getByRole("img", {
    name: "Prévia da assinatura com a limpeza e o recorte aplicados",
    exact: true,
  });
  await preview.waitFor();
  const stats = () =>
    preview.evaluate(async (element) => {
      if (!(element instanceof HTMLImageElement)) throw new Error("Missing signature preview");
      await element.decode();
      const canvas = document.createElement("canvas");
      canvas.width = element.naturalWidth;
      canvas.height = element.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Missing fixture canvas");
      ctx.drawImage(element, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let yellow = 0,
        blue = 0,
        transparent = 0;
      for (let i = 0; i < data.length; i += 4) {
        const red = data[i],
          green = data[i + 1],
          blueChannel = data[i + 2];
        if (red === undefined || green === undefined || blueChannel === undefined)
          throw new Error("Incomplete fixture pixel");
        if (!data[i + 3]) transparent++;
        else if (red > 240 && green > 240 && blueChannel < 10) yellow++;
        else if (red < 10 && green < 10 && blueChannel > 240) blue++;
      }
      return { yellow, blue, transparent, width: canvas.width };
    });
  const original = await stats();
  assert.ok(original.yellow > 0 && original.blue > 0 && original.transparent > 0);
  await dialog.getByLabel("Recorte direita (%)", { exact: true }).fill("35");
  await dialog
    .getByRole("button", { name: "Usar assinatura", exact: true })
    .waitFor({ state: "visible" });
  await editor.waitForFunction(() => {
    const button = [...document.querySelectorAll(".modal-foot button")].find(
      (item) => item.textContent?.trim() === "Usar assinatura",
    );
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  const cropped = await stats();
  assert.equal(cropped.yellow, 0);
  assert.ok(cropped.blue > 0 && cropped.width < original.width);
  await dialog.getByLabel("Girar antes de inserir", { exact: true }).selectOption("90");
  await dialog
    .getByRole("checkbox", { name: "Incluir a data atual junto da assinatura", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Escolher posição na página", exact: true }).click();
  await dialog.getByLabel("Largura da assinatura (pt)", { exact: true }).fill("120");
  const picker = dialog.getByRole("button", {
    name: "Escolher o centro da assinatura na página",
    exact: true,
  });
  await picker.waitFor();
  const box = await picker.boundingBox();
  assert.ok(box);
  await picker.click({ position: { x: box.width * 0.9, y: box.height * 0.9 } });
  await picker.press("Shift+ArrowUp");
  await editor.screenshot({
    path: join(resultsDirectory, "edipdf-signature-position.png"),
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Usar assinatura", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal((await editor.evaluate(() => window.api.signatures.list())).length, 0);
  const savedPath = join(outputDirectory, "edipdf-signature.pdf");
  response = respond("Save", savedPath);
  await editor.keyboard.press("Control+Shift+s");
  const saved = await response;
  if (saved) throw saved;
  await editor.locator(".tab-name").filter({ hasText: "edipdf-signature.pdf" }).waitFor();
  await editor.locator(".busy").waitFor({ state: "hidden" });
  const pdf = await PDFDocument.load(await readFile(savedPath));
  assert.equal(pdf.getForm().getTextField("signature_preserved").getText(), "UNCHANGED");
  assert.deepEqual(
    pdf.getPages().map((page) => page.getRotation().angle),
    [0, 90],
  );
  const annots = takeEditableAnnotations(pdf).get(0) ?? [],
    image = annots.find((annot) => annot.kind === "image"),
    date = annots.find((annot) => annot.kind === "text");
  assert.ok(image?.kind === "image" && date?.kind === "text");
  assert.ok(image.x >= 4 && image.y >= 4 && image.x + image.w <= 396 && image.y + image.h <= 496);
  assert.ok(image.h > image.w && date.y > image.y + image.h && date.y + date.size <= 496);
  assert.equal(image.group, date.group);
  assert.deepEqual(await readFile(sourcePath), before);
  await editor.screenshot({
    path: join(resultsDirectory, "edipdf-signature-applied.png"),
    animations: "disabled",
  });
  await editor
    .getByRole("group", { name: "edipdf-signature.pdf", exact: true })
    .getByTitle("Fechar (Ctrl+W)", { exact: true })
    .click();
  await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
  console.log(
    "Verified native signature white removal preserves colored strokes, actual crop pixels, rotation, precise mouse/keyboard placement, bounded date, saved graphical annotations, opt-in privacy and original field/source preservation",
  );
}
