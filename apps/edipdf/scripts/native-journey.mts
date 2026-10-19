import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  StandardFonts,
} from "pdf-lib";
import { _electron, type ElectronApplication, type Locator, type Page } from "playwright";
import {
  observeNativeStartup,
  sanitizeNativeDiagnostic,
} from "../../../scripts/edi/native-diagnostics.mts";
import { readBatchArchive } from "../src/shared/batch-archive.ts";
import { batchDetailSchema } from "../src/shared/batch-format.ts";
import { pageWidgetTabOrder } from "../src/shared/form-tab-order.ts";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import { exportDocx } from "../src/shared/office-export.ts";
import { officeDocumentSchema } from "../src/shared/office-format.ts";
import { importXlsx } from "../src/shared/office-import.ts";
import { officePart, readOfficePackage } from "../src/shared/office-package.ts";
import { importRtf } from "../src/shared/office-rtf.ts";
import { parseOfficeXml } from "../src/shared/office-xml.ts";
import { importOds } from "../src/shared/open-document/spreadsheet.ts";
import { importOdt } from "../src/shared/open-document/text.ts";
import { takeEditableAnnotations } from "../src/shared/pdf-annotations.ts";
import { addBookmark } from "../src/shared/pdf-navigation.ts";
import { importOdp } from "../src/shared/presentation/odp-import.ts";
import { importPptx } from "../src/shared/presentation/pptx-import.ts";
import { tableEvidenceSchema } from "../src/shared/table-format.ts";
import { inspectTiff } from "../src/shared/tiff-format.ts";
import type { EdiPdfApi } from "../src/shared/types.ts";
import { createDecorationsFixture, verifyNativeDecorations } from "./native-decorations.mts";
import { closePdfNativeFixture, verifyForcedPdfRestarts } from "./native-process.mts";
import { createSignatureFixture, verifyNativeSignatures } from "./native-signatures.mts";
import { standardFontDataUrl } from "./pdfjs-fixture.mts";

