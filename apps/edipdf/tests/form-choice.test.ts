import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, StandardFonts } from "pdf-lib";
import { buildPdf } from "../src/shared/build.ts";
import {
  addFormField,
  configureField,
  describeFields,
  exportFormData,
  fieldDefinitionSchema,
  setFormData,
} from "../src/shared/form-authoring.ts";
import { choiceOptions, selectChoiceValues } from "../src/shared/form-choice.ts";
import { setFormWidgetFont, updateDirtyFormAppearances } from "../src/shared/form-font.ts";

const font = new Uint8Array(
  await readFile(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url)),
);
const pairs = [
  { exportValue: "INTERNAL_SP", displayValue: "São Paulo α" },
  { exportValue: "INTERNAL_RJ", displayValue: "Rio β" },
  { exportValue: "INTERNAL_MG", displayValue: "Minas γ" },
];
async function fixture() {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([400, 400]);
  const courier = await pdf.embedFont(StandardFonts.Courier);
  const dropdown = pdf.getForm().createDropdown("estado");
  dropdown.setOptions(["FIRST", "SECOND", "THIRD"]);
  dropdown.addToPage(page, { x: 20, y: 300, width: 300, height: 30, font: courier });
  const list = pdf.getForm().createOptionList("estados");
  list.setOptions(["FIRST", "SECOND", "THIRD"]);
  list.enableMultiselect();
  list.addToPage(page, { x: 20, y: 100, width: 300, height: 120, font: courier });
  for (const field of [dropdown, list]) {
    field.acroField.setOptions(
      pairs.map((option) => ({
        value: PDFHexString.fromText(option.exportValue),
        display: PDFHexString.fromText(option.displayValue),
      })),
    );
    field.acroField.dict.set(PDFName.of("V"), PDFHexString.fromText(pairs[0].exportValue));
    field.setFontSize(14);
    await setFormWidgetFont(pdf, field.getName(), font);
  }
  const peer = pdf.getForm().createTextField("intocado");
  peer.setText("PEER");
  peer.addToPage(page, { x: 20, y: 30, width: 200, height: 20, font: courier });
  peer.updateAppearances(courier);
  return pdf.save({ updateFieldAppearances: false });
}
function peerAppearance(pdf: PDFDocument) {
  const widget = pdf.getForm().getTextField("intocado").acroField.getWidgets()[0];
  const ap = widget.dict.lookup(PDFName.of("AP"));
  assert.ok(ap instanceof PDFDict);
  const stream = ap.lookup(PDFName.of("N"));
  assert.ok(stream instanceof PDFRawStream);
  return stream.getContents();
}
async function independentRead(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: `${resolve("node_modules/pdfjs-dist/standard_fonts")}/`,
  });
  try {
    const pdf = await task.promise,
      page = await pdf.getPage(1);
    return {
      annotations: await page.getAnnotations(),
      text: (await page.getTextContent()).items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    };
  } finally {
    await task.destroy();
  }
}

test("choice values save as export codes while labels, appearances and clean peers survive build and independent reading", async () => {
  const source = await fixture(),
    original = source.slice(),
    before = await PDFDocument.load(source);
  const bytes = await buildPdf({
    primary: "source",
    sources: { source },
    fonts: { regular: font, bold: font, italic: font, boldItalic: font },
    content: {
      pages: [{ id: "p", src: "source", index: 0, rotation: 0 }],
      annots: [],
      forms: { estado: "INTERNAL_RJ", estados: ["INTERNAL_MG", "INTERNAL_SP"] },
      watermark: null,
      pageNumbers: null,
      meta: {},
    },
  });
  const reopened = await PDFDocument.load(bytes);
  assert.deepEqual(choiceOptions(reopened.getForm().getDropdown("estado")), pairs);
  assert.deepEqual(reopened.getForm().getDropdown("estado").getSelected(), ["INTERNAL_RJ"]);
  assert.deepEqual(reopened.getForm().getOptionList("estados").getSelected(), [
    "INTERNAL_SP",
    "INTERNAL_MG",
  ]);
  assert.equal(
    String(reopened.getForm().getOptionList("estados").acroField.dict.lookup(PDFName.of("I"))),
    "[ 0 2 ]",
  );
  assert.equal(reopened.getForm().getDropdown("estado").isEditable(), false);
  assert.deepEqual(peerAppearance(reopened), peerAppearance(before));
  const independent = await independentRead(bytes);
  const choice = independent.annotations.find((item) => item.fieldName === "estado");
  assert.deepEqual(choice?.options, pairs);
  assert.deepEqual(choice?.fieldValue, ["INTERNAL_RJ"]);
  const data = JSON.parse(exportFormData(describeFields(reopened), "json"));
  assert.equal(data.fields.estado, "INTERNAL_RJ");
  assert.deepEqual(data.fields.estados, ["INTERNAL_SP", "INTERNAL_MG"]);
  // Flatten only the test copy to read the actual saved appearance, not its /V metadata.
  reopened.getForm().flatten({ updateFieldAppearances: false });
  const renderedText = (
    await independentRead(await reopened.save({ updateFieldAppearances: false }))
  ).text;
  assert.match(renderedText, /Rio β/);
  assert.match(renderedText, /São Paulo α/);
  assert.doesNotMatch(renderedText, /INTERNAL_/);
  assert.deepEqual(source, original);
});

