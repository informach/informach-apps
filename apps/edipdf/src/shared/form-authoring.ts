import {
  degrees,
  PDFCheckBox,
  PDFDict,
  type PDFDocument,
  PDFDropdown,
  type PDFField,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFString,
  PDFTextField,
  rgb,
  TextAlignment,
} from "pdf-lib";
import { z } from "zod";
import {
  type ChoiceOption,
  choiceAppearance,
  choiceOptions,
  selectChoiceValues,
} from "./form-choice.ts";
import { embedFormFont, rememberWidgetFont } from "./form-font.ts";
import { type Box, type FormValue, pdfToView, viewToPdf } from "./model.ts";

export const maskSchema = z.enum(["none", "cpf", "cep", "phone", "date", "email"]);
export type FieldMask = z.infer<typeof maskSchema>;
const fieldDefinitionBaseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(
      (name) => !name.includes(".") && [...name].every((char) => (char.codePointAt(0) ?? 0) >= 32),
      "Use um nome simples, sem pontos ou controles.",
    ),
  label: z.string().max(1000),
  kind: z.enum(["text", "checkbox", "radio", "dropdown", "list"]),
  page: z.number().int().nonnegative(),
  box: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    w: z.number().finite().positive().max(14400),
    h: z.number().finite().positive().max(14400),
  }),
  required: z.boolean(),
  readOnly: z.boolean(),
  multiline: z.boolean(),
  multiselect: z.boolean(),
  maxLength: z.number().int().min(0).max(100000),
  mask: maskSchema,
  alignment: z.enum(["left", "center", "right"]),
  fontSize: z.number().finite().min(4).max(100),
  options: z
    .array(z.string().trim().min(1).max(1000))
    .max(1000)
    .refine((values) => new Set(values).size === values.length, "Opções repetidas."),
  choiceOptions: z
    .array(
      z.object({
        exportValue: z.string().min(1).max(1000),
        displayValue: z.string().min(1).max(1000),
      }),
    )
    .max(1000)
    .refine(
      (options) => new Set(options.map((option) => option.exportValue)).size === options.length,
      "Valores internos repetidos.",
    )
    .optional(),
});
export const fieldDefinitionSchema = fieldDefinitionBaseSchema.superRefine((value, context) => {
  if (
    (value.kind === "radio" && !value.options.length) ||
    (["dropdown", "list"].includes(value.kind) && !(value.choiceOptions ?? value.options).length)
  )
    context.addIssue({ code: "custom", message: "Adicione pelo menos uma opção." });
});
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;
export interface FieldDescription {
  name: string;
  label: string;
  kind: FieldDefinition["kind"] | "unsupported";
  value: FormValue;
  required: boolean;
  readOnly: boolean;
  multiline: boolean;
  multiselect: boolean;
  maxLength: number;
  mask: FieldMask;
  options: string[];
  choiceOptions?: ChoiceOption[];
  alignment: FieldDefinition["alignment"];
  widgets: { page: number; box: Box }[];
}
const n = PDFName.of;
export function fieldMask(field: PDFField): FieldMask {
  const raw = field.acroField.dict.get(n("EdiMask"));
  const value = raw instanceof PDFName ? raw.decodeText() : "none";
  const parsed = maskSchema.safeParse(value);
  return parsed.success ? parsed.data : "none";
}
export function formatFieldValue(text: string, mask: FieldMask): string {
  if (mask === "none" || mask === "email") return text;
  if (/[^\d\s()./+-]/.test(text)) return text;
  const digits = text.replace(/\D/g, "");
  const groups =
    mask === "cpf"
      ? [3, 3, 3, 2]
      : mask === "cep"
        ? [5, 3]
        : mask === "date"
          ? [2, 2, 4]
          : [2, digits.length > 10 ? 5 : 4, 4];
  const separators =
    mask === "cpf"
      ? [".", ".", "-"]
      : mask === "date"
        ? ["/", "/"]
        : mask === "cep"
          ? ["-"]
          : [") ", "-"];
  if (digits.length > groups.reduce((sum, length) => sum + length, 0)) return text;
  let result = mask === "phone" && digits ? "(" : "",
    at = 0;
  for (let index = 0; index < groups.length && at < digits.length; index++) {
    if (index) result += separators[index - 1];
    result += digits.slice(at, at + groups[index]);
    at += groups[index];
  }
  return result;
}
export function fieldValueError(
  value: FormValue,
  constraints: { required?: boolean; maxLength?: number; mask?: FieldMask },
): string | undefined {
  const empty = value === false || value === "" || (Array.isArray(value) && !value.length);
  if (constraints.required && empty) return "Campo obrigatório.";
  if (empty || typeof value !== "string") return undefined;
  if (constraints.maxLength && value.length > constraints.maxLength)
    return `Máximo de ${constraints.maxLength} caracteres.`;
  const mask = constraints.mask ?? "none";
  const patterns: Record<FieldMask, RegExp> = {
    none: /./s,
    cpf: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
    cep: /^\d{5}-\d{3}$/,
    phone: /^\(\d{2}\) \d{4,5}-\d{4}$/,
    date: /^\d{2}\/\d{2}\/\d{4}$/,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  };
  if (!patterns[mask].test(value)) return "Preencha no formato indicado para este campo.";
  if (mask === "date") {
    const [day, month, year] = value.split("/");
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (
      Number.isNaN(date.valueOf()) ||
      date.getUTCDate() !== Number(day) ||
      date.getUTCMonth() + 1 !== Number(month)
    )
      return "Data inexistente.";
  }
  return undefined;
}
export function describeFields(document: PDFDocument): FieldDescription[] {
  if (document.catalog.lookupMaybe(n("AcroForm"), PDFDict)?.has(n("XFA")))
    throw new Error("Autoria XFA não está disponível.");
  return document
    .getForm()
    .getFields()
    .map((field) => {
      const kind =
        field instanceof PDFTextField
          ? "text"
          : field instanceof PDFCheckBox
            ? "checkbox"
            : field instanceof PDFRadioGroup
              ? "radio"
              : field instanceof PDFDropdown
                ? "dropdown"
                : field instanceof PDFOptionList
                  ? "list"
                  : "unsupported";
      const value =
        field instanceof PDFTextField
          ? (field.getText() ?? "")
          : field instanceof PDFCheckBox
            ? field.isChecked()
            : field instanceof PDFRadioGroup
              ? (field.getSelected() ?? "")
              : field instanceof PDFDropdown || field instanceof PDFOptionList
                ? field.isMultiselect()
                  ? field.getSelected()
                  : (field.getSelected()[0] ?? "")
                : "";
      const rawLabel = field.acroField.dict.lookup(n("TU"));
      const label =
        rawLabel instanceof PDFString || rawLabel instanceof PDFHexString
          ? rawLabel.decodeText()
          : field.getName();
      const widgets = field.acroField.getWidgets().map((widget) => {
        const page = document.getPages().findIndex(
          (page) =>
            page.ref === widget.P() ||
            page.node
              .Annots()
              ?.asArray()
              .some((ref) => document.context.lookup(ref) === widget.dict),
        );
        if (page < 0) throw new Error(`Campo ${field.getName()} sem página.`);
        const source = document.getPage(page),
          crop = source.getCropBox(),
          r = ((source.getRotation().angle % 360) + 360) % 360;
        if (r !== 0 && r !== 90 && r !== 180 && r !== 270)
          throw new Error("Rotação de formulário inválida.");
        const rectangle = widget.getRectangle(),
          c = { x: crop.x, y: crop.y, w: crop.width, h: crop.height };
        const a = pdfToView(r, c, rectangle.x, rectangle.y),
          b = pdfToView(r, c, rectangle.x + rectangle.width, rectangle.y + rectangle.height);
        return {
          page,
          box: {
            x: Math.min(a[0], b[0]),
            y: Math.min(a[1], b[1]),
            w: Math.abs(b[0] - a[0]),
            h: Math.abs(b[1] - a[1]),
          },
        };
      });
      return {
        name: field.getName(),
        label,
        kind,
        value,
        required: field.isRequired(),
        readOnly: field.isReadOnly(),
        mask: fieldMask(field),
        multiline: field instanceof PDFTextField && field.isMultiline(),
        maxLength: field instanceof PDFTextField ? (field.getMaxLength() ?? 0) : 0,
        multiselect:
          (field instanceof PDFDropdown || field instanceof PDFOptionList) && field.isMultiselect(),
        options:
          field instanceof PDFRadioGroup ||
          field instanceof PDFDropdown ||
          field instanceof PDFOptionList
            ? field.getOptions()
            : [],
        choiceOptions:
          field instanceof PDFDropdown || field instanceof PDFOptionList
            ? choiceOptions(field)
            : undefined,
        alignment:
          field instanceof PDFTextField
            ? field.getAlignment() === TextAlignment.Center
              ? "center"
              : field.getAlignment() === TextAlignment.Right
                ? "right"
                : "left"
            : "left",
        widgets,
      };
    });
}
export function configureField(
  field: PDFField,
  raw: Pick<
    FieldDefinition,
    | "label"
    | "required"
    | "readOnly"
    | "maxLength"
    | "mask"
    | "multiline"
    | "multiselect"
    | "alignment"
    | "options"
    | "choiceOptions"
  >,
): void {
  const input = fieldDefinitionBaseSchema
    .pick({
      label: true,
      required: true,
      readOnly: true,
      maxLength: true,
      mask: true,
      multiline: true,
      multiselect: true,
      alignment: true,
      options: true,
      choiceOptions: true,
    })
    .parse(raw);
  field.acroField.dict.set(n("TU"), PDFHexString.fromText(input.label || field.getName()));
  for (const widget of field.acroField.getWidgets())
    widget.dict.set(n("TU"), PDFHexString.fromText(input.label || field.getName()));
  input.required ? field.enableRequired() : field.disableRequired();
  input.readOnly ? field.enableReadOnly() : field.disableReadOnly();
  field.acroField.dict.set(n("EdiMask"), n(input.mask));
  if (field instanceof PDFTextField) {
    if (input.maxLength && (field.getText()?.length ?? 0) > input.maxLength)
      throw new Error("O conteúdo atual excede o novo limite do campo.");
    field.setMaxLength(input.maxLength || undefined);
    input.multiline ? field.enableMultiline() : field.disableMultiline();
    field.setAlignment(
      { left: TextAlignment.Left, center: TextAlignment.Center, right: TextAlignment.Right }[
        input.alignment
      ],
    );
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const selected = field.getSelected();
    const old = choiceOptions(field);
    const options =
      input.choiceOptions ??
      input.options.map((displayValue) => ({
        exportValue:
          old.find((option) => option.displayValue === displayValue)?.exportValue ?? displayValue,
        displayValue,
      }));
    if (new Set(options.map((option) => option.exportValue)).size !== options.length)
      throw new Error("Valores internos repetidos.");
    if (selected.some((value) => !options.some((option) => option.exportValue === value)))
      throw new Error("As opções novas excluem um valor já preenchido.");
    if (!input.multiselect && selected.length > 1)
      throw new Error("Desmarque as seleções extras antes de limitar o campo a uma opção.");
    field.acroField.setOptions(
      options.map((option) => ({
        value: PDFHexString.fromText(option.exportValue),
        display: PDFHexString.fromText(option.displayValue),
      })),
    );
    input.multiselect ? field.enableMultiselect() : field.disableMultiselect();
    selectChoiceValues(field.doc, field, selected);
  }
}
export async function addFormField(
  document: PDFDocument,
  raw: FieldDefinition,
  fontBytes: Uint8Array,
): Promise<void> {
  const input = fieldDefinitionSchema.parse(raw),
    form = document.getForm(),
    page = document.getPages()[input.page];
  if (!page) throw new Error("Página do campo inexistente.");
  if (form.getFields().some((field) => field.getName() === input.name))
    throw new Error("Já existe um campo com esse nome.");
  const crop = page.getCropBox(),
    r = ((page.getRotation().angle % 360) + 360) % 360;
  if (r !== 0 && r !== 90 && r !== 180 && r !== 270) throw new Error("Rotação inválida.");
  const width = r % 180 ? crop.height : crop.width,
    height = r % 180 ? crop.width : crop.height;
  const bottom =
    input.box.y +
    (input.kind === "radio" ? (input.options.length - 1) * (input.box.h + 8) : 0) +
    input.box.h;
  if (input.box.x < 0 || input.box.y < 0 || input.box.x + input.box.w > width || bottom > height)
    throw new Error("Os campos precisam ficar dentro da página.");
  const font = await embedFormFont(
    document,
    fontBytes,
    input.choiceOptions?.map((option) => option.displayValue).join("") ?? input.options.join(""),
  );
  const field =
    input.kind === "text"
      ? form.createTextField(input.name)
      : input.kind === "checkbox"
        ? form.createCheckBox(input.name)
        : input.kind === "radio"
          ? form.createRadioGroup(input.name)
          : input.kind === "dropdown"
            ? form.createDropdown(input.name)
            : form.createOptionList(input.name);
  configureField(field, input);
  const add = (box: Box, option?: string) => {
    const c = { x: crop.x, y: crop.y, w: crop.width, h: crop.height },
      a = viewToPdf(r, c, box.x, box.y),
      b = viewToPdf(r, c, box.x + box.w, box.y + box.h);
    const options = {
      x: Math.min(a[0], b[0]),
      y: Math.min(a[1], b[1]),
      width: Math.abs(b[0] - a[0]),
      height: Math.abs(b[1] - a[1]),
      borderWidth: 1,
      borderColor: rgb(0.35, 0.4, 0.5),
      backgroundColor: rgb(0.96, 0.97, 1),
      textColor: rgb(0, 0, 0),
      font,
      rotate: degrees(0),
    };
    if (field instanceof PDFRadioGroup && option !== undefined)
      field.addOptionToPage(option, page, options);
    else if (!(field instanceof PDFRadioGroup)) field.addToPage(page, options);
  };
  if (field instanceof PDFRadioGroup)
    input.options.forEach((option, index) => {
      add({ ...input.box, y: input.box.y + index * (input.box.h + 8) }, option);
    });
  else add(input.box);
  for (const widget of field.acroField.getWidgets())
    widget.dict.set(n("TU"), PDFHexString.fromText(input.label || field.getName()));
  if (
    field instanceof PDFTextField ||
    field instanceof PDFDropdown ||
    field instanceof PDFOptionList
  ) {
    field.setFontSize(input.fontSize);
    if (field instanceof PDFDropdown || field instanceof PDFOptionList)
      field.updateAppearances(font, choiceAppearance);
    else field.updateAppearances(font);
    rememberWidgetFont(document, field, font);
  }
}
export function setFormData(document: PDFDocument, values: Record<string, FormValue>): void {
  const descriptions = describeFields(document),
    form = document.getForm();
  for (const [name, value] of Object.entries(values)) {
    const field = descriptions.find((field) => field.name === name);
    if (!field) throw new Error(`Campo desconhecido: ${name}.`);
    if (field.readOnly) throw new Error(`O campo ${name} é somente leitura.`);
    const error = fieldValueError(value, field);
    if (error) throw new Error(`${name}: ${error}`);
    const target = form.getField(name);
    if (target instanceof PDFTextField && typeof value === "string") target.setText(value);
    else if (target instanceof PDFCheckBox && typeof value === "boolean")
      value ? target.check() : target.uncheck();
    else if (
      target instanceof PDFRadioGroup &&
      typeof value === "string" &&
      field.options.includes(value)
    )
      target.select(value);
    else if (target instanceof PDFDropdown || target instanceof PDFOptionList) {
      selectChoiceValues(document, target, value);
    } else throw new Error(`Tipo de valor incompatível com ${name}.`);
  }
}
export function moveFormWidget(
  document: PDFDocument,
  name: string,
  index: number,
  pageIndex: number,
  rawBox: Box,
): void {
  const box = fieldDefinitionSchema.shape.box.parse(rawBox),
    field = document.getForm().getField(name),
    widget = field.acroField.getWidgets()[z.number().int().nonnegative().parse(index)],
    page = document.getPages()[z.number().int().nonnegative().parse(pageIndex)];
  if (!widget || !page) throw new Error("Campo ou página indisponível.");
  const old = document.getPages().find((page) =>
    page.node
      .Annots()
      ?.asArray()
      .some((ref) => document.context.lookup(ref) === widget.dict),
  );
  const ref = old?.node
    .Annots()
    ?.asArray()
    .find((ref) => document.context.lookup(ref) === widget.dict);
  if (!old || !(ref instanceof PDFRef))
    throw new Error("Widget de formulário sem referência válida.");
  const crop = page.getCropBox(),
    rotation = ((page.getRotation().angle % 360) + 360) % 360;
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270)
    throw new Error("Rotação inválida.");
  const width = rotation % 180 ? crop.height : crop.width,
    height = rotation % 180 ? crop.width : crop.height;
  if (box.x < 0 || box.y < 0 || box.x + box.w > width || box.y + box.h > height)
    throw new Error("O campo precisa ficar dentro da página.");
  const c = { x: crop.x, y: crop.y, w: crop.width, h: crop.height },
    a = viewToPdf(rotation, c, box.x, box.y),
    b = viewToPdf(rotation, c, box.x + box.w, box.y + box.h);
  widget.setRectangle({
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    width: Math.abs(b[0] - a[0]),
    height: Math.abs(b[1] - a[1]),
  });
  if (old !== page) {
    old.node.removeAnnot(ref);
    page.node.addAnnot(ref);
  }
  widget.setP(page.ref);
}
export function setPageTabOrder(
  document: PDFDocument,
  pageIndex: number,
  mode: "rows" | "columns",
): void {
  const page = document.getPages()[z.number().int().nonnegative().parse(pageIndex)];
  if (!page) throw new Error("Página indisponível.");
  page.node.set(n("Tabs"), n(z.enum(["rows", "columns"]).parse(mode) === "rows" ? "R" : "C"));
}
export const formDataSchema = z.strictObject({
  version: z.literal(1),
  fields: z.record(
    z.string().min(1).max(1000),
    z.union([z.string().max(1000000), z.boolean(), z.array(z.string().max(10000)).max(10000)]),
  ),
});
export function exportFormData(fields: FieldDescription[], format: "json" | "csv"): string {
  const values = Object.fromEntries(
    fields
      .filter((field) => field.kind !== "unsupported")
      .map((field) => [field.name, field.value]),
  );
  if (format === "json") return JSON.stringify({ version: 1, fields: values }, null, 2);
  const cell = (text: string) => `"${text.replaceAll('"', '""')}"`;
  return (
    "name,value\r\n" +
    Object.entries(values)
      .map(([name, value]) => [JSON.stringify(name), JSON.stringify(value)].map(cell).join(","))
      .join("\r\n")
  );
}
export function importFormData(text: string, format: "json" | "csv"): Record<string, FormValue> {
  if (text.length > 16_000_000) throw new Error("Dados de formulário acima do limite.");
  if (format === "json")
    return formDataSchema.parse(JSON.parse(text.replace(/^\uFEFF/, ""))).fields;
  const rows: string[][] = [],
    row: string[] = [];
  let cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let index = 0; index <= text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if ((char === "," || char === "\n" || char === undefined) && !quoted) {
      row.push(cell);
      cell = "";
      if (char !== ",") {
        if (row.some(Boolean)) rows.push([...row]);
        row.length = 0;
      }
    } else if (char !== "\r" || quoted) cell += char;
  }
  if (quoted || rows.shift()?.join(",") !== "name,value")
    throw new Error("Use o CSV de formulário exportado pelo EdiPDF (name,value).");
  const entries = rows.map((row) => {
    if (row.length !== 2) throw new Error("Linha CSV inválida.");
    const name: unknown = JSON.parse(row[0]);
    if (typeof name !== "string") throw new Error("Nome de campo inválido.");
    return [name, JSON.parse(row[1])] as const;
  });
  if (new Set(entries.map(([name]) => name)).size !== entries.length)
    throw new Error("Campos repetidos no arquivo.");
  return formDataSchema.parse({ version: 1, fields: Object.fromEntries(entries) }).fields;
}
