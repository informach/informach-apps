import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { degrees, PDFDocument } from "pdf-lib";
import type { Page } from "playwright";
import { standardFontDataUrl } from "./pdfjs-fixture.mts";

export async function createDecorationsFixture(directory: string): Promise<void> {
  const pdf = await PDFDocument.create();
  for (const [index, rotation] of [0, 90, 180, 270].entries()) {
    const page = pdf.addPage([400, 500]);
    page.setCropBox(20, 40, 360, 420);
    page.setRotation(degrees(rotation));
    page.drawText(`DECORATION_BODY_${index + 1}`, { x: 60, y: 200, size: 12 });
  }
  const field = pdf.getForm().createTextField("decoration_preserved");
  field.setText("PRESERVED_FIELD");
  field.addToPage(pdf.getPage(1), { x: 60, y: 100, width: 180, height: 20 });
  await writeFile(join(directory, "decorations.pdf"), await pdf.save());
}

export async function verifyNativeDecorations(options: {
  editor: Page;
  directory: string;
  outputDirectory: string;
  resultsDirectory: string;
  command(text: string): Promise<void>;
  respond(action: "Open" | "Save", path: string): Promise<Error | null>;
}): Promise<void> {
  const { editor, directory, outputDirectory, resultsDirectory, command, respond } = options;
  const sourcePath = join(directory, "decorations.pdf"),
    sourceBytes = await readFile(sourcePath);
  let response = respond("Open", sourcePath);
  await editor.keyboard.press("Control+o");
  const opened = await response;
  if (opened) throw opened;
  await editor.locator(".tab-name").filter({ hasText: "decorations.pdf" }).waitFor();
  await command("Adicionar marca");
  let watermark = editor.getByRole("dialog", { name: "Marca d'água", exact: true });
  await watermark.getByLabel("Texto da marca d'água", { exact: true }).fill("CANCELED_PREPARATION");
  // Submit and close in the same DOM task: a pending preparation must never commit partial output.
  await watermark.evaluate((dialog) => {
    const form = dialog.querySelector("form"),
      close = dialog.querySelector(".modal-head button");
    if (
      !(form instanceof HTMLFormElement) ||
      !(close instanceof HTMLButtonElement) ||
      !form.checkValidity()
    )
      throw new Error("Invalid owned decoration preparation fixture");
    form.requestSubmit();
    close.click();
  });
  await watermark.waitFor({ state: "detached" });
  assert.equal(await editor.locator(".page-watermark").count(), 0);
  await command("Adicionar marca");
  watermark = editor.getByRole("dialog", { name: "Marca d'água", exact: true });
  await watermark.getByLabel("Texto da marca d'água", { exact: true }).fill("MARCA_α_ESCOPADA");
  await watermark.getByLabel("Tamanho da marca (pt)", { exact: true }).fill("28");
  await watermark.getByLabel("Posição da marca", { exact: true }).selectOption("bottom-left");
  await watermark.getByLabel("Margem horizontal (pt)", { exact: true }).fill("12.5");
  await watermark.getByLabel("Margem vertical (pt)", { exact: true }).fill("15.25");
  await watermark.getByLabel("Aplicar em", { exact: true }).selectOption("ranges");
  await watermark.getByLabel("Páginas do intervalo", { exact: true }).fill("2-4");
  await watermark.getByLabel("Exceto páginas", { exact: true }).fill("2-4");
  await watermark.getByRole("button", { name: "Atualizar prévia", exact: true }).click();
  await watermark.getByRole("alert").filter({ hasText: "não deixam páginas" }).waitFor();
  assert.equal(
    await watermark.getByRole("button", { name: "Aplicar", exact: true }).isDisabled(),
    true,
  );
  await watermark.getByLabel("Exceto páginas", { exact: true }).fill("3");
  await watermark.getByRole("button", { name: "Atualizar prévia", exact: true }).click();
  await watermark
    .getByRole("img", { name: "Prévia real de marcas e cabeçalhos, página 1", exact: true })
    .waitFor();
  await watermark.getByLabel("Página da prévia", { exact: true }).fill("2");
  await watermark
    .getByRole("img", { name: "Prévia real de marcas e cabeçalhos, página 2", exact: true })
    .waitFor();
  await watermark.getByLabel("Texto da marca d'água", { exact: true }).fill("MARCA_α_REVISADA");
  assert.equal(
    await watermark.getByRole("button", { name: "Aplicar", exact: true }).isDisabled(),
    true,
  );
  await watermark.getByRole("button", { name: "Atualizar prévia", exact: true }).click();
  await watermark
    .getByRole("img", { name: "Prévia real de marcas e cabeçalhos, página 2", exact: true })
    .waitFor();
  await editor.screenshot({
    path: join(resultsDirectory, "edipdf-decoration-watermark-preview.png"),
    animations: "disabled",
  });
  await watermark.getByRole("button", { name: "Aplicar", exact: true }).click();
  await watermark.waitFor({ state: "detached" });
  assert.equal(await editor.locator(".page.current .page-watermark").count(), 0);
  await editor.getByRole("textbox", { name: "Página", exact: true }).fill("2");
  await editor.getByRole("textbox", { name: "Página", exact: true }).press("Enter");
  await editor.waitForFunction(
    () =>
      document.querySelector(".page.current .page-watermark")?.textContent === "MARCA_α_REVISADA",
  );
  await command("Numerar páginas");
  const numbering = editor.getByRole("dialog", { name: "Numerar páginas", exact: true });
  await numbering.getByLabel("Formato do cabeçalho ou rodapé", { exact: true }).fill("DOC-{n}");
  await numbering.getByLabel("Posição principal", { exact: true }).selectOption("bottom-right");
  await numbering.getByLabel("Mínimo de dígitos", { exact: true }).fill("4");
  await numbering.getByLabel("Contagem", { exact: true }).selectOption("applied");
  await numbering.getByLabel("Não aplicar na capa (primeira página)", { exact: true }).check();
  await numbering.getByLabel("Exceto páginas", { exact: true }).fill("3");
  await numbering.getByLabel("Margem horizontal (pt)", { exact: true }).fill("12.5");
  await numbering.getByLabel("Margem vertical (pt)", { exact: true }).fill("15.25");
  await numbering
    .getByRole("button", { name: "Adicionar cabeçalho ou rodapé", exact: true })
    .click();
  await numbering.getByLabel("Texto adicional 1", { exact: true }).fill("REV_α {page}/{pages}");
  await numbering
    .getByLabel("Usar a sequência como rótulo de navegação no PDF", { exact: true })
    .check();
  await numbering.getByRole("button", { name: "Atualizar prévia", exact: true }).click();
  await numbering
    .getByRole("img", { name: "Prévia real de marcas e cabeçalhos, página 2", exact: true })
    .waitFor();
  await editor.screenshot({
    path: join(resultsDirectory, "edipdf-decoration-numbering-preview.png"),
    animations: "disabled",
  });
  await numbering.getByRole("button", { name: "Aplicar", exact: true }).click();
  await numbering.waitFor({ state: "detached" });
  const waitNumber = () =>
    editor.waitForFunction(
      () => document.querySelector(".page.current .page-number")?.textContent === "DOC-0001",
    );
  await waitNumber();
  await editor.keyboard.press("Control+z");
  await editor.waitForFunction(() => !document.querySelector(".page.current .page-number"));
  await editor.waitForFunction(
    () =>
      document.querySelector(".page.current .page-watermark")?.textContent === "MARCA_α_REVISADA",
  );
  await editor.keyboard.press("Control+y");
  await waitNumber();
  const savedPath = join(outputDirectory, "edipdf-decorations.pdf");
  response = respond("Save", savedPath);
  await editor.keyboard.press("Control+Shift+s");
  const saved = await response;
  if (saved) throw saved;
  await editor.locator(".tab-name").filter({ hasText: "edipdf-decorations.pdf" }).waitFor();
  await editor.locator(".busy").waitFor({ state: "hidden" });
  const savedBytes = await readFile(savedPath),
    pdf = await PDFDocument.load(savedBytes);
  assert.equal(pdf.getForm().getTextField("decoration_preserved").getText(), "PRESERVED_FIELD");
  assert.deepEqual(
    pdf.getPages().map((page) => page.getRotation().angle),
    [0, 90, 180, 270],
  );
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(savedBytes),
    standardFontDataUrl,
  });
  try {
    const reader = await task.promise;
    assert.deepEqual(await reader.getPageLabels(), ["1", "DOC-0001", "3", "DOC-0002"]);
    for (let index = 0; index < 4; index++) {
      const text = await (await reader.getPage(index + 1)).getTextContent();
      const value = text.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      assert.match(value, new RegExp(`DECORATION_BODY_${index + 1}`));
      if (index === 1 || index === 3) {
        assert.match(value, /MARCA_α_REVISADA/);
        assert.match(value, new RegExp(`DOC-000${index === 1 ? 1 : 2}`));
        assert.match(value, new RegExp(`REV_α ${index + 1}/4`));
      } else assert.doesNotMatch(value, /MARCA_|DOC-|REV_α|CANCELED_/);
    }
  } finally {
    await task.destroy();
  }
  assert.deepEqual(await readFile(sourcePath), sourceBytes);
  await editor
    .getByRole("group", { name: "edipdf-decorations.pdf", exact: true })
    .getByTitle("Fechar (Ctrl+W)", { exact: true })
    .click();
  const reopenedPath = join(directory, "decorations-reopen.pdf");
  await writeFile(reopenedPath, savedBytes);
  response = respond("Open", reopenedPath);
  await editor.keyboard.press("Control+o");
  const reopened = await response;
  if (reopened) throw reopened;
  await editor.locator(".tab-name").filter({ hasText: "decorations-reopen.pdf" }).waitFor();
  await editor.getByRole("textbox", { name: "Página", exact: true }).fill("2");
  await editor.getByRole("textbox", { name: "Página", exact: true }).press("Enter");
  await editor.waitForFunction(() => {
    const text = document.querySelector(".page.current .textLayer")?.textContent ?? "";
    return text.includes("MARCA_α_REVISADA") && text.includes("DOC-0001");
  });
  const rotatedField = editor
    .locator(".page.current")
    .getByRole("textbox", { name: "decoration_preserved", exact: true });
  await rotatedField.waitFor();
  assert.equal(await rotatedField.inputValue(), "PRESERVED_FIELD");
  const geometry = await rotatedField.evaluate((element) => {
    const style = getComputedStyle(element),
      matrix = new DOMMatrixReadOnly(style.transform),
      rect = element.getBoundingClientRect();
    return {
      a: matrix.a,
      b: matrix.b,
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      visualWidth: rect.width,
      visualHeight: rect.height,
      fontSize: parseFloat(style.fontSize),
    };
  });
  assert.ok(Math.abs(geometry.a) < 1e-8 && Math.abs(geometry.b - 1) < 1e-8);
  assert.ok(geometry.width > geometry.height && geometry.visualHeight > geometry.visualWidth);
  assert.ok(geometry.fontSize > 0 && geometry.fontSize <= geometry.height);
  await editor.screenshot({
    path: join(resultsDirectory, "edipdf-decorations-reopened.png"),
    animations: "disabled",
  });
  await editor
    .getByRole("group", { name: "decorations-reopen.pdf", exact: true })
    .getByTitle("Fechar (Ctrl+W)", { exact: true })
    .click();
  await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
  console.log(
    "Verified native real page previews/cancellation/invalidation, scoped watermark, cover/exceptions, Bates numbering, header, fractional margins, navigation labels, undo/redo, field/source preservation and saved/reopened rotated content",
  );
}
