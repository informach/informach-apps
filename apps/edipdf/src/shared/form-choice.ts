import {
  adjustDimsForRotation,
  type Color,
  componentsToColor,
  drawOptionList,
  drawTextField,
  type PDFDocument,
  PDFDropdown,
  type PDFFont,
  PDFHexString,
  PDFName,
  PDFNumber,
  type PDFOptionList,
  type PDFWidgetAnnotation,
  rgb,
  rotateInPlace,
  setFillingColor,
  setFontAndSize,
} from "pdf-lib";
import type { FormValue } from "./model.ts";

export interface ChoiceOption {
  exportValue: string;
  displayValue: string;
}
export type ChoiceField = PDFDropdown | PDFOptionList;
export function choiceOptions(field: ChoiceField): ChoiceOption[] {
  const options = field.acroField.getOptions();
  if (options.length > 10000) throw new Error("O campo excede o limite local de dez mil opções.");
  const result = options.map(({ value, display }) => ({
    exportValue: value.decodeText(),
    displayValue: (display ?? value).decodeText(),
  }));
  let total = 0;
  for (const option of result) {
    total += option.exportValue.length + option.displayValue.length;
    if (
      option.exportValue.length > 100000 ||
      option.displayValue.length > 100000 ||
      total > 1000000
    )
      throw new Error("O texto das opções excede o limite local.");
  }
  return result;
}

/** Store export values and sorted option indices, not pdf-lib's display-value selection. */
export function selectChoiceValues(
  document: PDFDocument,
  field: ChoiceField,
  value: FormValue,
): void {
  if (typeof value === "boolean") throw new Error("Uma seleção precisa de valores de texto.");
  const values = Array.isArray(value) ? value : value === "" ? [] : [value];
  if (values.length > 10000) throw new Error("Seleção acima do limite local de dez mil valores.");
  if (new Set(values).size !== values.length) throw new Error("Valores de seleção repetidos.");
  if (!field.isMultiselect() && values.length > 1)
    throw new Error("Este campo permite somente uma opção.");
  const options = choiceOptions(field);
  const indices = new Map<string, number[]>();
  options.forEach((option, index) => {
    const existing = indices.get(option.exportValue);
    if (existing) existing.push(index);
    else indices.set(option.exportValue, [index]);
  });
  const selected = values
    .map((item) => {
      const matches = indices.get(item) ?? [];
      if (matches.length > 1) throw new Error("Opções com o mesmo valor interno são ambíguas.");
      if (!matches.length && !(field instanceof PDFDropdown && field.isEditable()))
        throw new Error(`O valor “${item}” não pertence às opções deste campo.`);
      return { value: item, index: matches[0] ?? -1 };
    })
    .sort((a, b) => a.index - b.index);
  const dict = field.acroField.dict;
  if (!selected.length) dict.delete(PDFName.of("V"));
  else
    dict.set(
      PDFName.of("V"),
      selected.length === 1
        ? PDFHexString.fromText(selected[0].value)
        : document.context.obj(selected.map((item) => PDFHexString.fromText(item.value))),
    );
  if (selected.length && selected.every((item) => item.index >= 0))
    dict.set(PDFName.of("I"), document.context.obj(selected.map((item) => item.index)));
  else dict.delete(PDFName.of("I"));
  document.getForm().markFieldAsDirty(field.ref);
}

const numberPattern = "[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?";
function appearanceStyle(appearance: string | undefined): { size?: number; color?: Color } {
  const source = appearance ?? "";
  if (source.length > 16384) throw new Error("Aparência padrão do campo acima do limite local.");
  let size: number | undefined, color: Color | undefined;
  for (const match of source.matchAll(
    new RegExp(`/[^\\s/]+\\s+(${numberPattern})\\s+Tf\\b`, "g"),
  )) {
    size = Number(match[1]);
    if (!Number.isFinite(size) || size < 0 || size > 1000)
      throw new Error("Tamanho de fonte inválido na aparência do campo.");
  }
  for (const match of source.matchAll(
    new RegExp(`((?:${numberPattern}\\s+){1,4})(g|rg|k)\\b`, "g"),
  )) {
    const values = match[1].trim().split(/\s+/).map(Number);
    const count = match[2] === "g" ? 1 : match[2] === "rg" ? 3 : 4;
    if (
      values.length !== count ||
      values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    )
      throw new Error("Cor inválida na aparência do campo.");
    color = componentsToColor(values);
  }
  return { size, color };
}

