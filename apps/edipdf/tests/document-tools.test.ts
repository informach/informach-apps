import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { degrees, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from "pdf-lib";
import { buildPdf } from "../src/shared/build.ts";
import { pruneUnreachable } from "../src/shared/compress.ts";
import {
  addFormField,
  configureField,
  describeFields,
  exportFormData,
  type FieldDefinition,
  fieldValueError,
  formatFieldValue,
  importFormData,
  moveFormWidget,
  setFormData,
  setPageTabOrder,
} from "../src/shared/form-authoring.ts";
import {
  addBookmark,
  addLink,
  attachments,
  bookmarks,
  editBookmark,
  links,
  moveBookmark,
  removeAttachment,
  removeLink,
  safeAttachmentName,
  webUrlSchema,
} from "../src/shared/pdf-navigation.ts";

test("native bookmarks retain nesting and navigation across rename, deletion and save", async () => {
  let document = await PDFDocument.create();
  document.addPage();
  document.addPage();
  addBookmark(document, { title: "Introdução α", page: 0 });
  const parent = bookmarks(document)[0].id;
  addBookmark(document, { title: "Detalhes", page: 1, parent });
  addBookmark(document, { title: "Fim", page: 1 });
  assert.deepEqual(
    bookmarks(document).map((item) => [item.title, item.level, item.page]),
    [
      ["Introdução α", 0, 0],
      ["Detalhes", 1, 1],
      ["Fim", 0, 1],
    ],
  );
  editBookmark(document, parent, { title: "Começo", page: 1 });
  document = await PDFDocument.load(await document.save());
  assert.equal(bookmarks(document)[0].title, "Começo");
  editBookmark(document, parent, "remove");
  assert.deepEqual(
    bookmarks(document).map((item) => item.title),
    ["Fim"],
  );
  const root = document.catalog.lookup(PDFName.of("Outlines"), PDFDict);
  assert.equal(root.lookup(PDFName.of("Count")).toString(), "1");
});
test("links roundtrip view coordinates on crop boxes and all rotations, with safe URL validation", async () => {
  const document = await PDFDocument.create();
  const box = { x: 20, y: 30, w: 80, h: 25 };
  for (const rotation of [0, 90, 180, 270]) {
    const page = document.addPage([400, 500]);
    page.setCropBox(30, 40, 300, 350);
    page.setRotation(degrees(rotation));
    addLink(document, { page: document.getPageCount() - 1, box, target: { page: 0 } });
  }
  const restored = await PDFDocument.load(await document.save()),
    found = links(restored);
  assert.equal(found.length, 4);
  for (const link of found) {
    assert.deepEqual(link.box, box);
    assert.equal(link.targetPage, 0);
  }
  removeLink(restored, found[1].id);
  assert.equal(links(restored).length, 3);
  for (const unsafe of [
    "javascript:alert(1)",
    "file:///C:/data",
    "https://name:password@example.com/",
  ])
    assert.equal(webUrlSchema.safeParse(unsafe).success, false);
  assert.equal(webUrlSchema.safeParse("https://example.com/path?x=1").success, true);
});
test("named destinations resolve safely and bookmark reordering preserves nested branches", async () => {
  const document = await PDFDocument.create();
  document.addPage();
  document.addPage();
  addBookmark(document, { title: "A", page: 0 });
  const first = bookmarks(document)[0];
  addBookmark(document, { title: "A.1", page: 1, parent: first.id });
  addBookmark(document, { title: "B", page: 1 });
  moveBookmark(document, first.id, "down");
  assert.deepEqual(
    bookmarks(document).map((item) => item.title),
    ["B", "A", "A.1"],
  );
  const root = document.catalog.lookup(PDFName.of("Outlines"), PDFDict),
    dict = root.lookup(PDFName.of("Last"), PDFDict);
  document.catalog.set(
    PDFName.of("Names"),
    document.context.obj({
      Dests: { Names: [PDFString.of("named"), [document.getPage(1).ref, "Fit"]] },
    }),
  );
  dict.set(PDFName.of("Dest"), PDFString.of("named"));
  dict.set(PDFName.of("Count"), PDFNumber.of(-1));
  assert.equal(bookmarks(document).find((item) => item.title === "A")?.page, 1);
  addBookmark(document, { title: "C", page: 0 });
  assert.equal(root.lookup(PDFName.of("Count"), PDFNumber).asNumber(), 3);
  const cyclic = document.context.obj({});
  cyclic.set(PDFName.of("D"), cyclic);
  dict.set(PDFName.of("Dest"), cyclic);
  assert.throws(() => bookmarks(document), /cíclico/);
});
test("attachment extraction preserves exact bytes and explicit removal drops unreachable payloads", async () => {
  let document = await PDFDocument.create();
  document.addPage();
  const bytes = new TextEncoder().encode("ANEXO_CONFIDENCIAL_β");
  await document.attach(bytes, "../documento.txt", { description: "Evidência" });
  document = await PDFDocument.load(await document.save({ useObjectStreams: false }));
  const file = attachments(document)[0];
  assert.deepEqual(file.bytes, bytes);
  assert.equal(file.description, "Evidência");
  assert.equal(safeAttachmentName(file.name), "documento.txt");
  assert.equal(safeAttachmentName("NUL.txt"), "_NUL.txt");
  for (const extension of [".zip", ".docx", ".pdf"]) {
    const name = safeAttachmentName(`${"Documento".repeat(30)}${extension}`);
    assert.ok(name.length <= 180 && name.endsWith(extension));
  }
  const unicode = safeAttachmentName(`${"😀".repeat(120)}.pdf`);
  assert.ok(unicode.length <= 180 && unicode.endsWith(".pdf"));
  assert.equal(
    [...unicode].some(
      (char) => char.length === 1 && char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdfff,
    ),
    false,
  );
  removeAttachment(document, file.id);
  pruneUnreachable(document);
  document = await PDFDocument.load(await document.save({ useObjectStreams: false }));
  assert.equal(attachments(document).length, 0);
  assert.equal(
    document.context
      .enumerateIndirectObjects()
      .some(
        ([, object]) =>
          object instanceof PDFDict &&
          object.get(PDFName.of("Type")) === PDFName.of("EmbeddedFile"),
      ),
    false,
  );
});
const definition = (name: string, kind: FieldDefinition["kind"] = "text"): FieldDefinition => ({
  name,
  label: "Nome acessível",
  kind,
  page: 0,
  box: { x: 40, y: 80, w: 180, h: 24 },
  required: false,
  readOnly: false,
  multiline: false,
  multiselect: false,
  maxLength: 0,
  mask: "none",
  alignment: "left",
  fontSize: 12,
  options:
    kind === "list" || kind === "dropdown" || kind === "radio" ? ["São Paulo", "Rio", "α"] : [],
});
test("authored AcroForm fields persist constraints, multiselection and Unicode across build", async () => {
  const font = new Uint8Array(
    await readFile(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url)),
  );
  let document = await PDFDocument.create();
  document.addPage();
  await addFormField(document, { ...definition("nome"), required: true, maxLength: 30 }, font);
  await addFormField(
    document,
    { ...definition("lista", "list"), multiselect: true, box: { x: 40, y: 140, w: 180, h: 80 } },
    font,
  );
  await addFormField(
    document,
    { ...definition("aceite", "checkbox"), box: { x: 40, y: 250, w: 20, h: 20 } },
    font,
  );
  configureField(document.getForm().getTextField("nome"), {
    ...definition("nome"),
    required: true,
    maxLength: 30,
  });
  setFormData(document, { nome: "João α", lista: ["São Paulo", "α"], aceite: true });
  const { embedUnicodeFont } = await import("../src/shared/unicode-fonts.ts");
  document
    .getForm()
    .updateFieldAppearances(await embedUnicodeFont(document, font, "João α São Paulo"));
  let bytes = await document.save({ updateFieldAppearances: false });
  bytes = await buildPdf({
    primary: "a",
    sources: { a: bytes },
    content: {
      pages: [{ id: "p", src: "a", index: 0, rotation: 0 }],
      annots: [],
      forms: { lista: ["Rio", "α"] },
      meta: {},
      watermark: null,
      pageNumbers: null,
    },
    fonts: { regular: font, bold: font, italic: font, boldItalic: font },
  });
  document = await PDFDocument.load(bytes);
  const fields = describeFields(document);
  assert.equal(fields.find((field) => field.name === "nome")?.value, "João α");
  assert.equal(fields.find((field) => field.name === "nome")?.required, true);
  assert.equal(fields.find((field) => field.name === "nome")?.maxLength, 30);
  assert.deepEqual(fields.find((field) => field.name === "lista")?.value, ["Rio", "α"]);
  assert.equal(fields.find((field) => field.name === "aceite")?.value, true);
  assert.throws(() => setFormData(document, { desconhecido: "x" }), /desconhecido/);
  assert.throws(() => setFormData(document, { lista: ["inválido"] }), /inválido/);
  assert.throws(() => setFormData(document, { nome: "x".repeat(31) }), /Máximo/);
  for (const format of ["json", "csv"] as const)
    assert.deepEqual(
      importFormData(exportFormData(fields, format), format),
      Object.fromEntries(fields.map((field) => [field.name, field.value])),
    );
});
test("form data formats preserve multiline quotes and formula-like input, reject malformed data and validate masks", () => {
  const fields = [{ name: "=danger", value: 'linha 1\n"quoted", =1+1', kind: "text" }] as const;
  const data = { version: 1, fields: { [fields[0].name]: fields[0].value } };
  assert.deepEqual(importFormData(JSON.stringify(data), "json"), data.fields);
  assert.throws(() => importFormData('{"version":2,"fields":{}}', "json"));
  assert.throws(() => importFormData('name,value\n"broken', "csv"));
  assert.equal(formatFieldValue("12345678901", "cpf"), "123.456.789-01");
  assert.equal(formatFieldValue("11987654321", "phone"), "(11) 98765-4321");
  assert.equal(formatFieldValue("123456789012", "cpf"), "123456789012");
  assert.equal(formatFieldValue("abc12345678", "cep"), "abc12345678");
  assert.equal(fieldValueError("31/02/2026", { mask: "date" }), "Data inexistente.");
  assert.equal(fieldValueError("28/02/2026", { mask: "date" }), undefined);
  assert.equal(fieldValueError("", { required: true }), "Campo obrigatório.");
});
test("moving an existing widget across rotated pages preserves values and page membership", async () => {
  const font = new Uint8Array(
    await readFile(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url)),
  );
  const document = await PDFDocument.create();
  document.addPage([400, 500]);
  const rotated = document.addPage([400, 500]);
  rotated.setRotation(degrees(90));
  rotated.setCropBox(30, 40, 300, 350);
  await addFormField(document, definition("campo"), font);
  document.getForm().getTextField("campo").setText("PRESERVADO");
  const box = { x: 50, y: 60, w: 180, h: 25 };
  moveFormWidget(document, "campo", 0, 1, box);
  setPageTabOrder(document, 1, "columns");
  document.getForm().updateFieldAppearances();
  const restored = await PDFDocument.load(await document.save({ updateFieldAppearances: false }));
  const fields = describeFields(restored);
  assert.equal(fields[0].value, "PRESERVADO");
  assert.deepEqual(fields[0].widgets, [{ page: 1, box }]);
  assert.equal(restored.getPage(0).node.Annots()?.size(), 0);
  assert.equal(restored.getPage(1).node.Annots()?.size(), 1);
  assert.equal(restored.getPage(1).node.get(PDFName.of("Tabs")), PDFName.of("C"));
});