test("choice import validates export codes, ambiguity and multiplicity before changing values", async () => {
  const pdf = await PDFDocument.load(await fixture()),
    dropdown = pdf.getForm().getDropdown("estado");
  for (const value of ["Rio β", "UNKNOWN", ["INTERNAL_SP", "INTERNAL_RJ"], true]) {
    assert.throws(() => setFormData(pdf, { estado: value }));
    assert.deepEqual(dropdown.getSelected(), ["INTERNAL_SP"]);
    assert.equal(dropdown.isEditable(), false);
  }
  setFormData(pdf, { estado: "INTERNAL_RJ", estados: ["INTERNAL_MG", "INTERNAL_SP"] });
  await updateDirtyFormAppearances(pdf, font);
  assert.deepEqual(dropdown.getSelected(), ["INTERNAL_RJ"]);
  const ambiguous = pairs.map((option, index) => ({
    value: PDFHexString.fromText(index === 1 ? "INTERNAL_SP" : option.exportValue),
    display: PDFHexString.fromText(option.displayValue),
  }));
  dropdown.acroField.setOptions(ambiguous);
  assert.throws(() => selectChoiceValues(pdf, dropdown, "INTERNAL_SP"), /ambíguas/);
  assert.deepEqual(dropdown.getSelected(), ["INTERNAL_RJ"]);
});

test("configuring choice properties retains pairs and permits label edits without losing selected codes", async () => {
  const pdf = await PDFDocument.load(await fixture()),
    field = pdf.getForm().getDropdown("estado");
  const description = describeFields(pdf).find((item) => item.name === "estado");
  assert.ok(description);
  assert.deepEqual(description.choiceOptions, pairs);
  configureField(field, { ...description, label: "Estado de origem", options: [] });
  assert.deepEqual(choiceOptions(field), pairs);
  const edited = pairs.map((option) => ({
    ...option,
    displayValue: `${option.displayValue} revisado`,
  }));
  configureField(field, { ...description, options: [], choiceOptions: edited });
  await updateDirtyFormAppearances(pdf, font);
  assert.deepEqual(field.getSelected(), ["INTERNAL_SP"]);
  assert.deepEqual(choiceOptions(field), edited);
  assert.throws(
    () => configureField(field, { ...description, options: [], choiceOptions: edited.slice(1) }),
    /excluem/,
  );
  assert.deepEqual(choiceOptions(field), edited);
  pdf.getForm().flatten({ updateFieldAppearances: false });
  assert.match((await independentRead(await pdf.save())).text, /São Paulo α revisado/);
});

test("new paired choices support duplicate visible labels with distinct stored codes", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 400]);
  const definition = fieldDefinitionSchema.parse({
    name: "codigo",
    label: "Código",
    kind: "dropdown",
    page: 0,
    box: { x: 20, y: 20, w: 200, h: 30 },
    required: false,
    readOnly: false,
    multiline: false,
    multiselect: false,
    maxLength: 0,
    mask: "none",
    alignment: "left",
    fontSize: 14,
    options: [],
    choiceOptions: [
      { exportValue: "A", displayValue: "Repetido" },
      { exportValue: "B", displayValue: "Repetido" },
    ],
  });
  await addFormField(pdf, definition, font);
  setFormData(pdf, { codigo: "B" });
  await updateDirtyFormAppearances(pdf, font);
  const reopened = await PDFDocument.load(await pdf.save({ updateFieldAppearances: false }));
  assert.deepEqual(reopened.getForm().getDropdown("codigo").getSelected(), ["B"]);
  assert.deepEqual(
    choiceOptions(reopened.getForm().getDropdown("codigo")),
    definition.choiceOptions,
  );
  assert.equal(
    fieldDefinitionSchema.safeParse({
      ...definition,
      choiceOptions: [
        { exportValue: "A", displayValue: "Um" },
        { exportValue: "A", displayValue: "Dois" },
      ],
    }).success,
    false,
  );
});