/** Public appearance-provider extension; /Opt, /V and /I remain unchanged while drawing labels. */
export function choiceAppearance(field: ChoiceField, widget: PDFWidgetAnnotation, font: PDFFont) {
  const fieldStyle = appearanceStyle(field.acroField.getDefaultAppearance());
  const widgetStyle = appearanceStyle(widget.getDefaultAppearance());
  const rectangle = widget.getRectangle(),
    characteristics = widget.getAppearanceCharacteristics();
  const rotation = (((characteristics?.getRotation() ?? 0) % 360) + 360) % 360;
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270)
    throw new Error("Rotação de campo não suportada.");
  const { width, height } = adjustDimsForRotation(rectangle, rotation);
  const borderWidth = widget.getBorderStyle()?.getWidth() ?? 0;
  if (
    !Number.isFinite(borderWidth) ||
    borderWidth < 0 ||
    borderWidth * 2 + 2 >= Math.min(width, height)
  )
    throw new Error("Área útil do campo inválida.");
  const options = choiceOptions(field),
    selected = field.getSelected();
  const selectedLabels = selected.map(
    (value) => options.find((option) => option.exportValue === value)?.displayValue ?? value,
  );
  const textColor = widgetStyle.color ?? fieldStyle.color ?? rgb(0, 0, 0);
  const padding = borderWidth + 1;
  const availableWidth = width - padding * 2,
    availableHeight = height - padding * 2;
  const top = field.acroField.dict.lookup(PDFName.of("TI"));
  const topIndex = top instanceof PDFNumber ? top.asNumber() : 0;
  if (!Number.isInteger(topIndex) || topIndex < 0 || topIndex > options.length)
    throw new Error("Índice de rolagem da lista inválido.");
  const labels =
    field instanceof PDFDropdown
      ? [selectedLabels[0] ?? ""]
      : options.slice(topIndex).map((option) => option.displayValue);
  if (labels.some((label) => /[\r\n\0]/.test(label)))
    throw new Error(
      "Rótulos com controles ou múltiplas linhas não têm aparência editável neste perfil.",
    );
  // Choices are single lines; long labels are clipped by the field, not rewritten or wrapped.
  let fontSize = widgetStyle.size ?? fieldStyle.size ?? 0;
  if (!fontSize) {
    const longest = labels.reduce(
      (maximum, label) => Math.max(maximum, font.widthOfTextAtSize(label, 1)),
      1,
    );
    fontSize = Math.min(12, availableWidth / longest, availableHeight / font.heightAtSize(1));
  }
  if (!Number.isFinite(fontSize) || fontSize <= 0)
    throw new Error("Não foi possível compor a fonte na área útil do campo.");
  const lineHeight = fontSize * 1.2;
  const lines = labels.map((label, index) => ({
    text: label,
    encoded: font.encodeText(label),
    x: padding,
    y:
      field instanceof PDFDropdown
        ? (height - font.heightAtSize(fontSize, { descender: false })) / 2
        : height - padding - font.heightAtSize(fontSize, { descender: false }) - index * lineHeight,
    height: font.heightAtSize(fontSize),
  }));
  const defaults = `${setFillingColor(textColor)}\n${setFontAndSize(font.name, fontSize)}`;
  if (widgetStyle.size !== undefined || widgetStyle.color !== undefined)
    widget.setDefaultAppearance(defaults);
  else field.acroField.setDefaultAppearance(defaults);
  const common = {
    x: borderWidth / 2,
    y: borderWidth / 2,
    width: width - borderWidth,
    height: height - borderWidth,
    borderWidth,
    borderColor: componentsToColor(characteristics?.getBorderColor()),
    color: componentsToColor(characteristics?.getBackgroundColor()),
    textLines: lines,
    textColor,
    font: font.name,
    fontSize,
    padding: 1,
  };
  return [
    ...rotateInPlace({ ...rectangle, rotation }),
    ...(field instanceof PDFDropdown
      ? drawTextField(common)
      : drawOptionList({
          ...common,
          lineHeight,
          selectedColor: rgb(0.6, 0.76, 0.85),
          selectedLines: options
            .slice(topIndex)
            .flatMap((option, index) => (selected.includes(option.exportValue) ? [index] : [])),
        })),
  ];
}