declare const window: Window & { api: EdiPdfApi };
type SeedLease = (application: ElectronApplication, ttl: number) => Promise<void>;
async function dragFixturePointer(
  editor: Page,
  target: Locator,
  dx: number,
  dy: number,
  cancel: "pointer" | "pointer-target" | "blur" | false = false,
): Promise<void> {
  await target.evaluate((element) =>
    element.addEventListener(
      "pointerdown",
      (event) => {
        if (!(event instanceof PointerEvent)) throw new Error("Missing fixture pointer event.");
        element.setAttribute("data-fixture-pointer", String(event.pointerId));
      },
      { once: true },
    ),
  );
  const box = await target.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const hit = await target.evaluate(
    (element, point) => {
      const top = document.elementFromPoint(point.x, point.y);
      return {
        accepted: top === element || (!!top && element.contains(top)),
        target: top?.tagName,
        pointerEvents: getComputedStyle(element).pointerEvents,
      };
    },
    { x, y },
  );
  assert.equal(
    hit.accepted,
    true,
    `The fixture pointer must hit the real control: ${JSON.stringify(hit)}`,
  );
  await editor.mouse.move(x, y);
  await editor.mouse.down();
  const pointer = await target.evaluate((element) => {
    const id = element.getAttribute("data-fixture-pointer");
    element.removeAttribute("data-fixture-pointer");
    return id;
  });
  assert.ok(pointer && /^\d+$/.test(pointer));
  await editor.mouse.move(x + dx, y + dy, { steps: 4 });
  if (cancel === "pointer")
    await editor.locator("body").dispatchEvent("pointercancel", {
      pointerId: Number(pointer),
      pointerType: "mouse",
      isPrimary: true,
      bubbles: true,
    });
  if (cancel === "pointer-target")
    await target.dispatchEvent("pointercancel", {
      pointerId: Number(pointer),
      pointerType: "mouse",
      isPrimary: true,
      bubbles: true,
    });
  if (cancel === "blur") await editor.evaluate(() => window.dispatchEvent(new Event("blur")));
  await editor.mouse.up();
}
async function verifyModalFocus(dialog: Locator): Promise<void> {
  const buttons = dialog.getByRole("button"),
    first = buttons.first(),
    last = buttons.last();
  await last.focus();
  await last.press("Tab");
  assert.equal(await first.evaluate((element) => element === document.activeElement), true);
  await first.press("Shift+Tab");
  assert.equal(await last.evaluate((element) => element === document.activeElement), true);
}
async function fixtureFocusState(editor: Page): Promise<unknown> {
  return editor.evaluate(() => ({
    documentFocused: document.hasFocus(),
    modalOpen: !!document.querySelector("dialog[open]"),
    active: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName,
    trace: JSON.parse(document.documentElement.getAttribute("data-fixture-focus-trace") ?? "[]"),
    fields: Array.from(document.querySelectorAll<HTMLInputElement>(".form-layer input")).map(
      (field) => ({
        name: field.getAttribute("aria-label"),
        disabled: field.disabled,
        tabIndex: field.tabIndex,
        visibility: getComputedStyle(field).visibility,
        font: getComputedStyle(field).fontFamily,
      }),
    ),
  }));
}
async function waitBatchPreview(editor: Page, dialog: Locator, name: string): Promise<void> {
  const image = dialog.getByRole("img", { name, exact: true }),
    alert = dialog.getByRole("alert").first();
  try {
    await image.or(alert).first().waitFor();
    if (await alert.isVisible())
      throw new Error(`Batch preparation failed: ${await alert.innerText()}`);
  } catch (failure) {
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-lote4-batch-failure.png"),
      animations: "disabled",
    });
    console.log("Owned batch dialog diagnostic:", await dialog.innerText());
    throw failure;
  }
}
export async function createPdfNativeFixture(directory: string): Promise<string> {
  await createDecorationsFixture(directory);
  await createSignatureFixture(directory);
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]).drawText("ORIGINAL_CONFIDENCIAL", { x: 50, y: 700, size: 20 });
  doc.addPage([600, 800]).drawText("SEGUNDA_PAGINA", { x: 50, y: 700, size: 20 });
  const require = createRequire(import.meta.url);
  const canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json"));
  const { createCanvas, GlobalFonts } = canvasRequire("@napi-rs/canvas");
  GlobalFonts.registerFromPath(
    fileURLToPath(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url)),
    "PdfOcrFixture",
  );
  const scan = createCanvas(1200, 300),
    context = scan.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, 1200, 300);
  context.fillStyle = "black";
  context.font = "60px PdfOcrFixture";
  context.fillText("EDIPDF DIGITALIZADO TESTE", 30, 140);
  const image = await doc.embedPng(scan.toBuffer("image/png"));
  doc.getPage(1).drawImage(image, { x: 50, y: 300, width: 400, height: 100 });
  const photograph = createCanvas(1600, 900),
    photoContext = photograph.getContext("2d"),
    photoData = photoContext.createImageData(1600, 900);
  let random = 12345;
  for (let i = 0; i < photoData.data.length; i += 4) {
    random = (1664525 * random + 1013904223) >>> 0;
    photoData.data[i] = random & 255;
    photoData.data[i + 1] = (random >>> 8) & 255;
    photoData.data[i + 2] = (random >>> 16) & 255;
    photoData.data[i + 3] = 255;
  }
  photoContext.putImageData(photoData, 0, 0);
  const photo = await doc.embedPng(photograph.toBuffer("image/png"));
  doc.getPage(1).drawImage(photo, { x: 50, y: 80, width: 200, height: 112.5 });
  const field = doc.getForm().createTextField("nome");
  field.setText("Inicial");
  field.addToPage(doc.getPage(0), { x: 50, y: 600, width: 200, height: 25 });
  doc.getPage(0).node.addAnnot(
    doc.context.register(
      doc.context.obj({
        Type: "Annot",
        Subtype: "Text",
        Rect: [400, 700, 420, 720],
        Contents: PDFString.of("COMENTARIO_EXISTENTE"),
      }),
    ),
  );
  const path = join(directory, "audit.pdf");
  await writeFile(path, await doc.save());
  const many = await PDFDocument.create();
  for (let index = 0; index < 100; index++)
    many.addPage([72, 72]).drawText(`PAGINA ${index + 1}`, { x: 8, y: 36, size: 8 });
  await writeFile(join(directory, "batch-many.pdf"), await many.save());
  const fontDocument = await PDFDocument.create();
  fontDocument.addPage([300, 200]).drawText("FONT_ORIGINAL", { x: 20, y: 150, size: 16 });
  const fontField = fontDocument.getForm().createTextField("font_preserved");
  fontField.setText("PRESERVADO");
  fontField.addToPage(fontDocument.getPage(0), { x: 20, y: 50, width: 160, height: 20 });
  await writeFile(join(directory, "font-editor.pdf"), await fontDocument.save());
  const groupSource = await PDFDocument.create();
  groupSource.addPage([200, 100]).drawText("ORIGINAL_CHILD", { x: 10, y: 60, size: 14 });
  const groupDocument = await PDFDocument.create(),
    [groupForm] = await groupDocument.embedPdf(await groupSource.save(), [0]);
  assert.ok(groupForm);
  const groupPage = groupDocument.addPage([600, 800]);
  groupPage.drawPage(groupForm, { x: 30, y: 500, width: 200, height: 100 });
  groupPage.drawPage(groupForm, { x: 300, y: 500, width: 200, height: 100 });
  groupDocument.addPage([600, 800]).drawPage(groupForm, { x: 30, y: 500, width: 200, height: 100 });
  const groupField = groupDocument.getForm().createTextField("group_preserved");
  groupField.setText("PRESERVADO");
  groupField.addToPage(groupPage, { x: 30, y: 700, width: 160, height: 25 });
  await writeFile(join(directory, "group-editor.pdf"), await groupDocument.save());
  const paragraphDocument = await PDFDocument.create();
  paragraphDocument.addPage([600, 800]).drawText("PARAGRAPH_SOURCE", { x: 30, y: 750, size: 16 });
  const paragraphImageCanvas = createCanvas(8, 6),
    paragraphImageContext = paragraphImageCanvas.getContext("2d"),
    paragraphImageData = paragraphImageContext.createImageData(8, 6);
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 8; x++)
      paragraphImageData.data.set([x * 30, y * 40, 100, 255], (y * 8 + x) * 4);
  paragraphImageContext.putImageData(paragraphImageData, 0, 0);
  paragraphDocument
    .getPage(0)
    .drawImage(await paragraphDocument.embedPng(paragraphImageCanvas.toBuffer("image/png")), {
      x: 400,
      y: 450,
      width: 160,
      height: 120,
    });
  const paragraphField = paragraphDocument.getForm().createTextField("paragraph_preserved");
  paragraphField.setText("PRESERVADO");
  paragraphField.addToPage(paragraphDocument.getPage(0), { x: 30, y: 30, width: 160, height: 20 });
  await writeFile(join(directory, "paragraph-editor.pdf"), await paragraphDocument.save());
  const redactSearchDocument = await PDFDocument.create();
  redactSearchDocument.addPage([400, 300]).drawText("SIGILO PUBLICO", { x: 40, y: 200, size: 16 });
  redactSearchDocument.addPage([400, 300]).drawText("SIGILO MANTIDO", { x: 40, y: 200, size: 16 });
  redactSearchDocument.setTitle("METADADO_PRIVADO");
  const redactField = redactSearchDocument.getForm().createTextField("redact_field");
  redactField.setText("CAMPO");
  redactField.addToPage(redactSearchDocument.getPage(0), { x: 40, y: 40, width: 100, height: 20 });
  await writeFile(join(directory, "redact-search.pdf"), await redactSearchDocument.save());
  const formsDocument = await PDFDocument.create(),
    formsPage = formsDocument.addPage([500, 300]),
    formsFont = await formsDocument.embedFont(StandardFonts.Courier);
  for (const [index, name] of ["primeiro", "segundo", "terceiro"].entries()) {
    const field = formsDocument.getForm().createTextField(name);
    field.setText(name.toUpperCase());
    field.addToPage(formsPage, {
      x: 30,
      y: 220 - index * 60,
      width: 320,
      height: 30,
      font: formsFont,
    });
    field.setFontSize(15);
    field.updateAppearances(formsFont);
  }
  await writeFile(
    join(directory, "forms-authoring.pdf"),
    await formsDocument.save({ updateFieldAppearances: false }),
  );
  const choiceDocument = await PDFDocument.create(),
    choicePage = choiceDocument.addPage([500, 400]);
  const choiceFont = await choiceDocument.embedFont(StandardFonts.Helvetica);
  const choicePairs = [
    { value: "INTERNAL_SP", label: "São Paulo" },
    { value: "INTERNAL_RJ", label: "Rio de Janeiro" },
    { value: "INTERNAL_MG", label: "Minas Gerais" },
  ];
  const dropdown = choiceDocument.getForm().createDropdown("estado"),
    list = choiceDocument.getForm().createOptionList("estados");
  list.enableMultiselect();
  for (const [index, field] of [dropdown, list].entries()) {
    field.setOptions(choicePairs.map((pair) => pair.label));
    field.select("São Paulo");
    field.addToPage(choicePage, {
      x: 30,
      y: index ? 130 : 300,
      width: 350,
      height: index ? 100 : 30,
      font: choiceFont,
    });
    field.setFontSize(14);
    field.updateAppearances(choiceFont);
    field.acroField.setOptions(
      choicePairs.map((pair) => ({
        value: PDFHexString.fromText(pair.value),
        display: PDFHexString.fromText(pair.label),
      })),
    );
    field.acroField.dict.set(PDFName.of("V"), PDFHexString.fromText("INTERNAL_SP"));
    field.acroField.dict.set(PDFName.of("I"), choiceDocument.context.obj([0]));
  }
  const readOnlyChoice = choiceDocument.getForm().createDropdown("somente_leitura");
  readOnlyChoice.setOptions(["PRESERVADO"]);
  readOnlyChoice.select("PRESERVADO");
  readOnlyChoice.addToPage(choicePage, { x: 30, y: 50, width: 350, height: 30, font: choiceFont });
  readOnlyChoice.enableReadOnly();
  readOnlyChoice.updateAppearances(choiceFont);
  await writeFile(
    join(directory, "forms-choice.pdf"),
    await choiceDocument.save({ updateFieldAppearances: false }),
  );
  const splitDocument = await PDFDocument.create();
  for (let index = 0; index < 6; index++) {
    const page = splitDocument.addPage([300, 400]);
    page.drawText(`SPLIT_PAGE_${index + 1}`, { x: 20, y: 300, size: 14 });
    page.node.addContentStream(
      splitDocument.context.register(
        splitDocument.context.stream(`%${String(index).repeat(1800)}\n`),
      ),
    );
  }
  addBookmark(splitDocument, { title: "First section", page: 1 });
  addBookmark(splitDocument, { title: "Second section", page: 3 });
  addBookmark(splitDocument, { title: "Duplicate", page: 3 });
  await writeFile(
    join(directory, "split-strategies.pdf"),
    await splitDocument.save({ updateFieldAppearances: false }),
  );
  await writeFile(
    join(directory, "local-font.ttf"),
    await readFile(new URL("../resources/fonts/NotoSans-Italic.ttf", import.meta.url)),
  );
  const restrictedSource = await PDFDocument.create();
  restrictedSource.addPage([144, 216]).drawText("IMPRESSAO AUTORIZADA", { x: 10, y: 150, size: 9 });
  restrictedSource
    .addPage([216, 144])
    .drawText("SEGUNDA FACE AUTORIZADA", { x: 10, y: 90, size: 9 });
  const restrictedBytes = await restrictedSource.save(),
    engine = await LocalPdfEngine.create(
      await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
    );
  for (const allowed of [true, false])
    await writeFile(
      join(directory, allowed ? "readonly.pdf" : "readonly-denied.pdf"),
      engine.encrypt(restrictedBytes, {
        user: "native-print-reader",
        owner: "native-print-owner",
        print: allowed,
        copy: false,
        modify: false,
        fill: false,
      }),
    );
  const restrictedMany = await PDFDocument.create();
  for (let index = 0; index < 80; index++)
    restrictedMany
      .addPage([144, 216])
      .drawText(`FONTE RETIDA ${index + 1}`, { x: 10, y: 150, size: 9 });
  await writeFile(
    join(directory, "readonly-many.pdf"),
    engine.encrypt(await restrictedMany.save(), {
      user: "native-print-reader",
      owner: "native-print-owner",
      print: true,
      copy: false,
      modify: false,
      fill: false,
    }),
  );
  await writeFile(
    join(directory, "scan.tif"),
    await readFile(new URL("../tests/fixtures/tiff/multipage.tif", import.meta.url)),
  );
  await writeFile(
    join(directory, "rich.rtf"),
    await readFile(new URL("../tests/fixtures/rtf/richedit.rtf", import.meta.url)),
  );
  for (const extension of ["odt", "ods"])
    await writeFile(
      join(directory, `open.${extension}`),
      await readFile(
        new URL(`../tests/fixtures/open-document/independent.${extension}`, import.meta.url),
      ),
    );
  for (const extension of ["pptx", "odp"])
    await writeFile(
      join(directory, `open.${extension}`),
      await readFile(
        new URL(`../tests/fixtures/presentation/independent.${extension}`, import.meta.url),
      ),
    );
  const [regular, bold, italic, boldItalic] = await Promise.all(
    ["Regular", "Bold", "Italic", "BoldItalic"].map((name) =>
      readFile(new URL(`../resources/fonts/NotoSans-${name}.ttf`, import.meta.url)),
    ),
  );
  if (!regular || !bold || !italic || !boldItalic)
    throw new Error("Bundled conversion fixture fonts are missing");
  await writeFile(
    join(directory, "office.docx"),
    exportDocx(
      officeDocumentSchema.parse({
        title: "Office local",
        warnings: [],
        pages: [
          {
            width: 600,
            height: 800,
            blocks: [
              { kind: "paragraph", runs: [{ text: "OFFICE_LOCAL_αβγ", bold: true, size: 18 }] },
              {
                kind: "table",
                header: true,
                rows: [
                  ["Nome", "Valor"],
                  ["João", 12.5],
                ],
              },
            ],
          },
        ],
      }),
      { regular, bold, italic, boldItalic },
      await readFile(new URL("../resources/licenses/Noto-OFL.txt", import.meta.url), "utf8"),
    ),
  );
  return path;
}
export async function verifyPdfNativeJourney(
  application: ElectronApplication,
  editor: Page,
  seedLease: SeedLease,
): Promise<void> {
  await seedLease(application, 300);
  await editor.waitForFunction(
    () => (document.querySelector<HTMLCanvasElement>(".page-canvas")?.width ?? 0) > 0,
  );
  await editor.getByTitle("Texto (T)", { exact: true }).click();
  await editor
    .locator(".annot-layer")
    .first()
    .click({ position: { x: 120, y: 300 } });
  await editor.locator(".text-draft").fill("BUSCA_αβγ_123");
  await editor.locator(".text-draft").press("Escape");
  await editor.getByTitle("Selecionar (V)", { exact: true }).click();
  await editor.keyboard.press("Control+f");
  await editor
    .getByRole("textbox", { name: "Buscar no documento", exact: true })
    .fill("BUSCA_αβγ_123");
  await editor.waitForFunction(() =>
    document.querySelector(".search-count")?.textContent.includes("1 de 1"),
  );
  assert.ok((await editor.locator(".search-hit").count()) > 5);
  await editor.getByRole("button", { name: "Opções e resultados da busca", exact: true }).click();
  assert.ok(
    ((await editor.locator(".search-results").textContent()) ?? "").includes("BUSCA_αβγ_123"),
  );
  await editor.getByRole("button", { name: "Fechar busca", exact: true }).click();
  await editor.locator(".form-field").first().fill("CAMPO_ATUAL");
  await editor.keyboard.press("Control+f");
  await editor
    .getByRole("textbox", { name: "Buscar no documento", exact: true })
    .fill("CAMPO_ATUAL");
  await editor.waitForFunction(() =>
    document.querySelector(".search-count")?.textContent.includes("1 de 1"),
  );
  await editor.getByRole("button", { name: "Fechar busca", exact: true }).click();
  const thumbnail = await editor.locator(".thumb-paper img").first().getAttribute("src");
  assert.ok(thumbnail?.startsWith("data:image/jpeg"));
  await editor.getByRole("textbox", { name: "Página", exact: true }).fill("2");
  await editor.getByRole("textbox", { name: "Página", exact: true }).press("Enter");
  await editor.waitForFunction(() =>
    document.querySelector(".page.current .textLayer")?.textContent.includes("SEGUNDA_PAGINA"),
  );
  const scroll = await editor.locator(".stage").evaluate((el) => el.scrollTop);
  await editor.getByTitle("Início", { exact: true }).click();
  await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
  await editor.waitForFunction(
    (expected) =>
      Math.abs((document.querySelector<HTMLElement>(".stage")?.scrollTop ?? -9999) - expected) < 3,
    scroll,
  );
  await editor.getByRole("button", { name: "Modo leitura", exact: true }).click();
  await editor.getByRole("button", { name: "Disposição das páginas", exact: true }).click();
  await editor.getByRole("menuitemcheckbox", { name: "Duas páginas", exact: true }).click();
  await editor.waitForFunction(() => document.querySelector(".viewer-row")?.children.length === 2);
  await editor.getByRole("button", { name: "Disposição das páginas", exact: true }).click();
  await editor.getByRole("menuitemcheckbox", { name: "Uma página", exact: true }).click();
  await editor.waitForFunction(() => document.querySelectorAll(".page").length === 1);
  await editor.keyboard.press("PageUp");
  await editor.waitForFunction(() =>
    document.querySelector(".page .textLayer")?.textContent.includes("ORIGINAL_CONFIDENCIAL"),
  );
  await editor.keyboard.press("Control+k");
  await editor.getByRole("combobox", { name: "Buscar ação", exact: true }).fill("apagar texto");
  await editor.getByRole("combobox", { name: "Buscar ação", exact: true }).press("Enter");
  await editor
    .getByRole("dialog", { name: "Remover conteúdo de forma permanente", exact: true })
    .waitFor();
  await editor.keyboard.press("Escape");
  await editor
    .getByRole("dialog", { name: "Remover conteúdo de forma permanente", exact: true })
    .waitFor({ state: "hidden" });
  await application.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("renderer/index.html"),
    );
    if (!w) throw new Error("PDF window missing");
    w.unmaximize();
    w.setSize(1100, 760);
  });
  await editor.waitForFunction(
    () =>
      innerWidth <= 1100 &&
      (document.querySelector<HTMLElement>(".stage")?.scrollTop ?? 9999) < 50 &&
      document.querySelector<HTMLCanvasElement>(".page-canvas")?.dataset.key,
  );
  await editor.screenshot({ path: resolve(".cache/edi-native-results/edipdf-lote3-leitura.png") });
  const command = async (query: string) => {
    await editor.keyboard.press("Control+k");
    const input = editor.getByRole("combobox", { name: "Buscar ação", exact: true });
    await input.fill(query);
    await input.press("Enter");
  };
  await command("Preparar formulário");
  const formsDialog = editor.getByRole("dialog", { name: "Preparar formulário", exact: true });
  await formsDialog.getByRole("button", { name: "Adicionar campo", exact: true }).waitFor();
  await verifyModalFocus(formsDialog);
  await editor.waitForFunction(
    () => !document.querySelector("dialog[open] .modal-body")?.textContent.includes("Lendo campos"),
  );
  await formsDialog.getByRole("textbox", { name: "Nome interno", exact: true }).fill("cep_novo");
  await formsDialog
    .getByRole("textbox", { name: "Rótulo acessível", exact: true })
    .fill("CEP novo");
  await formsDialog.getByRole("spinbutton", { name: "Topo (pt)", exact: true }).fill("420");
  await formsDialog
    .getByRole("combobox", { name: "Máscara local", exact: true })
    .selectOption("cep");
  await formsDialog.getByRole("checkbox", { name: "Obrigatório", exact: true }).check();
  await formsDialog.getByRole("button", { name: "Adicionar campo", exact: true }).click();
  await formsDialog.locator(".navigation-list").getByText("CEP novo", { exact: true }).waitFor();
  assert.equal(await formsDialog.locator('[role="alert"]').count(), 0);
  await formsDialog
    .locator(".modal-foot")
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  await editor.waitForFunction(
    () =>
      document.querySelector(".page-warning") || document.querySelector('[aria-label="CEP novo"]'),
  );
  await editor.getByRole("textbox", { name: "CEP novo", exact: true }).fill("12345678");
  await editor.getByRole("textbox", { name: "CEP novo", exact: true }).press("Tab");
  assert.equal(
    await editor.getByRole("textbox", { name: "CEP novo", exact: true }).inputValue(),
    "12345-678",
  );
  await command("Marcadores links");
  const navDialog = editor.getByRole("dialog", { name: "Marcadores, links e anexos", exact: true });
  await navDialog.getByRole("textbox", { name: "Título", exact: true }).fill("Capítulo local");
  await navDialog.getByRole("spinbutton", { name: "Página de destino", exact: true }).fill("2");
  await navDialog.getByRole("button", { name: "Adicionar marcador", exact: true }).click();
  await navDialog.getByRole("button", { name: "Capítulo local · p. 2", exact: true }).waitFor();
  assert.equal(await navDialog.locator('[role="alert"]').count(), 0);
  await navDialog.getByRole("button", { name: "Links", exact: true }).click();
  await navDialog.getByRole("button", { name: "Adicionar link", exact: true }).click();
  await navDialog.getByRole("button", { name: "Mostrar página", exact: true }).waitFor();
  await navDialog
    .locator(".modal-foot")
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  await editor.locator(".pdf-link").first().waitFor();
  await command("Inserir assinatura gráfica");
  const signatureDialog = editor.getByRole("dialog", { name: "Assinar", exact: true });
  await dragFixturePointer(editor, signatureDialog.locator(".sig-pad"), 60, 30, "pointer-target");
  assert.equal(
    await signatureDialog.locator(".sig-pad").evaluate((element) => {
      if (!(element instanceof HTMLCanvasElement))
        throw new Error("Missing owned signature canvas");
      const context = element.getContext("2d");
      if (!context) throw new Error("Missing owned canvas context");
      return context
        .getImageData(0, 0, element.width, element.height)
        .data.some((value, index) => index % 4 === 3 && value !== 0);
    }),
    false,
  );
  const pad = await signatureDialog.locator(".sig-pad").boundingBox();
  assert.ok(pad);
  await editor.mouse.move(pad.x + 35, pad.y + 55);
  await editor.mouse.down();
  await editor.mouse.move(pad.x + 180, pad.y + 110, { steps: 8 });
  await editor.mouse.up();
  await signatureDialog
    .getByRole("checkbox", { name: "Incluir a data atual junto da assinatura", exact: true })
    .check();
  await signatureDialog.getByRole("button", { name: "Usar assinatura", exact: true }).click();
  await signatureDialog.waitFor({ state: "hidden" });
  assert.equal((await editor.evaluate(() => window.api.signatures.list())).length, 0);
  assert.ok(
    (await editor.locator(".annot-svg path[data-annot], .annot-svg g[data-annot]").count()) > 0,
  );
  const versions = await editor.evaluate(async () => {
    const start = Date.now();
    while (Date.now() - start < 5000) {
      const list = await window.api.versions.list();
      if (list.entries.length) return list;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("No local version");
  });
  assert.ok(versions.entries.length > 0);
  await command("Anotações e comentários");
  const annotationDialog = editor.getByRole("dialog", {
    name: "Anotações e comentários",
    exact: true,
  });
  await annotationDialog.getByRole("button", { name: "Selecionar filtradas", exact: true }).click();
  await annotationDialog.getByRole("button", { name: "Bloquear", exact: true }).click();
  assert.ok(
    ((await annotationDialog.locator(".annotation-manager-list").textContent()) ?? "").includes(
      "bloqueada",
    ),
  );
  await annotationDialog.getByRole("button", { name: "Desbloquear", exact: true }).click();
  await annotationDialog
    .locator(".modal-foot")
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  await command("Abrir preferências");
  const preferencesDialog = editor.getByRole("dialog", { name: "Preferências", exact: true });
  await preferencesDialog
    .getByRole("combobox", { name: "Tema", exact: true })
    .selectOption("light");
  await preferencesDialog
    .getByRole("checkbox", {
      name: "Reabrir os PDFs salvos e a posição de leitura ao iniciar",
      exact: true,
    })
    .check();
  await verifyModalFocus(preferencesDialog);
  await preferencesDialog.getByRole("button", { name: "Salvar preferências", exact: true }).click();
  await editor.waitForFunction(
    () =>
      document.documentElement.dataset.theme === "light" && !document.querySelector("dialog[open]"),
  );
  const toolbar = await editor
    .locator(".toolbar")
    .evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  assert.ok(toolbar.scroll <= toolbar.width + 1, "The toolbar must fit the minimum window width");
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote3-formulario.png"),
    animations: "disabled",
  });
  await editor.getByRole("textbox", { name: "Página", exact: true }).fill("2");
  await editor.getByRole("textbox", { name: "Página", exact: true }).press("Enter");
  await command("reconhecer texto");
  const compressedPath = join(
    await application.evaluate(({ app }) => app.getPath("userData")),
    "..",
    "..",
    "edipdf-compressed.pdf",
  );
  const nativeProcessId = await application.evaluate(() => process.pid);
  const responder = (action = "Save", selectedPath = compressedPath) =>
    new Promise<Error | null>((resolve) => {
      execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          resolvePath(),
          "-TestProcessId",
          String(nativeProcessId),
          "-Action",
          action,
          "-SelectedPath",
          selectedPath,
        ],
        { windowsHide: true, timeout: 20_000 },
        (error, stdout) => {
          if (stdout) console.log(stdout.trim());
          resolve(error ? new Error(`${error.message}\n${stdout}`) : null);
        },
      );
    });
  function resolvePath() {
    return resolve("apps/edipdf/scripts/respond-native-file.ps1");
  }
  let ocr = editor.getByRole("dialog", { name: "Reconhecer texto — OCR local", exact: true });
  await ocr.getByLabel("Páginas", { exact: true }).fill("2");
  await ocr.getByRole("checkbox", { name: /Reconhecer também/ }).check();
  await ocr.getByRole("button", { name: "Reconhecer", exact: true }).click();
  await ocr.getByRole("status").filter({ hasText: "Orientação" }).waitFor();
  await ocr.getByRole("button", { name: "Cancelar operação", exact: true }).click();
  await ocr.getByRole("status").filter({ hasText: "OCR interrompido" }).waitFor();
  await ocr.getByRole("button", { name: "Reconhecer", exact: true }).click();
  await ocr.getByRole("status").filter({ hasText: "Orientação" }).waitFor();
  await ocr.getByRole("button", { name: "Continuar em segundo plano", exact: true }).click();
  const activeQueue = editor.getByRole("dialog", {
    name: "Tarefas e resultados preparados",
    exact: true,
  });
  await activeQueue
    .getByRole("button", { name: "Interromper audit (OCR).pdf", exact: true })
    .waitFor();
  await activeQueue.getByTitle("Fechar", { exact: true }).click();
  await editor.getByRole("textbox", { name: "Página", exact: true }).fill("1");
  await editor.getByRole("textbox", { name: "Página", exact: true }).press("Enter");
  await command("exportar documento");
  let backgroundConversion = editor.getByRole("dialog", {
    name: "Exportar documento",
    exact: true,
  });
  await backgroundConversion.getByLabel("Formato", { exact: true }).selectOption("txt");
  await backgroundConversion.getByRole("button", { name: "Gerar prévia", exact: true }).click();
  await backgroundConversion
    .getByRole("button", { name: "Continuar em segundo plano", exact: true })
    .click();
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote4-background-queue.png"),
    animations: "disabled",
  });
  await activeQueue
    .getByRole("button", { name: "Revisar audit (convertido).txt", exact: true })
    .waitFor({ timeout: 60_000 });
  await activeQueue
    .getByRole("button", { name: "Revisar audit (convertido).txt", exact: true })
    .click();
  backgroundConversion = editor.getByRole("dialog", {
    name: "Retomar conversão preparada",
    exact: true,
  });
  await backgroundConversion
    .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
    .waitFor();
  const backgroundTxt = join(compressedPath, "..", "edipdf-converted.txt"),
    backgroundResponse = responder("Save", backgroundTxt);
  await backgroundConversion
    .getByRole("button", { name: "Salvar cópia convertida", exact: true })
    .click();
  const backgroundSaved = await backgroundResponse;
  if (backgroundSaved) throw backgroundSaved;
  await backgroundConversion.waitFor({ state: "detached" });
  console.log(
    "Native conversion result:",
    await editor.getByText(/^Conversão salva como cópia em /).textContent(),
  );
  assert.match(await readFile(backgroundTxt, "utf8"), /BUSCA_αβγ_123/);
  await command("tarefas e resultados preparados");
  await activeQueue
    .getByRole("button", { name: "Revisar audit (OCR).pdf", exact: true })
    .waitFor({ timeout: 60_000 });
  await activeQueue.getByRole("button", { name: "Revisar audit (OCR).pdf", exact: true }).click();
  ocr = editor.getByRole("dialog", { name: "Reconhecer texto — OCR local", exact: true });
  await ocr.getByRole("status").filter({ hasText: "Resultado retomado" }).waitFor();
  await ocr.getByRole("checkbox", { name: "Somente palavras incertas", exact: true }).uncheck();
  await ocr.getByRole("button", { name: /EDIPDF/ }).waitFor();
  await ocr.getByRole("button", { name: "Descartar revisão OCR", exact: true }).click();
  await ocr.waitFor({ state: "detached" });
  await command("reconhecer texto");
  ocr = editor.getByRole("dialog", { name: "Reconhecer texto — OCR local", exact: true });
  await ocr.getByLabel("Páginas", { exact: true }).fill("2");
  await ocr.getByRole("checkbox", { name: /Reconhecer também/ }).check();
  await ocr.getByRole("button", { name: "Reconhecer", exact: true }).click();
  await ocr
    .getByRole("status")
    .filter({ hasText: "Reconhecimento pronto" })
    .waitFor({ timeout: 60_000 });
  await ocr.getByRole("checkbox", { name: "Somente palavras incertas", exact: true }).uncheck();
  await ocr.getByRole("button", { name: /EDIPDF/ }).waitFor();
  await ocr.getByLabel(/Corrigir palavra/).fill("OCR_VERIFICADO");
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote4-ocr.png"),
    animations: "disabled",
  });
  await ocr.getByRole("button", { name: "Aplicar texto revisado", exact: true }).click();
  await ocr.waitFor({ state: "hidden" });
  await editor.keyboard.press("Control+f");
  await editor
    .getByRole("textbox", { name: "Buscar no documento", exact: true })
    .fill("OCR_VERIFICADO");
  await editor.waitForFunction(() =>
    document.querySelector(".search-count")?.textContent.includes("1 de 1"),
  );
  await editor.getByRole("button", { name: "Fechar busca", exact: true }).click();
  console.log(
    "Verified local Portuguese OCR, cancellation, background OCR/conversion, live task queue, editor interaction, protected resume, reviewed text and searchable output",
  );
  await command("compactar documento");
  let compression = editor.getByRole("dialog", { name: "Compactar PDF", exact: true });
  await compression
    .getByRole("checkbox", { name: "Buscar um tamanho máximo por arquivo", exact: true })
    .check();
  await compression.getByLabel("Meta (MB)", { exact: true }).fill("0.001");
  let response = responder();
  await compression.getByRole("button", { name: "Compactar e salvar cópia…", exact: true }).click();
  const firstResponse = await response;
  if (firstResponse) {
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-compactacao-falha.png"),
    });
    console.log(
      "Compression first native destination failed",
      await compression.locator('[role="alert"]').allTextContents(),
    );
    throw firstResponse;
  }
  const outcome = editor.getByRole("dialog", { name: "Resultado da compactação", exact: true });
  await outcome.getByText(/Nenhuma cópia salva/).waitFor();
  await assert.rejects(readFile(compressedPath), { code: "ENOENT" });
  await outcome.getByRole("button", { name: "Ajustar e tentar novamente", exact: true }).click();
  compression = editor.getByRole("dialog", { name: "Compactar PDF", exact: true });
  // Full editable widget fonts raise this fixture's floor (the diagnostic measured 628 KB).
  // The impossible-goal path remains above; this review path must use an attainable target.
  const attainableCompressionMb = 1;
  await compression.getByLabel("Meta (MB)", { exact: true }).fill(String(attainableCompressionMb));
  response = responder();
  await compression.getByRole("button", { name: "Compactar e salvar cópia…", exact: true }).click();
  const secondResponse = await response;
  if (secondResponse) throw secondResponse;
  const preview = editor.getByRole("dialog", { name: "Revisar compactação", exact: true });
  const compressionError = compression.getByRole("alert");
  await preview.or(outcome).or(compressionError).first().waitFor();
  if ((await outcome.isVisible()) || (await compressionError.isVisible())) {
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-compression-target-diagnostic.png"),
      animations: "disabled",
    });
    console.log("Owned compression target diagnostic", await editor.locator("body").innerText());
    throw new Error(
      "Owned compression fixture did not reach the expected quality review; inspect the recorded outcome",
    );
  }
  await preview.getByRole("img", { name: "Página compactada", exact: true }).waitFor();
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote4-compactacao.png"),
    animations: "disabled",
  });
  await preview.getByRole("button", { name: "Continuar depois", exact: true }).click();
  await command("tarefas e resultados preparados");
  const pendingCompression = await editor.evaluate(() => window.api.tasks.list());
  const retainedCompression = pendingCompression.tasks.find(
    (task) => task.kind === "compression" && task.state === "review",
  );
  assert.ok(retainedCompression);
  await editor
    .getByRole("dialog", { name: "Tarefas e resultados preparados", exact: true })
    .getByRole("button", { name: `Revisar ${retainedCompression.name}`, exact: true })
    .first()
    .click();
  const resumedCompression = editor.getByRole("dialog", {
    name: "Revisar compactação retomada",
    exact: true,
  });
  await resumedCompression
    .getByRole("img", { name: "Página depois da compactação", exact: true })
    .waitFor();
  await resumedCompression
    .getByRole("checkbox", { name: "Revisei o resultado e quero salvar uma cópia.", exact: true })
    .check();
  response = responder();
  await resumedCompression
    .getByRole("button", { name: "Salvar cópia revisada", exact: true })
    .click();
  const resumedResponse = await response;
  if (resumedResponse) throw resumedResponse;
  await resumedCompression.waitFor({ state: "hidden" });
  const compressedBytes = await readFile(compressedPath);
  assert.ok(compressedBytes.length <= attainableCompressionMb * 1024 * 1024);
  const compressed = await PDFDocument.load(compressedBytes);
  assert.equal(compressed.getPageCount(), 2);
  assert.ok(compressed.getForm().getTextField("cep_novo").getText());
  const encoded = compressed.context
    .enumerateIndirectObjects()
    .find(
      ([, object]) =>
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of("Filter")) === PDFName.of("DCTDecode") &&
        object.dict.lookupMaybe(PDFName.of("Width"), PDFNumber)?.asNumber() === 556,
    );
  assert.ok(
    encoded && encoded[1] instanceof PDFRawStream,
    "Real browser worker must encode the placed photograph to 200 dpi",
  );
  const require = createRequire(import.meta.url),
    canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json"));
  const decoded = await canvasRequire("@napi-rs/canvas").loadImage(encoded[1].contents);
  assert.equal(decoded.width, 556);
  assert.equal(decoded.height, 313);
  const outputFolder = join(compressedPath, "..", "edipdf-output");
  await mkdir(outputFolder);
  const fixture = join(
    await application.evaluate(({ app }) => app.getPath("userData")),
    "documents",
    "audit.pdf",
  );
  response = responder("Open", fixture);
  await command("compactar arquivos");
  const sourceResponse = await response;
  if (sourceResponse) throw sourceResponse;
  compression = editor.getByRole("dialog", { name: "Compactar PDF", exact: true });
  await compression
    .getByRole("checkbox", {
      name: "Revisar uma prévia de qualidade antes de salvar cada cópia",
      exact: true,
    })
    .uncheck();
  response = responder("Folder", outputFolder);
  await compression.getByRole("button", { name: "Compactar", exact: true }).click();
  const folderResponse = await response;
  if (folderResponse) throw folderResponse;
  await outcome.getByText("audit (compactado).pdf", { exact: true }).waitFor();
  assert.equal(
    (
      await PDFDocument.load(await readFile(join(outputFolder, "audit (compactado).pdf")))
    ).getPageCount(),
    2,
  );
  await outcome.getByRole("button", { name: "Concluir", exact: true }).click();
  console.log(
    "Verified compression target honesty, quality review, native save capability and preserved editable forms",
  );
  await seedLease(application, 300);
  await command("dividir documento");
  let batch = editor.getByRole("dialog", { name: "Dividir documento", exact: true });
  await batch.getByLabel("Dividir por", { exact: true }).selectOption("ranges");
  await batch.getByLabel("Partes e páginas", { exact: true }).fill("1;2");
  await batch.getByRole("button", { name: "Preparar lote", exact: true }).click();
  await waitBatchPreview(editor, batch, "Prévia do arquivo parte-001.pdf, página 1");
  await batch.getByTitle("Fechar", { exact: true }).click();
  await command("tarefas e resultados preparados");
  await editor.getByRole("button", { name: "Revisar audit — partes", exact: true }).click();
  batch = editor.getByRole("dialog", { name: "Retomar lote preparado", exact: true });
  await waitBatchPreview(editor, batch, "Prévia do arquivo parte-001.pdf, página 1");
  await batch.getByLabel("Arquivo da prévia", { exact: true }).selectOption("1");
  await waitBatchPreview(editor, batch, "Prévia do arquivo parte-002.pdf, página 1");
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote4-split-review.png"),
    animations: "disabled",
  });
  await batch
    .getByRole("checkbox", { name: "Conferi os arquivos e quero salvar o lote.", exact: true })
    .check();
  response = responder("Folder", outputFolder);
  await batch.getByRole("button", { name: "Escolher pasta e salvar lote", exact: true }).click();
  const splitSaved = await response;
  if (splitSaved) throw splitSaved;
  await batch.waitFor({ state: "detached" });
  const firstPart = await PDFDocument.load(
      await readFile(join(outputFolder, "audit - partes", "parte-001.pdf")),
    ),
    secondPart = await PDFDocument.load(
      await readFile(join(outputFolder, "audit - partes", "parte-002.pdf")),
    );
  assert.equal(firstPart.getPageCount(), 1);
  assert.equal(secondPart.getPageCount(), 1);
  assert.ok(firstPart.getForm().getFields().length > 0);
  assert.equal(secondPart.getForm().getFields().length, 0);
  const batchCache = resolve(".cache/edipdf-analysis/native-batch");
  await mkdir(batchCache, { recursive: true });
  for (const format of ["png", "jpg"]) {
    await command("exportar páginas como imagens");
    batch = editor.getByRole("dialog", { name: "Exportar como imagens", exact: true });
    await batch.getByLabel("Páginas", { exact: true }).selectOption("all");
    await batch.getByLabel("Formato", { exact: true }).selectOption(format);
    await batch.getByLabel("Resolução", { exact: true }).selectOption("72");
    await batch.getByRole("button", { name: "Preparar lote", exact: true }).click();
    await batch
      .getByRole("img", { name: `Prévia do arquivo pagina-0001.${format}, página 1`, exact: true })
      .waitFor();
    await batch.getByLabel("Arquivo da prévia", { exact: true }).selectOption("1");
    await batch
      .getByRole("img", { name: `Prévia do arquivo pagina-0002.${format}, página 1`, exact: true })
      .waitFor();
    await editor.screenshot({
      path: resolve(`.cache/edi-native-results/edipdf-lote4-${format}-batch.png`),
      animations: "disabled",
    });
    await batch
      .getByRole("checkbox", { name: "Conferi os arquivos e quero salvar o lote.", exact: true })
      .check();
    response = responder("Folder", outputFolder);
    await batch.getByRole("button", { name: "Escolher pasta e salvar lote", exact: true }).click();
    const saved = await response;
    if (saved) throw saved;
    await batch.waitFor({ state: "detached" });
    const directory = join(
      outputFolder,
      format === "png" ? "audit - imagens" : "audit - imagens (2)",
    );
    for (const file of [1, 2])
      await writeFile(
        join(batchCache, `pagina-${file}.${format}`),
        await readFile(join(directory, `pagina-${String(file).padStart(4, "0")}.${format}`)),
      );
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    assert.equal(manifest.files.length, 2);
    assert.equal(manifest.stage, "review");
  }
  assert.ok((await readFile(join(outputFolder, "audit - imagens", "pagina-0001.png"))).length > 0);
  console.log(
    "Verified native split and PNG/JPEG workers, actual file previews, protected batch resume, whole exclusive directory commits and retained form values",
  );
  await seedLease(application, 300);
  response = responder("Open", join(fixture, "..", "batch-many.pdf"));
  await editor.keyboard.press("Control+o");
  const manyOpened = await response;
  if (manyOpened) throw manyOpened;
  await editor.locator(".tab-name").filter({ hasText: "batch-many.pdf" }).waitFor();
  await command("exportar páginas como imagens");
  batch = editor.getByRole("dialog", { name: "Exportar como imagens", exact: true });
  await batch.getByLabel("Páginas", { exact: true }).selectOption("all");
  await batch.getByLabel("Resolução", { exact: true }).selectOption("72");
  await batch.getByRole("button", { name: "Preparar lote", exact: true }).click();
  await batch
    .getByRole("status")
    .filter({ hasText: /^[1-9]\d? de 100 arquivos completos$/ })
    .waitFor();
  await batch.getByRole("button", { name: "Interromper lote", exact: true }).click();
  await batch.waitFor({ state: "detached" });
  const partialBatches = await editor.evaluate(() => window.api.tasks.list()),
    partialBatch = partialBatches.tasks.find(
      (task) => task.kind === "batch" && task.label === "batch-many.pdf",
    );
  assert.ok(partialBatch);
  assert.equal(partialBatch.state, "processing");
  const partialBatchData = await editor.evaluate(
    (id) => window.api.tasks.load(id),
    partialBatch.id,
  );
  assert.ok(partialBatchData.result.detail?.kind === "batch");
  const prefixFiles = partialBatchData.result.detail.files;
  assert.ok(prefixFiles.length > 0 && prefixFiles.length < 100);
  await command("tarefas e resultados preparados");
  await editor.getByRole("button", { name: "Retomar batch-many — imagens", exact: true }).click();
  batch = editor.getByRole("dialog", { name: "Retomar lote preparado", exact: true });
  await waitBatchPreview(editor, batch, "Prévia do arquivo pagina-0001.png, página 1");
  assert.equal(
    await batch.getByRole("button", { name: "Escolher pasta e salvar lote", exact: true }).count(),
    0,
  );
  await batch.getByRole("button", { name: "Continuar arquivos pendentes", exact: true }).click();
  await batch.getByRole("button", { name: "Escolher pasta e salvar lote", exact: true }).waitFor();
  const completedBatch = await editor.evaluate((id) => window.api.tasks.load(id), partialBatch.id);
  assert.ok(completedBatch.result.detail?.kind === "batch");
  assert.equal(completedBatch.result.detail.files.length, 100);
  assert.deepEqual(completedBatch.result.detail.files.slice(0, prefixFiles.length), prefixFiles);
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote4-batch-resume.png"),
    animations: "disabled",
  });
  await batch
    .getByRole("checkbox", { name: "Conferi os arquivos e quero salvar o lote.", exact: true })
    .check();
  response = responder("Folder", outputFolder);
  await batch.getByRole("button", { name: "Escolher pasta e salvar lote", exact: true }).click();
  const resumedBatchSaved = await response;
  if (resumedBatchSaved) throw resumedBatchSaved;
  await batch.waitFor({ state: "detached" });
  assert.equal((await readdir(join(outputFolder, "batch-many - imagens"))).length, 101);
  await editor
    .getByRole("group", { name: "batch-many.pdf", exact: true })
    .getByTitle("Fechar (Ctrl+W)", { exact: true })
    .click();
  await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
  console.log(
    `Verified real native interruption after ${prefixFiles.length} protected files, resume to 100 with unchanged prefix and complete exclusive folder publication`,
  );
  await seedLease(application, 300);
  const originalMergeInput = await readFile(fixture);
  response = responder("Open", fixture);
  await command("juntar pdfs");
  const merge = editor.getByRole("dialog", { name: "Juntar PDFs", exact: true });
  const firstMergePick = await response;
  if (firstMergePick) throw firstMergePick;
  await merge.locator(".file-list li").first().waitFor();
  response = responder("Open", fixture);
  await merge.getByRole("button", { name: "Adicionar arquivos", exact: true }).click();
  const secondMergePick = await response;
  if (secondMergePick) throw secondMergePick;
  await merge.locator(".file-list li").nth(1).waitFor();
  await merge.getByLabel("Compactação", { exact: true }).selectOption("balanced");
  await merge.getByRole("button", { name: "Preparar PDF combinado", exact: true }).click();
  await waitBatchPreview(editor, merge, "Prévia do PDF combinado, página 1");
  await merge.getByLabel("Página da prévia", { exact: true }).fill("4");
  await waitBatchPreview(editor, merge, "Prévia do PDF combinado, página 4");
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote4-merge-review.png"),
    animations: "disabled",
  });
  await merge.getByTitle("Fechar", { exact: true }).click();
  await command("tarefas e resultados preparados");
  await editor.getByRole("button", { name: "Revisar Combinado.pdf", exact: true }).click();
  let resumedMerge = editor.getByRole("dialog", {
    name: "Retomar conversão preparada",
    exact: true,
  });
  await waitBatchPreview(editor, resumedMerge, "Prévia da conversão, página 1");
  await resumedMerge.getByRole("button", { name: "Abrir PDF para revisar", exact: true }).click();
  await resumedMerge.waitFor({ state: "detached" });
  await editor.locator(".tab-name").filter({ hasText: "Combinado.pdf" }).waitFor();
  await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
  await command("tarefas e resultados preparados");
  await editor.getByRole("button", { name: "Revisar Combinado.pdf", exact: true }).click();
  resumedMerge = editor.getByRole("dialog", { name: "Retomar conversão preparada", exact: true });
  await waitBatchPreview(editor, resumedMerge, "Prévia da conversão, página 1");
  const mergedPath = join(compressedPath, "..", "edipdf-merged.pdf");
  response = responder("Save", mergedPath);
  await resumedMerge.getByRole("button", { name: "Salvar cópia convertida", exact: true }).click();
  const mergeSaved = await response;
  if (mergeSaved) throw mergeSaved;
  await resumedMerge.waitFor({ state: "detached" });
  const mergedPdf = await PDFDocument.load(await readFile(mergedPath)),
    mergedFields = mergedPdf.getForm().getFields();
  assert.equal(mergedPdf.getPageCount(), 4);
  assert.equal(mergedFields.length, 2);
  assert.equal(new Set(mergedFields.map((field) => field.getName())).size, 2);
  assert.deepEqual(await readFile(fixture), originalMergeInput);
  console.log(
    "Verified native ordered merge/compression workers, fourth-page output preview, protected review resume/open, copied namespaced fields and unchanged source bytes",
  );
  try {
    const fontPath = join(fixture, "..", "font-editor.pdf"),
      fontOriginal = await readFile(fontPath);
    response = responder("Open", fontPath);
    await editor.keyboard.press("Control+o");
    const fontOpened = await response;
    if (fontOpened) throw fontOpened;
    await editor.locator(".tab-name").filter({ hasText: "font-editor.pdf" }).waitFor();
    await command("editar texto original");
    const contentEditor = editor.getByRole("dialog", {
      name: "Editar conteúdo do PDF",
      exact: true,
    });
    await contentEditor.getByLabel("Novo texto", { exact: true }).fill("FONTE_áβ_123");
    response = responder("Open", join(fixture, "..", "local-font.ttf"));
    await contentEditor
      .getByRole("button", { name: "Escolher fonte TrueType…", exact: true })
      .click();
    const fontChosen = await response;
    if (fontChosen) throw fontChosen;
    await contentEditor
      .getByRole("button", { name: "Usar Noto Sans novamente", exact: true })
      .waitFor();
    await contentEditor.getByRole("button", { name: "Substituir texto", exact: true }).click();
    await contentEditor.waitFor({ state: "detached" });
    await editor.waitForFunction(() =>
      document.querySelector(".page .textLayer")?.textContent.includes("FONTE_áβ_123"),
    );
    const fontCopyPath = join(compressedPath, "..", "edipdf-custom-font.pdf");
    response = responder("Save", fontCopyPath);
    await editor.keyboard.press("Control+Shift+s");
    const fontSaved = await response;
    if (fontSaved) throw fontSaved;
    await editor.locator(".tab-name").filter({ hasText: "edipdf-custom-font.pdf" }).waitFor();
    await editor.locator(".busy").waitFor({ state: "hidden" });
    const selectedFontPdf = await PDFDocument.load(await readFile(fontCopyPath));
    assert.equal(selectedFontPdf.getPageCount(), 1);
    assert.equal(selectedFontPdf.getForm().getTextField("font_preserved").getText(), "PRESERVADO");
    assert.ok(
      selectedFontPdf.context
        .enumerateIndirectObjects()
        .some(
          ([, value]) =>
            value instanceof PDFDict &&
            /NotoSans.*Italic/i.test(String(value.get(PDFName.of("BaseFont")))),
        ),
    );
    await editor.keyboard.press("Control+z");
    await editor.waitForFunction(() =>
      document.querySelector(".page .textLayer")?.textContent.includes("FONT_ORIGINAL"),
    );
    await editor.keyboard.press("Control+y");
    await editor.waitForFunction(() =>
      document.querySelector(".page .textLayer")?.textContent.includes("FONTE_áβ_123"),
    );
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-autoria-custom-font.png"),
      animations: "disabled",
    });
    await editor
      .getByRole("group", { name: "edipdf-custom-font.pdf", exact: true })
      .getByTitle("Fechar (Ctrl+W)", { exact: true })
      .click();
    assert.deepEqual(await readFile(fontPath), fontOriginal);
    await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
    console.log(
      "Verified native TrueType picker/worker, selected italic font embedded in saved Unicode replacement, retained field, structural undo/redo and unchanged original",
    );
    const groupPath = join(fixture, "..", "group-editor.pdf"),
      groupOriginal = await readFile(groupPath);
    response = responder("Open", groupPath);
    await editor.keyboard.press("Control+o");
    const groupOpened = await response;
    if (groupOpened) throw groupOpened;
    await editor.locator(".tab-name").filter({ hasText: "group-editor.pdf" }).waitFor();
    await command("editar texto original");
    const groupDialog = editor.getByRole("dialog", { name: "Editar conteúdo do PDF", exact: true });
    await groupDialog
      .getByRole("button", { name: "Editar elementos do grupo", exact: true })
      .click();
    await groupDialog.getByLabel("Novo texto", { exact: true }).fill("GRUPO_áβ_123");
    await groupDialog.getByRole("button", { name: "Voltar à página", exact: true }).waitFor();
    response = responder("Open", join(fixture, "..", "local-font.ttf"));
    await groupDialog
      .getByRole("button", { name: "Escolher fonte TrueType…", exact: true })
      .click();
    const groupFontChosen = await response;
    if (groupFontChosen) throw groupFontChosen;
    await groupDialog
      .getByRole("button", { name: "Usar Noto Sans novamente", exact: true })
      .waitFor();
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-form-objects-preview.png"),
      animations: "disabled",
    });
    await groupDialog.getByRole("button", { name: "Substituir texto", exact: true }).click();
    await groupDialog.waitFor({ state: "detached" });
    await editor.locator(".busy").waitFor({ state: "hidden" });
    await editor.waitForFunction(() =>
      document.querySelector(".page .textLayer")?.textContent.includes("GRUPO_áβ_123"),
    );
    const groupCopyPath = join(compressedPath, "..", "edipdf-form-objects.pdf");
    response = responder("Save", groupCopyPath);
    await editor.keyboard.press("Control+Shift+s");
    const groupSaved = await response;
    if (groupSaved) throw groupSaved;
    await editor.locator(".tab-name").filter({ hasText: "edipdf-form-objects.pdf" }).waitFor();
    await editor.locator(".busy").waitFor({ state: "hidden" });
    const groupBytes = new Uint8Array(await readFile(groupCopyPath)),
      groupEngine = await LocalPdfEngine.create(
        await readFile(createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm")),
      ),
      groupTexts = groupEngine
        .textDocument(groupBytes, { includeAnnotations: false })
        .pages.map((page) => page.glyphs.map((glyph) => glyph.text).join("")),
      groupOutput = await PDFDocument.load(groupBytes);
    assert.match(groupTexts[0] ?? "", /GRUPO_áβ_123/);
    assert.equal((groupTexts[0]?.match(/ORIGINAL_CHILD/g) ?? []).length, 1);
    assert.equal(groupTexts[1], "ORIGINAL_CHILD");
    assert.equal(groupOutput.getPageCount(), 2);
    assert.equal(groupOutput.getForm().getTextField("group_preserved").getText(), "PRESERVADO");
    assert.deepEqual(
      groupEngine.renderPage(groupBytes, 1, 72).pixels,
      groupEngine.renderPage(new Uint8Array(groupOriginal), 1, 72).pixels,
    );
    await editor.keyboard.press("Control+z");
    await editor.waitForFunction(
      () =>
        !document.querySelector(".page .textLayer")?.textContent.includes("GRUPO_áβ_123") &&
        document.querySelector(".page .textLayer")?.textContent.includes("ORIGINAL_CHILD"),
    );
    await editor.keyboard.press("Control+y");
    await editor.waitForFunction(() =>
      document.querySelector(".page .textLayer")?.textContent.includes("GRUPO_áβ_123"),
    );
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-form-objects-saved.png"),
      animations: "disabled",
    });
    await editor
      .getByRole("group", { name: "edipdf-form-objects.pdf", exact: true })
      .getByTitle("Fechar (Ctrl+W)", { exact: true })
      .click();
    assert.deepEqual(await readFile(groupPath), groupOriginal);
    await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
    console.log(
      "Verified native Form occurrence isolation, internal Unicode/font editing, saved content, shared peer pixels, fields, undo/redo and preserved original",
    );
    const paragraphPath = join(fixture, "..", "paragraph-editor.pdf"),
      paragraphOriginal = await readFile(paragraphPath),
      paragraphText =
        "CAIXA_NATIVA_123 com palavras que quebram dentro da caixa.\nSegundo parágrafo com edição áβ.";
    response = responder("Open", paragraphPath);
    await editor.keyboard.press("Control+o");
    const paragraphOpened = await response;
    if (paragraphOpened) throw paragraphOpened;
    await editor.locator(".tab-name").filter({ hasText: "paragraph-editor.pdf" }).waitFor();
    await command("caixa de texto e parágrafos");
    const paragraphDialog = editor.getByRole("dialog", {
      name: "Caixa de texto e parágrafos",
      exact: true,
    });
    await paragraphDialog.getByLabel("Texto da caixa", { exact: true }).fill(paragraphText);
    await paragraphDialog.getByLabel("Posição X (pt)", { exact: true }).fill("50");
    await paragraphDialog.getByLabel("Posição Y (pt)", { exact: true }).fill("100");
    await paragraphDialog.getByLabel("Largura da caixa (pt)", { exact: true }).fill("300");
    await paragraphDialog.getByLabel("Lista", { exact: true }).selectOption("numbered");
    response = responder("Open", join(fixture, "..", "local-font.ttf"));
    await paragraphDialog
      .getByRole("button", { name: "Escolher fonte TrueType…", exact: true })
      .click();
    const paragraphFontChosen = await response;
    if (paragraphFontChosen) throw paragraphFontChosen;
    await paragraphDialog.getByRole("button", { name: "Usar Noto Sans", exact: true }).waitFor();
    await paragraphDialog.getByLabel("Altura da caixa (pt)", { exact: true }).fill("20");
    await paragraphDialog.getByRole("alert").filter({ hasText: "ultrapassa" }).waitFor();
    assert.equal(
      await paragraphDialog
        .getByRole("button", { name: "Aplicar caixa de texto", exact: true })
        .isEnabled(),
      false,
    );
    await paragraphDialog.getByLabel("Altura da caixa (pt)", { exact: true }).fill("300");
    await paragraphDialog
      .getByRole("button", { name: "Aplicar caixa de texto", exact: true })
      .click();
    await paragraphDialog.waitFor({ state: "detached" });
    const paragraphOverlay = editor.locator(".page .annot-paragraph svg");
    await paragraphOverlay.waitFor();
    assert.ok((await paragraphOverlay.textContent())?.includes("CAIXA_NATIVA_123"));
    await editor.keyboard.press("Control+z");
    await paragraphOverlay.waitFor({ state: "detached" });
    await editor.keyboard.press("Control+y");
    await paragraphOverlay.waitFor();
    await editor.getByRole("button", { name: "Selecionar", exact: true }).click();
    await paragraphOverlay.click({ position: { x: 25, y: 20 } });
    await editor.getByRole("button", { name: "Editar caixa de texto", exact: true }).click();
    const editParagraph = editor.getByRole("dialog", {
      name: "Editar caixa de texto",
      exact: true,
    });
    await editParagraph.getByLabel("Alinhamento", { exact: true }).selectOption("right");
    await editParagraph
      .getByRole("button", { name: "Aplicar caixa de texto", exact: true })
      .click();
    await editParagraph.waitFor({ state: "detached" });
    const paragraphFrame = editor.locator(".page .annot-paragraph"),
      cornerHandle = editor.getByRole("button", {
        name: "Redimensionar: canto inferior direito",
        exact: true,
      }),
      initialFrameWidth = await paragraphFrame.evaluate((element) => {
        if (!(element instanceof HTMLElement)) throw new Error("Missing paragraph frame.");
        return Number.parseFloat(element.style.width);
      }),
      paragraphScale = initialFrameWidth / 300;
    const waitFrame = async (width: number, height: number) => {
      await editor.waitForFunction(
        ({ width, height, scale }) => {
          const frame = document.querySelector<HTMLElement>(".page .annot-paragraph");
          return (
            frame &&
            Math.abs(Number.parseFloat(frame.style.width) - width * scale) < 0.1 &&
            Math.abs(Number.parseFloat(frame.style.height) - height * scale) < 0.1 &&
            !document.querySelector('.sel-handle[aria-busy="true"]')
          );
        },
        { width, height, scale: paragraphScale },
      );
    };
    await cornerHandle.focus();
    await cornerHandle.press("Shift+ArrowRight");
    await waitFrame(310, 300);
    await editor.keyboard.press("Control+z");
    await waitFrame(300, 300);
    await editor.keyboard.press("Control+y");
    await waitFrame(310, 300);
    await paragraphFrame.click({ position: { x: 25, y: 20 } });
    await dragFixturePointer(editor, cornerHandle, 20 * paragraphScale, 30 * paragraphScale);
    await waitFrame(330, 330);
    await dragFixturePointer(editor, cornerHandle, -100 * paragraphScale, 0, "pointer");
    await waitFrame(330, 330);
    await dragFixturePointer(editor, cornerHandle, -100 * paragraphScale, 0, "blur");
    await waitFrame(330, 330);
    await cornerHandle.evaluate((element) => {
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }),
      );
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await waitFrame(330, 330);
    await editor.getByRole("button", { name: "Retângulo", exact: true }).click();
    await dragFixturePointer(editor, editor.locator(".page .annot-layer"), 20, 20, "pointer");
    assert.equal(
      await editor.locator(".annot-layer rect[data-annot]").count(),
      0,
      "Cancelled drawing must not create the default click rectangle.",
    );
    await editor.getByRole("button", { name: "Selecionar", exact: true }).click();
    await paragraphFrame.click({ position: { x: 25, y: 20 } });
    await waitFrame(330, 330);
    const bottomHandle = editor.getByRole("button", {
      name: "Redimensionar: borda inferior",
      exact: true,
    });
    await dragFixturePointer(editor, bottomHandle, 0, -310 * paragraphScale);
    await editor.locator(".toast.error").filter({ hasText: "ultrapassa" }).waitFor();
    await waitFrame(330, 330);
    await paragraphOverlay.waitFor();
    assert.ok((await paragraphOverlay.textContent())?.includes("CAIXA_NATIVA_123"));
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-paragraph-handles.png"),
      animations: "disabled",
    });
    const paragraphCopyPath = join(compressedPath, "..", "edipdf-textbox.pdf");
    response = responder("Save", paragraphCopyPath);
    await editor.keyboard.press("Control+Shift+s");
    const paragraphSaved = await response;
    if (paragraphSaved) throw paragraphSaved;
    await editor.locator(".tab-name").filter({ hasText: "edipdf-textbox.pdf" }).waitFor();
    await editor.locator(".busy").waitFor({ state: "hidden" });
    const paragraphSavedBytes = await readFile(paragraphCopyPath),
      paragraphPdf = await PDFDocument.load(paragraphSavedBytes),
      savedParagraphAnnotations = takeEditableAnnotations(paragraphPdf),
      savedParagraph = savedParagraphAnnotations.get(0)?.find((a) => a.kind === "paragraph");
    assert.equal(paragraphPdf.getPageCount(), 1);
    assert.equal(
      paragraphPdf.getForm().getTextField("paragraph_preserved").getText(),
      "PRESERVADO",
    );
    assert.ok(savedParagraph?.kind === "paragraph");
    assert.equal(savedParagraphAnnotations.get(0)?.length, 1);
    assert.equal(savedParagraph.text, paragraphText);
    assert.equal(savedParagraph.list, "numbered");
    assert.equal(savedParagraph.align, "right");
    assert.ok(Math.abs(savedParagraph.w - 330) < 0.01);
    assert.ok(Math.abs(savedParagraph.h - 330) < 0.01);
    assert.match(savedParagraph.fontData?.name ?? "", /Italic/);
    await editor
      .getByRole("group", { name: "edipdf-textbox.pdf", exact: true })
      .getByTitle("Fechar (Ctrl+W)", { exact: true })
      .click();
    const reopenedParagraphPath = join(fixture, "..", "paragraph-reopen.pdf");
    await writeFile(reopenedParagraphPath, paragraphSavedBytes);
    response = responder("Open", reopenedParagraphPath);
    await editor.keyboard.press("Control+o");
    const paragraphReopened = await response;
    if (paragraphReopened) throw paragraphReopened;
    await editor.locator(".tab-name").filter({ hasText: "paragraph-reopen.pdf" }).waitFor();
    await paragraphOverlay.waitFor();
    assert.ok((await paragraphOverlay.textContent())?.includes("CAIXA_NATIVA_123"));
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-autoria-paragraph.png"),
      animations: "disabled",
    });
    await command("editar texto original");
    const cropDialog = editor.getByRole("dialog", { name: "Editar conteúdo do PDF", exact: true });
    const imageOption = cropDialog.getByRole("option").filter({ hasText: "Imagem" });
    await imageOption.waitFor({ state: "attached" });
    const imageIndex = await imageOption.getAttribute("value");
    assert.ok(imageIndex);
    await cropDialog.getByLabel("Objeto original", { exact: true }).selectOption(imageIndex);
    await cropDialog.getByLabel("Início X da imagem (%)", { exact: true }).fill("50");
    await cropDialog.getByLabel("Largura da imagem (%)", { exact: true }).fill("50");
    await cropDialog
      .getByRole("img", { name: "Área da imagem conservada pelo recorte", exact: true })
      .waitFor();
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-autoria-image-crop.png"),
      animations: "disabled",
    });
    await cropDialog
      .getByRole("button", { name: "Aplicar recorte da imagem", exact: true })
      .click();
    await cropDialog.waitFor({ state: "detached" });
    await editor.locator(".busy").waitFor({ state: "hidden" });
    const croppedCopyPath = join(compressedPath, "..", "edipdf-cropped.pdf");
    response = responder("Save", croppedCopyPath);
    await editor.keyboard.press("Control+Shift+s");
    const croppedSaved = await response;
    if (croppedSaved) throw croppedSaved;
    await editor.locator(".tab-name").filter({ hasText: "edipdf-cropped.pdf" }).waitFor();
    await editor.locator(".busy").waitFor({ state: "hidden" });
    const croppedBytes = await readFile(croppedCopyPath),
      croppedEngine = await LocalPdfEngine.create(
        await readFile(createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm")),
      ),
      croppedImage = croppedEngine.imagePixels(croppedBytes, 0, Number(imageIndex)),
      croppedPdf = await PDFDocument.load(croppedBytes);
    assert.deepEqual([croppedImage.width, croppedImage.height], [4, 6]);
    const expectedPixels = new Uint8Array(4 * 6 * 4);
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 4; x++)
        expectedPixels.set([(x + 4) * 30, y * 40, 100, 255], (y * 4 + x) * 4);
    assert.equal(Buffer.compare(croppedImage.pixels, expectedPixels), 0);
    assert.equal(croppedPdf.getForm().getTextField("paragraph_preserved").getText(), "PRESERVADO");
    assert.equal(
      takeEditableAnnotations(croppedPdf)
        .get(0)
        ?.find((a) => a.kind === "paragraph")?.text,
      paragraphText,
    );
    await editor
      .getByRole("group", { name: "edipdf-cropped.pdf", exact: true })
      .getByTitle("Fechar (Ctrl+W)", { exact: true })
      .click();
    assert.deepEqual(await readFile(paragraphPath), paragraphOriginal);
    await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
    console.log(
      "Verified native paragraph overflow refusal, custom font, wrapping/numbered list, alignment edit, undo/redo, saved/reopened appearance, actual cropped image pixels and preserved original field/source",
    );
  } catch (failure) {
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-autoria-failure.png"),
      animations: "disabled",
    });
    console.log("Owned authoring fixture diagnostic", await editor.locator("body").innerText());
    throw failure;
  }
  await seedLease(application, 300);
  const redactSearchPath = join(fixture, "..", "redact-search.pdf"),
    redactSearchOriginal = await readFile(redactSearchPath);
  response = responder("Open", redactSearchPath);
  await editor.keyboard.press("Control+o");
  const redactSearchOpened = await response;
  if (redactSearchOpened) throw redactSearchOpened;
  await editor.locator(".tab-name").filter({ hasText: "redact-search.pdf" }).waitFor();
  await command("remover conteúdo por busca");
  const redactSearchDialog = editor.getByRole("dialog", {
    name: "Remover conteúdo por busca",
    exact: true,
  });
  await redactSearchDialog.getByLabel("Texto a remover", { exact: true }).fill("SIGILO");
  await redactSearchDialog
    .getByRole("button", { name: "Pesquisar ocorrências", exact: true })
    .click();
  await redactSearchDialog.getByRole("status").filter({ hasText: "2 ocorrência(s)" }).waitFor();
  await redactSearchDialog.getByLabel("Remover ocorrência 1", { exact: true }).check();
  await redactSearchDialog
    .getByRole("img", { name: "Prévia da ocorrência na página 1", exact: true })
    .waitFor();
  assert.equal(
    await redactSearchDialog
      .getByRole("button", { name: "Remover ocorrências selecionadas", exact: true })
      .isEnabled(),
    false,
  );
  await redactSearchDialog
    .getByLabel("Conferi as ocorrências selecionadas e os efeitos da remoção", { exact: true })
    .check();
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-autoria-search-redaction.png"),
    animations: "disabled",
  });
  await redactSearchDialog
    .getByRole("button", { name: "Remover ocorrências selecionadas", exact: true })
    .click();
  await redactSearchDialog.waitFor({ state: "detached" });
  await editor.locator(".busy").waitFor({ state: "hidden" });
  const redactedSearchCopyPath = join(compressedPath, "..", "edipdf-redacted-search.pdf");
  response = responder("Save", redactedSearchCopyPath);
  await editor.keyboard.press("Control+s");
  const redactedSearchSaved = await response;
  if (redactedSearchSaved) throw redactedSearchSaved;
  await editor.locator(".tab-name").filter({ hasText: "edipdf-redacted-search.pdf" }).waitFor();
  await editor.locator(".busy").waitFor({ state: "hidden" });
  const redactedSearchBytes = await readFile(redactedSearchCopyPath),
    redactedSearchPdf = await PDFDocument.load(redactedSearchBytes),
    redactedSearchEngine = await LocalPdfEngine.create(
      await readFile(createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm")),
    ),
    redactedSearchText = redactedSearchEngine.textDocument(redactedSearchBytes, {
      includeAnnotations: true,
    });
  assert.doesNotMatch(
    redactedSearchText.pages[0]?.glyphs.map((g) => g.text).join("") ?? "",
    /SIGILO/,
  );
  assert.match(redactedSearchText.pages[0]?.glyphs.map((g) => g.text).join("") ?? "", /PUBLICO/);
  assert.match(
    redactedSearchText.pages[1]?.glyphs.map((g) => g.text).join("") ?? "",
    /SIGILO MANTIDO/,
  );
  assert.equal(redactedSearchPdf.getTitle(), undefined);
  assert.equal(redactedSearchPdf.getForm().getFields().length, 0);
  assert.deepEqual(await readFile(redactSearchPath), redactSearchOriginal);
  await editor
    .getByRole("group", { name: "edipdf-redacted-search.pdf", exact: true })
    .getByTitle("Fechar (Ctrl+W)", { exact: true })
    .click();
  await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
  console.log(
    "Verified native search redaction selection/geometry/confirmation, forced copy, selected occurrence removed, retained public/unselected text, sanitized metadata/static fields and unchanged original",
  );
  await seedLease(application, 300);
  await command("Proteger cópia por senha");
  const security = editor.getByRole("dialog", {
    name: "Proteger uma cópia por senha",
    exact: true,
  });
  const openingPassword = `${"α".repeat(63)}x`,
    ownerPassword = "native-password-owner";
  await security.getByLabel("Senha de abertura", { exact: true }).fill("α".repeat(64));
  await security.getByLabel("Confirmar senha de abertura", { exact: true }).fill("α".repeat(64));
  await security
    .getByLabel("Senha diferente para administração", { exact: true })
    .fill(ownerPassword);
  await security.getByRole("button", { name: "Salvar cópia protegida…", exact: true }).click();
  await security.getByRole("alert").filter({ hasText: "127 bytes UTF-8" }).waitFor();
  await security.getByLabel("Senha de abertura", { exact: true }).fill("é");
  await security.getByLabel("Confirmar senha de abertura", { exact: true }).fill("é");
  await security.getByLabel("Senha diferente para administração", { exact: true }).fill("Ã©");
  await security.getByRole("button", { name: "Salvar cópia protegida…", exact: true }).click();
  await security.getByRole("alert").filter({ hasText: "equivalentes" }).waitFor();
  await security.getByLabel("Senha de abertura", { exact: true }).fill(openingPassword);
  await security.getByLabel("Confirmar senha de abertura", { exact: true }).fill(openingPassword);
  await security
    .getByLabel("Senha diferente para administração", { exact: true })
    .fill(ownerPassword);
  const securedPath = join(compressedPath, "..", "edipdf-passwords.pdf");
  response = responder("Save", securedPath);
  await security.getByRole("button", { name: "Salvar cópia protegida…", exact: true }).click();
  const securedSaved = await response;
  if (securedSaved) throw securedSaved;
  await security.waitFor({ state: "detached" });
  const securedBytes = new Uint8Array(await readFile(securedPath));
  const securedEngine = await LocalPdfEngine.create(
    await readFile(createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm")),
  );
  assert.equal(securedEngine.inspect(securedBytes, openingPassword).ownerUnlocked, false);
  assert.equal(securedEngine.inspect(securedBytes, ownerPassword).ownerUnlocked, true);
  const { getDocument: independentPdfReader } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const securedTask = independentPdfReader({
    data: new Uint8Array(securedBytes),
    password: openingPassword,
  });
  try {
    assert.ok((await securedTask.promise).numPages > 0);
  } finally {
    await securedTask.destroy();
  }
  await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).waitFor();
  console.log(
    "Verified native password validation, Latin-1 owner alias refusal and a saved 127-byte Unicode AES-256 password independently opened without owner privileges",
  );
  try {
    const formsPath = join(fixture, "..", "forms-authoring.pdf"),
      formsOriginal = await readFile(formsPath);
    response = responder("Open", formsPath);
    await editor.keyboard.press("Control+o");
    const formsOpened = await response;
    if (formsOpened) throw formsOpened;
    await editor.locator(".tab-name").filter({ hasText: "forms-authoring.pdf" }).waitFor();
    await editor.getByRole("textbox", { name: "primeiro", exact: true }).fill("CAMPO_áβ_123");
    await editor.getByRole("textbox", { name: "primeiro", exact: true }).press("Tab");
    await command("Preparar formulário");
    const customForms = editor.getByRole("dialog", { name: "Preparar formulário", exact: true });
    await customForms.getByText("Ordem manual de tabulação — página 1", { exact: true }).click();
    await customForms
      .getByRole("button", { name: "Mover terceiro — controle 3 para cima", exact: true })
      .click();
    await customForms
      .getByRole("button", { name: "Mover terceiro — controle 3 para cima", exact: true })
      .click();
    await customForms
      .getByRole("button", { name: "Aplicar ordem de tabulação", exact: true })
      .click();
    await editor.waitForFunction(() =>
      document
        .querySelector("dialog[open] .modal-body")
        ?.textContent.includes("terceiro — controle 1"),
    );
    await customForms
      .locator("ul.navigation-list > li")
      .filter({ has: editor.getByText("primeiro", { exact: true }) })
      .getByRole("button", { name: "Configurar", exact: true })
      .click();
    response = responder("Open", join(fixture, "..", "local-font.ttf"));
    await customForms
      .getByRole("button", { name: "Escolher fonte dos campos…", exact: true })
      .click();
    const formsFontSelected = await response;
    if (formsFontSelected) throw formsFontSelected;
    await customForms
      .getByRole("button", { name: "Usar Noto Sans nos campos", exact: true })
      .waitFor();
    await customForms
      .getByRole("button", { name: "Aplicar fonte ao campo selecionado", exact: true })
      .click();
    await customForms
      .locator(".modal-foot")
      .getByRole("button", { name: "Fechar", exact: true })
      .click();
    await customForms.waitFor({ state: "detached" });
    await editor.waitForFunction(
      () =>
        Array.from(document.querySelectorAll(".form-layer input"))
          .map((element) => element.getAttribute("aria-label"))
          .join(",") === "terceiro,primeiro,segundo",
    );
    const expectedWidgetFamily = `EdiLocalFont-${createHash("sha256")
      .update(await readFile(join(fixture, "..", "local-font.ttf")))
      .digest("hex")}`;
    await editor.waitForFunction((expectedWidgetFamily) => {
      const field = document.querySelector<HTMLInputElement>(
        '.form-layer input[aria-label="primeiro"]',
      );
      return (
        !!field &&
        !field.disabled &&
        getComputedStyle(field).fontFamily.includes(expectedWidgetFamily)
      );
    }, expectedWidgetFamily);
    await editor.evaluate(() => {
      const root = document.documentElement,
        trace: unknown[] = [];
      const record = (event: Event) => {
        if (trace.length >= 30) return;
        const target = event.target instanceof HTMLElement ? event.target : null,
          first = document.querySelector<HTMLInputElement>(
            '.form-layer input[aria-label="primeiro"]',
          );
        trace.push({
          type: event.type,
          target: target?.getAttribute("aria-label") ?? target?.tagName,
          key: event instanceof KeyboardEvent ? event.key : undefined,
          firstDisabled: first?.disabled,
          firstPresent: !!first,
          active: document.activeElement?.getAttribute("aria-label"),
        });
        root.setAttribute("data-fixture-focus-trace", JSON.stringify(trace));
      };
      const events = ["keydown", "keyup", "focusin", "focusout"];
      for (const name of events) window.addEventListener(name, record, true);
      root.addEventListener(
        "edipdf-fixture-focus-finished",
        () => {
          for (const name of events) window.removeEventListener(name, record, true);
          root.removeAttribute("data-fixture-focus-trace");
        },
        { once: true },
      );
    });
    await editor.getByRole("textbox", { name: "terceiro", exact: true }).focus();
    assert.equal(
      await editor
        .getByRole("textbox", { name: "terceiro", exact: true })
        .evaluate((element) => element === document.activeElement),
      true,
      JSON.stringify(await fixtureFocusState(editor)),
    );
    await editor.keyboard.press("Tab");
    assert.equal(
      await editor
        .getByRole("textbox", { name: "primeiro", exact: true })
        .evaluate((element) => element === document.activeElement),
      true,
      JSON.stringify(await fixtureFocusState(editor)),
    );
    await editor.keyboard.press("Tab");
    assert.equal(
      await editor
        .getByRole("textbox", { name: "segundo", exact: true })
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await editor.getByRole("textbox", { name: "primeiro", exact: true }).fill("CAMPO_áβ_123_Ж");
    await editor.evaluate(() =>
      document.documentElement.dispatchEvent(new Event("edipdf-fixture-focus-finished")),
    );
    await editor.getByRole("textbox", { name: "primeiro", exact: true }).press("Tab");
    const formsCopyPath = join(compressedPath, "..", "edipdf-forms-font-order.pdf");
    response = responder("Save", formsCopyPath);
    await editor.keyboard.press("Control+Shift+s");
    const formsSaved = await response;
    if (formsSaved) throw formsSaved;
    await editor.locator(".tab-name").filter({ hasText: "edipdf-forms-font-order.pdf" }).waitFor();
    await editor.locator(".busy").waitFor({ state: "hidden" });
    const formsSavedPdf = await PDFDocument.load(await readFile(formsCopyPath)),
      formsOriginalPdf = await PDFDocument.load(formsOriginal);
    assert.deepEqual(
      pageWidgetTabOrder(formsSavedPdf, 0).map((entry) => entry.name),
      ["terceiro", "primeiro", "segundo"],
    );
    assert.equal(formsSavedPdf.getForm().getTextField("primeiro").getText(), "CAMPO_áβ_123_Ж");
    assert.ok(
      formsSavedPdf.context
        .enumerateIndirectObjects()
        .some(
          ([, value]) =>
            value instanceof PDFDict &&
            /NotoSans.*Italic/.test(String(value.get(PDFName.of("BaseFont")))),
        ),
    );
    const formAppearance = (document: PDFDocument, name: string): Uint8Array => {
      const widget = document.getForm().getTextField(name).acroField.getWidgets()[0];
      assert.ok(widget);
      const ap = widget.dict.lookup(PDFName.of("AP"));
      assert.ok(ap instanceof PDFDict);
      const stream = ap.lookup(PDFName.of("N"));
      assert.ok(stream instanceof PDFRawStream);
      return stream.getContents();
    };
    const fullDescriptor = formsSavedPdf.context
      .enumerateIndirectObjects()
      .map(([, value]) => value)
      .find(
        (value) =>
          value instanceof PDFDict &&
          /NotoSans.*Italic/.test(String(value.get(PDFName.of("FontName")))) &&
          value.has(PDFName.of("FontFile2")),
      );
    assert.ok(fullDescriptor instanceof PDFDict);
    const fullFontStream = fullDescriptor.lookup(PDFName.of("FontFile2"));
    assert.ok(fullFontStream instanceof PDFRawStream);
    assert.equal(
      Buffer.compare(
        decodePDFRawStream(fullFontStream).decode(),
        await readFile(join(fixture, "..", "local-font.ttf")),
      ),
      0,
    );
    assert.equal(
      Buffer.compare(
        formAppearance(formsSavedPdf, "segundo"),
        formAppearance(formsOriginalPdf, "segundo"),
      ),
      0,
    );
    assert.deepEqual(await readFile(formsPath), formsOriginal);
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-autoria-forms-font-order.png"),
      animations: "disabled",
    });
    await editor
      .getByRole("group", { name: "edipdf-forms-font-order.pdf", exact: true })
      .getByTitle("Fechar (Ctrl+W)", { exact: true })
      .click();
    await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
    console.log(
      "Verified native manual widget order, actual Tab navigation, chosen TrueType font in Unicode field output, preserved peer appearance and unchanged form original",
    );
  } catch (failure) {
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-forms-complement-failure.png"),
      animations: "disabled",
    });
    console.log(
      "Owned form authoring fixture diagnostic",
      await editor.locator("body").innerText(),
    );
    throw failure;
  }
  await seedLease(application, 300);
  const choicesPath = join(fixture, "..", "forms-choice.pdf"),
    choicesOriginal = await readFile(choicesPath);
  response = responder("Open", choicesPath);
  await editor.keyboard.press("Control+o");
  const choicesOpened = await response;
  if (choicesOpened) throw choicesOpened;
  await editor.locator(".tab-name").filter({ hasText: "forms-choice.pdf" }).waitFor();
  const stateChoice = editor.getByRole("combobox", { name: "estado", exact: true });
  await stateChoice
    .getByRole("option", { name: "Rio de Janeiro", exact: true })
    .waitFor({ state: "attached" });
  assert.equal(await stateChoice.inputValue(), "INTERNAL_SP");
  assert.equal(
    await stateChoice.getByRole("option", { name: "INTERNAL_RJ", exact: true }).count(),
    0,
  );
  await stateChoice.selectOption({ label: "Rio de Janeiro" });
  await editor
    .getByRole("listbox", { name: "estados", exact: true })
    .selectOption(["INTERNAL_SP", "INTERNAL_MG"]);
  assert.equal(
    await editor.getByRole("combobox", { name: "somente_leitura", exact: true }).isDisabled(),
    true,
  );
  await command("Preparar formulário");
  const choicesEditor = editor.getByRole("dialog", { name: "Preparar formulário", exact: true });
  await choicesEditor
    .locator("ul.navigation-list > li")
    .filter({ has: editor.getByText("estado", { exact: true }) })
    .getByRole("button", { name: "Configurar", exact: true })
    .click();
  assert.equal(
    await choicesEditor.getByLabel("Valor interno da opção 2", { exact: true }).inputValue(),
    "INTERNAL_RJ",
  );
  await choicesEditor.getByLabel("Rótulo da opção 2", { exact: true }).fill("Rio β revisado");
  const invalidChoiceControls = await choicesEditor.locator("form input").evaluateAll((inputs) =>
    inputs.flatMap((input) =>
      input instanceof HTMLInputElement && !input.validity.valid
        ? [
            {
              type: input.type,
              value: input.value,
              step: input.step,
              message: input.validationMessage,
            },
          ]
        : [],
    ),
  );
  assert.deepEqual(
    invalidChoiceControls,
    [],
    "Imported fractional PDF geometry must remain valid in the configuration form",
  );
  await choicesEditor.getByRole("button", { name: "Aplicar configuração", exact: true }).click();
  await choicesEditor.getByRole("heading", { name: "Novo campo", exact: true }).waitFor();
  await choicesEditor
    .locator(".modal-foot")
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  await choicesEditor.waitFor({ state: "detached" });
  await editor
    .getByRole("combobox", { name: "estado", exact: true })
    .getByRole("option", { name: "Rio β revisado", exact: true })
    .waitFor({ state: "attached" });
  assert.equal(
    await editor.getByRole("combobox", { name: "estado", exact: true }).inputValue(),
    "INTERNAL_RJ",
  );
  const choicesCopyPath = join(compressedPath, "..", "edipdf-forms-choice.pdf");
  response = responder("Save", choicesCopyPath);
  await editor.keyboard.press("Control+Shift+s");
  const choicesSaved = await response;
  if (choicesSaved) throw choicesSaved;
  await editor.locator(".tab-name").filter({ hasText: "edipdf-forms-choice.pdf" }).waitFor();
  await editor.locator(".busy").waitFor({ state: "hidden" });
  const choicesCopy = await PDFDocument.load(await readFile(choicesCopyPath));
  assert.deepEqual(choicesCopy.getForm().getDropdown("estado").getSelected(), ["INTERNAL_RJ"]);
  assert.deepEqual(choicesCopy.getForm().getOptionList("estados").getSelected(), [
    "INTERNAL_SP",
    "INTERNAL_MG",
  ]);
  assert.equal(
    choicesCopy.getForm().getDropdown("estado").acroField.getOptions()[1]?.display?.decodeText(),
    "Rio β revisado",
  );
  assert.equal(choicesCopy.getForm().getDropdown("estado").isEditable(), false);
  assert.deepEqual(await readFile(choicesPath), choicesOriginal);
  choicesCopy.getForm().flatten({ updateFieldAppearances: false });
  const choiceAppearanceTask = independentPdfReader({
    data: new Uint8Array(await choicesCopy.save({ updateFieldAppearances: false })),
    standardFontDataUrl,
  });
  try {
    const page = await (await choiceAppearanceTask.promise).getPage(1),
      text = await page.getTextContent();
    assert.match(
      text.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      /Rio β revisado/,
    );
  } finally {
    await choiceAppearanceTask.destroy();
  }
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-forms-choice.png"),
    animations: "disabled",
  });
  await editor
    .getByRole("group", { name: "edipdf-forms-choice.pdf", exact: true })
    .getByTitle("Fechar (Ctrl+W)", { exact: true })
    .click();
  await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
  console.log(
    "Verified native labeled choices, raw export values, multiple selection, read-only control, label authoring and saved independently readable appearance without changing the source",
  );
  await seedLease(application, 300);
  const strategiesPath = join(fixture, "..", "split-strategies.pdf"),
    strategiesOriginal = await readFile(strategiesPath);
  response = responder("Open", strategiesPath);
  await editor.keyboard.press("Control+o");
  const strategiesOpened = await response;
  if (strategiesOpened) throw strategiesOpened;
  await editor.locator(".tab-name").filter({ hasText: "split-strategies.pdf" }).waitFor();
  for (const mode of ["bookmarks", "size"]) {
    await command("dividir documento");
    const strategyDialog = editor.getByRole("dialog", { name: "Dividir documento", exact: true });
    await strategyDialog.getByLabel("Dividir por", { exact: true }).selectOption(mode);
    if (mode === "size") {
      await strategyDialog.getByLabel("Máximo por arquivo (MB)", { exact: true }).fill("0.001");
      await strategyDialog.getByRole("button", { name: "Preparar lote", exact: true }).click();
      await strategyDialog.getByRole("alert").filter({ hasText: "página 1" }).waitFor();
      await strategyDialog.getByLabel("Máximo por arquivo (MB)", { exact: true }).fill("0.006");
    }
    await strategyDialog.getByRole("button", { name: "Preparar lote", exact: true }).click();
    await waitBatchPreview(editor, strategyDialog, "Prévia do arquivo parte-001.pdf, página 1");
    const snapshot = await editor.evaluate(async () => {
      const tasks = await window.api.tasks.list();
      const selected = tasks.tasks.find(
        (task) => task.kind === "batch" && task.name === "split-strategies — partes",
      );
      if (!selected) throw new Error("Missing protected strategy result");
      const loaded = await window.api.tasks.load(selected.id);
      return { bytes: Array.from(loaded.result.bytes), detail: loaded.result.detail };
    });
    const strategyDetail = batchDetailSchema.parse(snapshot.detail);
    assert.equal(strategyDetail.settings.operation, "split");
    if (strategyDetail.settings.operation !== "split") throw new Error("Expected a split result");
    assert.equal(strategyDetail.settings.strategy?.kind, mode);
    assert.deepEqual(
      strategyDetail.files.flatMap((file) => file.pages),
      [1, 2, 3, 4, 5, 6],
    );
    if (mode === "bookmarks")
      assert.deepEqual(
        strategyDetail.files.map((file) => file.pages),
        [[1], [2, 3], [4, 5, 6]],
      );
    else {
      assert.ok(strategyDetail.files.length > 1);
      assert.ok(
        strategyDetail.files.every((file) => file.bytes <= Math.floor(0.006 * 1024 * 1024)),
      );
    }
    const archived = await readBatchArchive(new Uint8Array(snapshot.bytes), strategyDetail);
    const existingFolders = new Set(await readdir(outputFolder));
    await strategyDialog
      .getByRole("checkbox", { name: "Conferi os arquivos e quero salvar o lote.", exact: true })
      .check();
    response = responder("Folder", outputFolder);
    await strategyDialog
      .getByRole("button", { name: "Escolher pasta e salvar lote", exact: true })
      .click();
    const strategySaved = await response;
    if (strategySaved) throw strategySaved;
    await strategyDialog.waitFor({ state: "detached" });
    const created = (await readdir(outputFolder)).filter((name) => !existingFolders.has(name));
    assert.equal(created.length, 1);
    const folder = created[0];
    assert.ok(folder);
    for (const file of strategyDetail.files) {
      const saved: Uint8Array = await readFile(join(outputFolder, folder, file.name));
      assert.deepEqual(new Uint8Array(saved), archived.get(file.name));
      assert.equal((await PDFDocument.load(saved)).getPageCount(), file.pages.length);
    }
  }
  assert.deepEqual(await readFile(strategiesPath), strategiesOriginal);
  await editor
    .getByRole("group", { name: "split-strategies.pdf", exact: true })
    .getByTitle("Fechar (Ctrl+W)", { exact: true })
    .click();
  await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
  console.log(
    "Verified native bookmark and actual-size splitting, oversized-page refusal, resolved protected plans, complete page coverage and exclusive saved folders with exact archive bytes",
  );
  await seedLease(application, 300);
  await verifyNativeDecorations({
    editor,
    directory: join(fixture, ".."),
    outputDirectory: join(compressedPath, ".."),
    command,
    respond: responder,
  });
  await verifyNativeSignatures({
    editor,
    directory: join(fixture, ".."),
    outputDirectory: join(compressedPath, ".."),
    command,
    respond: responder,
  });
  await seedLease(application, 300);
  for (const allowed of [true, false]) {
    const name = allowed ? "readonly.pdf" : "readonly-denied.pdf";
    response = responder("Open", join(fixture, "..", name));
    await editor.keyboard.press("Control+o");
    const picked = await response;
    if (picked) throw picked;
    const password = editor.getByRole("dialog", { name: "PDF protegido por senha", exact: true });
    await password.getByPlaceholder("Senha", { exact: true }).fill("native-print-reader");
    await password.getByRole("button", { name: "Abrir", exact: true }).click();
    await password.waitFor({ state: "detached" });
    await editor.locator(".tab-name").filter({ hasText: name }).waitFor();
    await command("imprimir documento");
    let restricted = editor.getByRole("dialog", { name: "Preparar impressão", exact: true });
    await restricted.getByLabel("Páginas de impressão restrita", { exact: true }).fill("2");
    await restricted
      .getByRole("button", { name: "Preparar documento como imagens…", exact: true })
      .click();
    if (allowed) {
      await waitBatchPreview(editor, restricted, "Prévia da face 1 preparada para impressão");
      assert.equal(
        await restricted.getByRole("button", { name: "Salvar PDF preparado", exact: true }).count(),
        0,
      );
      await editor.screenshot({
        path: resolve(".cache/edi-native-results/edipdf-lote4-restricted-print.png"),
        animations: "disabled",
      });
      await restricted.getByRole("button", { name: "Continuar depois", exact: true }).click();
      const list = await editor.evaluate(() => window.api.tasks.list()),
        savedPrint = list.tasks.find(
          (task) => task.kind === "printing" && task.name.includes("restrita"),
        );
      assert.ok(savedPrint);
      const protectedPrint = await editor.evaluate(
        (id) => window.api.tasks.load(id),
        savedPrint.id,
      );
      assert.equal(protectedPrint.request.printOnly, true);
      assert.ok(
        protectedPrint.result.detail?.kind === "printing" && protectedPrint.result.detail.printOnly,
      );
      const rasterPdf = await PDFDocument.load(protectedPrint.result.pdf);
      assert.equal(rasterPdf.getPageCount(), 1);
      assert.deepEqual(rasterPdf.getPage(0).getSize(), { width: 216, height: 144 });
      assert.equal(JSON.stringify(protectedPrint.request).includes("native-print-reader"), false);
      await command("tarefas e resultados preparados");
      await editor.getByRole("button", { name: `Revisar ${savedPrint.name}`, exact: true }).click();
      restricted = editor.getByRole("dialog", { name: "Preparar impressão", exact: true });
      await waitBatchPreview(editor, restricted, "Prévia da face 1 preparada para impressão");
      assert.equal(
        await restricted.getByRole("button", { name: "Salvar PDF preparado", exact: true }).count(),
        0,
      );
      await restricted.getByRole("button", { name: "Continuar depois", exact: true }).click();
      await editor.evaluate((id) => window.api.tasks.remove(id), savedPrint.id);
    } else {
      await restricted.getByRole("alert").filter({ hasText: "não permite impressão" }).waitFor();
      assert.equal(await restricted.getByRole("img").count(), 0);
      await restricted.getByRole("button", { name: "Continuar depois", exact: true }).click();
    }
    await editor
      .getByRole("group", { name, exact: true })
      .getByTitle("Fechar (Ctrl+W)", { exact: true })
      .click();
    await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
  }
  console.log(
    "Verified native password-restricted raster printing, protected review resume, physical geometry, no save action and denial when printing is forbidden",
  );
  response = responder("Open", join(fixture, "..", "readonly-many.pdf"));
  await editor.keyboard.press("Control+o");
  const retainedOpened = await response;
  if (retainedOpened) throw retainedOpened;
  const retainedPassword = editor.getByRole("dialog", {
    name: "PDF protegido por senha",
    exact: true,
  });
  await retainedPassword.getByPlaceholder("Senha", { exact: true }).fill("native-print-reader");
  await retainedPassword.getByRole("button", { name: "Abrir", exact: true }).click();
  await retainedPassword.waitFor({ state: "detached" });
  await editor.locator(".tab-name").filter({ hasText: "readonly-many.pdf" }).waitFor();
  await command("imprimir documento");
  const retainedPrinting = editor.getByRole("dialog", { name: "Preparar impressão", exact: true });
  await retainedPrinting
    .getByRole("button", { name: "Preparar documento como imagens…", exact: true })
    .click();
  await retainedPrinting
    .getByRole("status")
    .filter({ hasText: /Preparando imagem \d+ de 80/ })
    .waitFor();
  await retainedPrinting
    .getByRole("button", { name: "Continuar em segundo plano", exact: true })
    .click();
  const retainedTasks = editor.getByRole("dialog", {
    name: "Tarefas e resultados preparados",
    exact: true,
  });
  await retainedTasks
    .getByRole("button", {
      name: "Interromper readonly-many (impressão restrita).pdf",
      exact: true,
    })
    .waitFor();
  await retainedTasks.getByTitle("Fechar", { exact: true }).click();
  await editor
    .getByRole("group", { name: "readonly-many.pdf", exact: true })
    .getByTitle("Fechar (Ctrl+W)", { exact: true })
    .click();
  await command("tarefas e resultados preparados");
  await editor
    .getByRole("button", { name: "Revisar readonly-many (impressão restrita).pdf", exact: true })
    .click();
  const heldReview = editor.getByRole("dialog", { name: "Preparar impressão", exact: true });
  await waitBatchPreview(editor, heldReview, "Prévia da face 1 preparada para impressão");
  await heldReview.getByRole("button", { name: "Próxima", exact: true }).click();
  await waitBatchPreview(editor, heldReview, "Prévia da face 2 preparada para impressão");
  await heldReview.getByRole("button", { name: "Continuar depois", exact: true }).click();
  const heldList = await editor.evaluate(() => window.api.tasks.list()),
    heldTask = heldList.tasks.find(
      (task) => task.name === "readonly-many (impressão restrita).pdf",
    );
  assert.ok(heldTask);
  const heldData = await editor.evaluate((id) => window.api.tasks.load(id), heldTask.id);
  assert.equal(heldData.result.pages, 80);
  assert.equal(heldData.request.printOnly, true);
  await editor.evaluate((id) => window.api.tasks.remove(id), heldTask.id);
  await editor.locator(".tab-name").filter({ hasText: "audit.pdf" }).click();
  console.log(
    "Verified restricted raster printing retains its sources after the original tab closes and finishes eighty pages in background without saving permissions",
  );
  await seedLease(application, 300);
  const convertedDocx = join(compressedPath, "..", "edipdf-converted.docx");
  await command("exportar documento");
  let conversion = editor.getByRole("dialog", { name: "Exportar documento", exact: true });
  await conversion.getByRole("button", { name: "Gerar prévia", exact: true }).click();
  await conversion
    .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
    .waitFor();
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote4-office-export.png"),
    animations: "disabled",
  });
  const pendingOffice = await editor.evaluate(() => window.api.tasks.list());
  assert.equal(pendingOffice.tasks.filter((task) => task.kind === "conversion").length, 1);
  const pendingDirectory = join(
    await application.evaluate(({ app }) => app.getPath("userData")),
    "pending-tasks",
  );
  const pendingId = pendingOffice.tasks.find((task) => task.kind === "conversion")?.id;
  assert.ok(pendingId);
  const preparedCiphertext = await readFile(join(pendingDirectory, `${pendingId}.bin`));
  assert.equal(preparedCiphertext.includes(Buffer.from("BUSCA_")), false);
  assert.equal(preparedCiphertext.includes(Buffer.from("word/document.xml")), false);
  await editor.keyboard.press("Escape");
  await conversion.waitFor({ state: "hidden" });
  await command("tarefas e resultados preparados");
  await editor
    .getByRole("button", { name: "Revisar audit (convertido).docx", exact: true })
    .click();
  conversion = editor.getByRole("dialog", { name: "Retomar conversão preparada", exact: true });
  await conversion
    .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
    .waitFor();
  response = responder("Save", convertedDocx);
  await conversion.getByRole("button", { name: "Salvar cópia convertida", exact: true }).click();
  const officeSave = await response;
  if (officeSave) throw officeSave;
  await conversion.waitFor({ state: "hidden" });
  const exportedOffice = readOfficePackage(await readFile(convertedDocx));
  const exportedText =
    parseOfficeXml(officePart(exportedOffice, "word/document.xml")).documentElement?.textContent ??
    "";
  assert.match(exportedText, /BUSCA_αβγ_123/);
  assert.match(exportedText, /OCR_VERIFICADO/);
  await command("converter arquivo para pdf");
  conversion = editor.getByRole("dialog", { name: "Converter arquivo para PDF", exact: true });
  const officeFixture = join(fixture, "..", "office.docx"),
    convertedPdf = join(compressedPath, "..", "edipdf-converted.pdf");
  response = responder("Open", officeFixture);
  await conversion.getByRole("button", { name: "Escolher arquivo", exact: true }).click();
  const officeOpen = await response;
  if (officeOpen) throw officeOpen;
  await conversion.getByText("office.docx", { exact: true }).waitFor();
  await conversion.getByRole("button", { name: "Gerar prévia", exact: true }).click();
  await conversion
    .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
    .waitFor();
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote4-office-import.png"),
    animations: "disabled",
  });
  response = responder("Save", convertedPdf);
  await conversion.getByRole("button", { name: "Salvar cópia convertida", exact: true }).click();
  const officePdfSave = await response;
  if (officePdfSave) throw officePdfSave;
  await conversion.waitFor({ state: "hidden" });
  assert.equal((await PDFDocument.load(await readFile(convertedPdf))).getPageCount(), 1);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"),
    task = pdfjs.getDocument({
      data: new Uint8Array(await readFile(convertedPdf)),
      useSystemFonts: true,
    });
  try {
    const converted = await task.promise,
      page = await converted.getPage(1),
      content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    assert.match(text, /OFFICE_LOCAL_αβγ/);
    assert.match(text, /João/);
  } finally {
    await task.destroy();
  }
  console.log(
    "Verified local Office worker conversion, real preview, native Office selection and DOCX/PDF output content",
  );
  await command("converter arquivo para pdf");
  conversion = editor.getByRole("dialog", { name: "Converter arquivo para PDF", exact: true });
  response = responder("Open", join(fixture, "..", "rich.rtf"));
  await conversion.getByRole("button", { name: "Escolher arquivo", exact: true }).click();
  const rtfOpen = await response;
  if (rtfOpen) throw rtfOpen;
  await conversion.getByRole("button", { name: "Gerar prévia", exact: true }).click();
  await conversion
    .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
    .waitFor();
  await conversion.getByRole("button", { name: "Largura", exact: true }).click();
  await editor.waitForFunction(() => {
    const frame = document.querySelector(".review-image-frame");
    return frame !== null && frame.scrollHeight > frame.clientHeight;
  });
  const detailZoom = conversion.getByRole("button", { name: "150%", exact: true });
  await detailZoom.focus();
  await detailZoom.press("Tab");
  const previewFrame = conversion.getByRole("region", {
    name: "Área da prévia; use as barras de rolagem para conferir os detalhes",
    exact: true,
  });
  assert.equal(await previewFrame.evaluate((element) => element === document.activeElement), true);
  await previewFrame.press("ArrowDown");
  await editor.waitForFunction(() => {
    const frame = document.querySelector(".review-image-frame");
    return frame !== null && frame.scrollTop > 0;
  });
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote4-rtf-import.png"),
    animations: "disabled",
  });
  const rtfPdf = join(compressedPath, "..", "edipdf-rtf-import.pdf");
  response = responder("Save", rtfPdf);
  await conversion.getByRole("button", { name: "Salvar cópia convertida", exact: true }).click();
  const rtfPdfSaved = await response;
  if (rtfPdfSaved) throw rtfPdfSaved;
  await conversion.waitFor({ state: "hidden" });
  const rtfContent = pdfjs.getDocument({
    data: new Uint8Array(await readFile(rtfPdf)),
    useSystemFonts: true,
  });
  try {
    const page = await (await rtfContent.promise).getPage(1),
      content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    assert.match(text, /RTF_LOCAL_αβγ/);
    assert.match(text, /João e café/);
    assert.match(text, /ULTIMA_LINHA/);
  } finally {
    await rtfContent.destroy();
  }
  await command("exportar documento");
  conversion = editor.getByRole("dialog", { name: "Exportar documento", exact: true });
  await conversion.getByLabel("Formato", { exact: true }).selectOption("rtf");
  await conversion.getByRole("button", { name: "Gerar prévia", exact: true }).click();
  await conversion
    .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
    .waitFor();
  const exportedRtf = join(compressedPath, "..", "edipdf-exported.rtf");
  response = responder("Save", exportedRtf);
  await conversion.getByRole("button", { name: "Salvar cópia convertida", exact: true }).click();
  const rtfSaved = await response;
  if (rtfSaved) throw rtfSaved;
  await conversion.waitFor({ state: "hidden" });
  const rtfDocument = importRtf(new Uint8Array(await readFile(exportedRtf)), "Exported");
  const rtfText = rtfDocument.pages
    .flatMap((page) =>
      page.blocks.flatMap((block) =>
        block.kind === "paragraph" ? block.runs.map((run) => run.text) : [],
      ),
    )
    .join(" ");
  assert.match(rtfText, /BUSCA_αβγ_123/);
  assert.match(rtfText, /OCR_VERIFICADO/);
  await command("exportar documento");
  conversion = editor.getByRole("dialog", { name: "Exportar documento", exact: true });
  await conversion.getByLabel("Formato", { exact: true }).selectOption("odt");
  await conversion.getByRole("button", { name: "Gerar prévia", exact: true }).click();
  await conversion
    .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
    .waitFor();
  const exportedOdt = join(compressedPath, "..", "edipdf-exported.odt");
  response = responder("Save", exportedOdt);
  await conversion.getByRole("button", { name: "Salvar cópia convertida", exact: true }).click();
  const odtSaved = await response;
  if (odtSaved) throw odtSaved;
  await conversion.waitFor({ state: "detached" });
  const odtDocument = importOdt(new Uint8Array(await readFile(exportedOdt)), "Exported");
  const odtText = odtDocument.pages
    .flatMap((page) =>
      page.blocks.flatMap((block) =>
        block.kind === "paragraph" ? block.runs.map((run) => run.text) : [],
      ),
    )
    .join(" ");
  assert.match(odtText, /BUSCA_αβγ_123/);
  assert.match(odtText, /OCR_VERIFICADO/);
  for (const extension of ["odt", "ods"]) {
    await command("converter arquivo para pdf");
    conversion = editor.getByRole("dialog", { name: "Converter arquivo para PDF", exact: true });
    response = responder("Open", join(fixture, "..", `open.${extension}`));
    await conversion.getByRole("button", { name: "Escolher arquivo", exact: true }).click();
    const opened = await response;
    if (opened) throw opened;
    await conversion.getByRole("button", { name: "Gerar prévia", exact: true }).click();
    await conversion
      .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
      .waitFor();
    const converted = join(compressedPath, "..", `edipdf-${extension}-import.pdf`);
    response = responder("Save", converted);
    await conversion.getByRole("button", { name: "Salvar cópia convertida", exact: true }).click();
    const saved = await response;
    if (saved) throw saved;
    await conversion.waitFor({ state: "detached" });
    const convertedPdf = pdfjs.getDocument({
      data: new Uint8Array(await readFile(converted)),
      useSystemFonts: true,
    });
    try {
      const document = await convertedPdf.promise;
      const first = await document.getPage(1),
        content = await first.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      assert.match(text, extension === "odt" ? /ODT_LOCAL_αβγ/ : /αβγ/);
      if (extension === "odt") assert.ok(document.numPages >= 2);
    } finally {
      await convertedPdf.destroy();
    }
  }
  console.log(
    "Verified native RTF import/export workers, real previews, source Unicode and reviewed copies",
  );
  await seedLease(application, 300);
  for (const format of ["pptx", "odp"]) {
    await command("exportar documento");
    conversion = editor.getByRole("dialog", { name: "Exportar documento", exact: true });
    await conversion.getByLabel("Formato", { exact: true }).selectOption(format);
    await conversion.getByRole("button", { name: "Gerar prévia", exact: true }).click();
    await conversion
      .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
      .waitFor();
    assert.ok((await conversion.innerText()).includes("por fluxo"));
    await editor.screenshot({
      path: resolve(`.cache/edi-native-results/edipdf-lote4-${format}-export.png`),
      animations: "disabled",
    });
    const path = join(compressedPath, "..", `edipdf-exported.${format}`);
    response = responder("Save", path);
    await conversion.getByRole("button", { name: "Salvar cópia convertida", exact: true }).click();
    const saved = await response;
    if (saved) throw saved;
    await conversion.waitFor({ state: "detached" });
    const bytes = new Uint8Array(await readFile(path)),
      presentation =
        format === "odp"
          ? importOdp(bytes, "Exported")
          : await importPptx(bytes, "Exported", async () => {
              throw new Error("Flow export has no image crops");
            }),
      text = presentation.slides
        .flatMap((slide) =>
          slide.elements.flatMap((element) =>
            element.kind === "text"
              ? element.paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.text))
              : [],
          ),
        )
        .join(" ");
    assert.match(text, /BUSCA_αβγ_123/);
    assert.match(text, /OCR_VERIFICADO/);
  }
  for (const extension of ["pptx", "odp"]) {
    await command("converter arquivo para pdf");
    conversion = editor.getByRole("dialog", { name: "Converter arquivo para PDF", exact: true });
    response = responder("Open", join(fixture, "..", `open.${extension}`));
    await conversion.getByRole("button", { name: "Escolher arquivo", exact: true }).click();
    const opened = await response;
    if (opened) throw opened;
    await conversion.getByRole("button", { name: "Gerar prévia", exact: true }).click();
    await conversion
      .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
      .waitFor();
    await editor.screenshot({
      path: resolve(`.cache/edi-native-results/edipdf-lote4-${extension}-import.png`),
      animations: "disabled",
    });
    const converted = join(compressedPath, "..", `edipdf-${extension}-import.pdf`);
    response = responder("Save", converted);
    await conversion.getByRole("button", { name: "Salvar cópia convertida", exact: true }).click();
    const saved = await response;
    if (saved) throw saved;
    await conversion.waitFor({ state: "detached" });
    const loading = pdfjs.getDocument({
      data: new Uint8Array(await readFile(converted)),
      useSystemFonts: true,
    });
    try {
      const document = await loading.promise;
      assert.equal(document.numPages, 2);
      const first = await (await document.getPage(1)).getTextContent(),
        last = await (await document.getPage(2)).getTextContent();
      assert.match(
        first.items.map((item) => ("str" in item ? item.str : "")).join(" "),
        extension === "pptx" ? /PPTX_LOCAL_αβγ/ : /ODP_LOCAL_αβγ/,
      );
      assert.match(
        last.items.map((item) => ("str" in item ? item.str : "")).join(" "),
        /ULTIMO_SLIDE/,
      );
    } finally {
      await loading.destroy();
    }
  }
  console.log(
    "Verified native PPTX/ODP local workers, editable flow exports, independent imports and saved Unicode/slide order",
  );
  await seedLease(application, 300);
  for (const format of ["xlsx", "ods", "csv", "json"]) {
    await command("exportar documento");
    conversion = editor.getByRole("dialog", { name: "Exportar documento", exact: true });
    await conversion.getByLabel("Formato", { exact: true }).selectOption(format);
    await conversion.getByLabel("Página de origem", { exact: true }).fill("1");
    await conversion.getByLabel("Divisões X das colunas", { exact: true }).fill("500");
    await conversion
      .getByRole("img", {
        name: "Página de origem com a região da tabela e as divisões de coluna",
        exact: true,
      })
      .waitFor();
    await conversion.getByRole("button", { name: "Gerar prévia", exact: true }).click();
    await conversion.getByRole("region", { name: "Células extraídas", exact: true }).waitFor();
    await editor.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-lote4-table-review.png"),
      animations: "disabled",
    });
    const cell = conversion.getByRole("button", { name: /Linha .*BUSCA_αβγ_123/ });
    for (let group = 0; !(await cell.count()) && group < 1000; group++) {
      const next = conversion.getByRole("button", { name: "Próximas linhas", exact: true });
      if (await next.isDisabled())
        throw new Error(
          `Expected native fixture text is absent from all reviewed table cells: ${await conversion.locator(".table-review-grid").innerText()}`,
        );
      await next.click();
    }
    await cell.click();
    if (format === "xlsx") {
      await editor.screenshot({
        path: resolve(".cache/edi-native-results/edipdf-lote4-table-review.png"),
        animations: "disabled",
      });
      await conversion.getByTitle("Fechar", { exact: true }).click();
      await command("tarefas e resultados preparados");
      await editor
        .getByRole("dialog", { name: "Tarefas e resultados preparados", exact: true })
        .getByRole("button", { name: "Revisar audit (convertido).xlsx", exact: true })
        .click();
      conversion = editor.getByRole("dialog", { name: "Retomar conversão preparada", exact: true });
      await conversion.getByRole("region", { name: "Células extraídas", exact: true }).waitFor();
      await conversion
        .getByRole("img", {
          name: "Página de origem com a região da tabela e as divisões de coluna",
          exact: true,
        })
        .waitFor();
    }
    const path = join(compressedPath, "..", `edipdf-exported.${format}`);
    response = responder("Save", path);
    await conversion.getByRole("button", { name: "Salvar cópia convertida", exact: true }).click();
    const saved = await response;
    if (saved) throw saved;
    await conversion.waitFor({ state: "detached" });
    const bytes = new Uint8Array(await readFile(path));
    const text =
      format === "xlsx"
        ? importXlsx(bytes).sheets[0]?.rows.flat().join(" ")
        : format === "ods"
          ? importOds(bytes).sheets[0]?.rows.flat().join(" ")
          : new TextDecoder().decode(bytes);
    assert.match(text ?? "", /BUSCA_αβγ_123/);
    if (format === "json")
      assert.equal(
        tableEvidenceSchema.parse(JSON.parse(new TextDecoder().decode(bytes))).source.page,
        1,
      );
  }
  console.log(
    "Verified region/column table extraction, source highlights, protected review resume and native XLSX/ODS/CSV/JSON content",
  );
  await command("converter arquivo para pdf");
  conversion = editor.getByRole("dialog", { name: "Converter arquivo para PDF", exact: true });
  response = responder("Open", join(fixture, "..", "scan.tif"));
  await conversion.getByRole("button", { name: "Escolher arquivo", exact: true }).click();
  const tiffOpen = await response;
  if (tiffOpen) throw tiffOpen;
  await conversion.getByRole("button", { name: "Gerar prévia", exact: true }).click();
  await conversion
    .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
    .waitFor();
  await conversion.getByLabel("Página da prévia", { exact: true }).fill("3");
  await conversion
    .getByRole("img", { name: "Prévia da conversão, página 3", exact: true })
    .waitFor();
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote4-tiff-import.png"),
    animations: "disabled",
  });
  await editor.keyboard.press("Escape");
  await command("tarefas e resultados preparados");
  await editor.getByRole("button", { name: "Revisar scan (convertido).pdf", exact: true }).click();
  conversion = editor.getByRole("dialog", { name: "Retomar conversão preparada", exact: true });
  await conversion
    .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
    .waitFor();
  const tiffPdf = join(compressedPath, "..", "edipdf-tiff-import.pdf");
  response = responder("Save", tiffPdf);
  await conversion.getByRole("button", { name: "Salvar cópia convertida", exact: true }).click();
  const tiffSave = await response;
  if (tiffSave) throw tiffSave;
  await conversion.waitFor({ state: "hidden" });
  assert.equal((await PDFDocument.load(await readFile(tiffPdf))).getPageCount(), 3);
  await command("exportar documento");
  conversion = editor.getByRole("dialog", { name: "Exportar documento", exact: true });
  await conversion.getByLabel("Formato", { exact: true }).selectOption("tif");
  await conversion.getByLabel("Resolução TIFF", { exact: true }).selectOption("150");
  await conversion.getByRole("button", { name: "Gerar prévia", exact: true }).click();
  await conversion
    .getByRole("img", { name: "Prévia da conversão, página 1", exact: true })
    .waitFor();
  const exportedTiff = join(compressedPath, "..", "edipdf-exported.tif");
  response = responder("Save", exportedTiff);
  await conversion.getByRole("button", { name: "Salvar cópia convertida", exact: true }).click();
  const tiffExport = await response;
  if (tiffExport) throw tiffExport;
  await conversion.waitFor({ state: "hidden" });
  const tiffBytes = new Uint8Array(await readFile(exportedTiff)),
    tiffPages = inspectTiff(tiffBytes).pages;
  assert.equal(tiffPages.length, 2);
  assert.ok(tiffPages.every((page) => page.dpiX === 150 && page.dpiY === 150));
  await writeFile(resolve(".cache/edi-native-results/edipdf-tiff-export.tif"), tiffBytes);
  console.log(
    "Verified local multipage TIFF import, third-page preview, protected resume, native copies and full TIFF export",
  );
  const scannerDevices = await editor.evaluate(() => window.api.scanners.list());
  await command("digitalizar com scanner");
  const scanner = editor.getByRole("dialog", { name: "Digitalizar com scanner", exact: true });
  if (!scannerDevices.length) {
    await scanner.getByRole("status").filter({ hasText: "Nenhum scanner WIA conectado" }).waitFor();
    assert.equal(
      await scanner.getByRole("button", { name: "Digitalizar", exact: true }).isDisabled(),
      true,
    );
    await scanner.getByRole("button", { name: "Atualizar scanners", exact: true }).click();
    await scanner.getByRole("status").filter({ hasText: "Nenhum scanner WIA conectado" }).waitFor();
  }
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote4-scanner.png"),
    animations: "disabled",
  });
  await scanner.getByTitle("Fechar", { exact: true }).click();
  console.log(
    `Verified native WIA discovery and scanner UI without acquiring paper (${scannerDevices.length} devices)`,
  );
  await command("imprimir documento");
  let printing = editor.getByRole("dialog", { name: "Preparar impressão", exact: true });
  await printing.getByLabel("Composição", { exact: true }).selectOption("booklet");
  await printing.getByRole("button", { name: "Gerar prévia de impressão", exact: true }).click();
  await printing.getByRole("button", { name: "Continuar em segundo plano", exact: true }).click();
  await editor.getByRole("button", { name: "Revisar audit (impressão).pdf", exact: true }).click();
  printing = editor.getByRole("dialog", { name: "Preparar impressão", exact: true });
  await printing
    .getByRole("img", { name: "Prévia da face 1 preparada para impressão", exact: true })
    .waitFor();
  await editor.screenshot({
    path: resolve(".cache/edi-native-results/edipdf-lote4-impressao.png"),
    animations: "disabled",
  });
  await printing.getByRole("button", { name: "Continuar depois", exact: true }).click();
  const preparedPrints = await editor.evaluate(() => window.api.tasks.list()),
    printTask = preparedPrints.tasks.find((task) => task.kind === "printing");
  assert.ok(printTask && printTask.state === "review");
  await command("tarefas e resultados preparados");
  await editor.getByRole("button", { name: `Revisar ${printTask.name}`, exact: true }).click();
  printing = editor.getByRole("dialog", { name: "Preparar impressão", exact: true });
  await printing
    .getByRole("img", { name: "Prévia da face 1 preparada para impressão", exact: true })
    .waitFor();
  await printing
    .getByRole("checkbox", {
      name: "Revisei a ordem, a escala e as folhas preparadas.",
      exact: true,
    })
    .check();
  const printCopy = join(compressedPath, "..", "edipdf-booklet.pdf");
  response = responder("Save", printCopy);
  await printing.getByRole("button", { name: "Salvar PDF preparado", exact: true }).click();
  const printSaved = await response;
  if (printSaved) throw printSaved;
  await printing.waitFor({ state: "hidden" });
  const printedPdf = await PDFDocument.load(await readFile(printCopy));
  assert.equal(printedPdf.getPageCount(), 2);
  assert.ok(printedPdf.getPage(0).getWidth() > printedPdf.getPage(0).getHeight());
  assert.equal(printedPdf.getForm().getFields().length, 0);
  const printContent = pdfjs.getDocument({
    data: new Uint8Array(await readFile(printCopy)),
    useSystemFonts: true,
  });
  try {
    const pdf = await printContent.promise,
      first = await (await pdf.getPage(1)).getTextContent();
    assert.match(
      first.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      /BUSCA_αβγ_123/,
    );
  } finally {
    await printContent.destroy();
  }
  console.log(
    "Verified real vector print preparation, form appearances, booklet preview, protected postponement/resume and native copy save without using a physical printer",
  );
  await editor.evaluate(async () => {
    const started = Date.now();
    while (Date.now() - started < 5000) {
      const result = await window.api.session.load();
      if (result.session.tabs[0]?.page === 1) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Session was not persisted");
  });
  console.log(
    "Verified authored fields, local CEP formatting, editable bookmarks/links, encrypted version history, annotation locking and light preferences",
  );
  console.log(
    "Verified current annotations and form search, native glyph highlights, revision thumbnails, tab/Home scroll restoration, spread/single reading and keyboard command palette",
  );
}
export async function verifyPdfNativeRestart(options: {
  application: ElectronApplication;
  editor: Page;
  applicationRoot: string;
  userData: string;
  suiteData: string;
  fixturePath: string;
  buildEnvironment: Record<string, string>;
  seedLease: SeedLease;
  waitForStatus: (page: Page, state: "licensed" | "restricted") => Promise<void>;
}): Promise<void> {
  const {
    application,
    editor,
    applicationRoot,
    userData,
    suiteData,
    fixturePath,
    buildEnvironment,
    seedLease,
    waitForStatus,
  } = options;
  const deniedCopy = await editor.evaluate(async (path) => {
    try {
      await window.api.writeCopy(path, new Uint8Array([1, 2, 3]));
      return "allowed";
    } catch (failure) {
      return failure instanceof Error ? failure.message : String(failure);
    }
  }, fixturePath);
  assert.match(deniedCopy, /Salvar trabalho existente|edi_access_restricted/);
  const deniedScanner = await editor.evaluate(async () => {
    try {
      await window.api.scanners.list();
      return "allowed";
    } catch (failure) {
      return failure instanceof Error ? failure.message : String(failure);
    }
  });
  assert.match(deniedScanner, /edi_access_restricted/);
  // Invalid copy data cannot write the OS clipboard even if the access gate regresses.
  // Reading/pasting is reserved for the isolated window-station fixture.
  {
    const deniedClipboard = await editor.evaluate(async () => {
      try {
        await window.api.clipboard.copy([]);
        return "allowed";
      } catch (failure) {
        return failure instanceof Error ? failure.message : String(failure);
      }
    });
    assert.match(deniedClipboard, /edi_access_restricted/);
  }
  await seedLease(application, 300);
  await waitForStatus(editor, "licensed");
  await closePdfNativeFixture(application, suiteData, editor);
  const restarted = await _electron.launch({
    args: ["-r", resolve("scripts/edi/fixtures/native-vault.cjs"), applicationRoot],
    cwd: applicationRoot,
    env: {
      ...buildEnvironment,
      EDI_SUITE_TEST_PROFILE: suiteData,
      EDI_NATIVE_TEST: "true",
      EDIPDF_USER_DATA: userData,
    },
  });
  let restartedClosed = false;
  let restartEditor: Page | undefined;
  const startup = observeNativeStartup(restarted, [userData, suiteData, applicationRoot]);
  const restartFailures: unknown[] = [];
  restarted.once("close", () => {
    restartedClosed = true;
  });
  try {
    let reader = await restarted.firstWindow();
    await reader.waitForFunction(() => window.api || window.ediSuite);
    if (!(await reader.evaluate(() => !!window.api))) {
      const pending = restarted.waitForEvent("window");
      await seedLease(restarted, 300);
      reader = await pending;
    }
    restartEditor = reader;
    await reader.waitForFunction(() =>
      document.querySelector(".page .textLayer")?.textContent.includes("SEGUNDA_PAGINA"),
    );
    assert.equal(
      await reader.getByRole("textbox", { name: "Página", exact: true }).inputValue(),
      "2",
    );
    assert.equal(await reader.evaluate(() => document.documentElement.dataset.theme), "light");
    await reader.getByTitle("Início", { exact: true }).click();
    await reader.getByRole("button", { name: "Recuperar audit.pdf", exact: true }).click();
    await reader.getByRole("textbox", { name: "CEP novo", exact: true }).waitFor();
    assert.equal(
      await reader.getByRole("textbox", { name: "CEP novo", exact: true }).inputValue(),
      "12345-678",
    );
    const original = fixturePath;
    const preserved = await readFile(original);
    const copy = await reader.evaluate(async (path) => {
      try {
        await window.api.writeCopy(path, new Uint8Array([1, 2, 3]));
        return "";
      } catch (failure) {
        return failure instanceof Error ? failure.message : String(failure);
      }
    }, original);
    assert.match(copy, /original|origem/i);
    assert.deepEqual(await readFile(original), preserved);
    const versionFiles = await readdir(join(userData, "versions"));
    const versionFile = versionFiles[0];
    assert.ok(versionFile, "A protected version must exist after the journey");
    const protectedBytes = await readFile(join(userData, "versions", versionFile));
    const ciphertext =
      !protectedBytes.includes(Buffer.from("BUSCA_")) &&
      !protectedBytes.includes(Buffer.from("sources"));
    assert.equal(ciphertext, true);
    await reader.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-lote3-recuperado.png"),
    });
    const pendingTasks = await reader.evaluate(() => window.api.tasks.list());
    const partial = pendingTasks.tasks.find((task) => task.kind === "ocr");
    assert.ok(partial, "The interrupted OCR checkpoint must survive process restart");
    const checkpoint = await reader.evaluate((id) => window.api.tasks.load(id), partial.id);
    assert.ok(
      checkpoint.result.detail?.kind === "ocr" && checkpoint.result.detail.remaining.length > 0,
    );
    await reader.keyboard.press("Control+k");
    await reader
      .getByRole("combobox", { name: "Buscar ação", exact: true })
      .fill("tarefas e resultados preparados");
    await reader.getByRole("combobox", { name: "Buscar ação", exact: true }).press("Enter");
    await reader.getByRole("button", { name: `Retomar ${partial.name}`, exact: true }).click();
    const resumedOcr = reader.getByRole("dialog", {
      name: "Reconhecer texto — OCR local",
      exact: true,
    });
    await resumedOcr
      .getByRole("button", { name: "Continuar páginas pendentes", exact: true })
      .click();
    await resumedOcr
      .getByRole("status")
      .filter({ hasText: "Reconhecimento pronto" })
      .waitFor({ timeout: 60_000 });
    await resumedOcr
      .getByRole("checkbox", { name: "Somente palavras incertas", exact: true })
      .uncheck();
    await resumedOcr.getByRole("button", { name: /EDIPDF/ }).waitFor();
    await resumedOcr.getByLabel(/Corrigir palavra/).fill("OCR_RETOMADO");
    await reader.screenshot({
      path: resolve(".cache/edi-native-results/edipdf-lote4-ocr-retomado.png"),
      animations: "disabled",
    });
    await resumedOcr
      .getByRole("button", { name: "Abrir cópia com OCR revisado", exact: true })
      .click();
    await resumedOcr.waitFor({ state: "hidden" });
    await reader.keyboard.press("Control+f");
    await reader
      .getByRole("textbox", { name: "Buscar no documento", exact: true })
      .fill("OCR_RETOMADO");
    await reader.waitForFunction(() =>
      document.querySelector(".search-count")?.textContent.includes("1 de 1"),
    );
    await reader.getByRole("button", { name: "Fechar busca", exact: true }).click();
    console.log(
      "Verified protected partial OCR survives process restart, resumes only pending pages and opens corrected searchable output as a new document",
    );
    console.log(
      "Verified process restart restores session, latest embedded work and original-path protection; protected versions contain no fixture plaintext",
    );
    await verifyForcedPdfRestarts({
      application: restarted,
      editor: reader,
      applicationRoot,
      userData,
      suiteData,
      environment: buildEnvironment,
      seedLease,
      waitForStatus,
    });
  } catch (failure) {
    restartFailures.push(failure);
    console.error(
      "Original EdiPDF restart failure",
      sanitizeNativeDiagnostic(
        failure instanceof Error ? (failure.stack ?? failure.message) : String(failure),
        [userData, suiteData],
      ),
    );
    console.error("Owned EdiPDF restart state", JSON.stringify(await startup.snapshot()));
    for (const [index, page] of restarted.windows().entries()) {
      try {
        await page.screenshot({
          path: resolve(`.cache/edi-native-results/edipdf-restart-failure-${index}.png`),
          animations: "disabled",
        });
      } catch (captureFailure) {
        restartFailures.push(captureFailure);
      }
    }
  } finally {
    if (!restartedClosed) {
      try {
        await closePdfNativeFixture(restarted, suiteData, restartEditor);
      } catch (cleanupFailure) {
        restartFailures.push(cleanupFailure);
      }
    }
    startup.dispose();
  }
  if (restartFailures.length === 1) throw restartFailures[0];
  if (restartFailures.length > 1)
    throw new AggregateError(restartFailures, "Native restart verification and cleanup failed");
}
