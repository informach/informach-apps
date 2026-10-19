import {
  PDFArray,
  PDFContentStream,
  PDFDict,
  type PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
} from "pdf-lib";
import { decodeBoundedPdfStream } from "./bounded-pdf-stream.ts";

type Matrix = [number, number, number, number, number, number];
const identity = (): Matrix => [1, 0, 0, 1, 0, 0];
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
type Token =
  | { kind: "number"; value: number }
  | { kind: "name" | "operator" | "other"; value: string };
const white = (c: string) => [0, 9, 10, 12, 13, 32].includes(c.charCodeAt(0));
const delimiter = (c: string) => white(c) || "()<>[]{}/%".includes(c);

/** Strings, hex strings, comments and composite operands cannot masquerade as graphics operators. */
function* tokens(content: string): Generator<Token> {
  let offset = 0,
    composite = 0,
    count = 0;
  while (offset < content.length) {
    if (++count > 2_000_000) throw new Error("Conteúdo gráfico excede o limite de análise.");
    const c = content[offset];
    if (white(c)) {
      offset++;
      continue;
    }
    if (c === "%") {
      while (offset < content.length && !/[\r\n]/.test(content[offset])) offset++;
      continue;
    }
    if (c === "(") {
      let depth = 1;
      offset++;
      while (offset < content.length && depth) {
        const next = content[offset++];
        if (next === "\\") {
          offset++;
          continue;
        }
        if (next === "(") depth++;
        if (next === ")") depth--;
      }
      if (depth) throw new Error("String PDF incompleta.");
      if (!composite) yield { kind: "other", value: "string" };
      continue;
    }
    if (c === "<" && content[offset + 1] !== "<") {
      const end = content.indexOf(">", offset + 1);
      if (end < 0) throw new Error("String hexadecimal incompleta.");
      offset = end + 1;
      if (!composite) yield { kind: "other", value: "hex" };
      continue;
    }
    if (c === "[" || content.slice(offset, offset + 2) === "<<") {
      composite++;
      if (composite > 100) throw new Error("Operandos PDF profundos demais.");
      offset += c === "[" ? 1 : 2;
      continue;
    }
    if (c === "]" || content.slice(offset, offset + 2) === ">>") {
      if (!composite) throw new Error("Operando PDF sem abertura.");
      composite--;
      offset += c === "]" ? 1 : 2;
      if (!composite) yield { kind: "other", value: "composite" };
      continue;
    }
    const name = c === "/";
    if (name) offset++;
    const start = offset;
    while (offset < content.length && !delimiter(content[offset])) offset++;
    if (offset === start) throw new Error("Token PDF inesperado.");
    const value = content.slice(start, offset);
    if (composite) continue;
    if (name)
      yield {
        kind: "name",
        value: value.replace(/#([a-f\d]{2})/gi, (_, hex: string) =>
          String.fromCharCode(Number.parseInt(hex, 16)),
        ),
      };
    else if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value))
      yield { kind: "number", value: Number(value) };
    else yield { kind: "operator", value };
  }
  if (composite) throw new Error("Operando PDF incompleto.");
}

/** Long-side pixel budget for every referenced image, based on its largest physical use.
 * Unknown/inline content conservatively makes images reachable from that resource scope ineligible. */
export function imagePixelBudgets(
  doc: PDFDocument,
  dpi: number,
): { budgets: Map<PDFRef, number>; warnings: string[] } {
  const budgets = new Map<PDFRef, number>(),
    unknown = new Set<PDFRef>();
  const warnings = new Set<string>();
  let currentPage = 0;
  let work = 0,
    preserveAll = false;
  const report = (error: unknown) =>
    warnings.add(
      `Página ${currentPage + 1}: imagens preservadas porque a geometria não pôde ser analisada (${error instanceof Error ? error.message : "conteúdo desconhecido"}).`,
    );
  const markUnknown = (resources: PDFDict) => {
    const seen = new Set<PDFDict>(),
      pending = [resources];
    for (let current = pending.pop(); current; current = pending.pop()) {
      if (seen.has(current)) continue;
      seen.add(current);
      if (seen.size > 100_000) {
        preserveAll = true;
        warnings.add("Grafo de recursos grande demais; todas as imagens foram preservadas.");
        return;
      }
      const xobjects = current.lookupMaybe(PDFName.of("XObject"), PDFDict);
      for (const [, value] of xobjects?.entries() ?? []) {
        if (!(value instanceof PDFRef)) continue;
        const stream = doc.context.lookup(value);
        if (!(stream instanceof PDFRawStream)) continue;
        if (stream.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")) unknown.add(value);
        const nested = stream.dict.lookupMaybe(PDFName.of("Resources"), PDFDict);
        if (nested) pending.push(nested);
      }
    }
  };
  const visit = (
    content: string,
    resources: PDFDict,
    initial: Matrix,
    unit: number,
    ancestors: Set<PDFRef>,
  ) => {
    let matrix = initial;
    const stack: Matrix[] = [],
      args: Token[] = [];
    try {
      for (const token of tokens(content)) {
        if (++work > 2_000_000)
          throw new Error("A análise gráfica excedeu o limite de trabalho deste documento.");
        if (token.kind !== "operator") {
          args.push(token);
          if (args.length > 1000) throw new Error("Operandos gráficos demais.");
          continue;
        }
        if (token.value === "BI") throw new Error("Imagem inline requer preservação conservadora.");
        if (token.value === "q") {
          if (stack.length >= 100) throw new Error("Pilha gráfica profunda demais.");
          stack.push([...matrix]);
        } else if (token.value === "Q") {
          const previous = stack.pop();
          if (!previous) throw new Error("Pilha gráfica inválida.");
          matrix = previous;
        } else if (token.value === "cm") {
          if (
            args.length !== 6 ||
            args.some((arg) => arg.kind !== "number" || !Number.isFinite(arg.value))
          )
            throw new Error("Matriz gráfica inválida.");
          const values = args.map((arg) => Number(arg.value));
          matrix = multiply(matrix, [
            values[0],
            values[1],
            values[2],
            values[3],
            values[4],
            values[5],
          ]);
        } else if (token.value === "Do") {
          if (args.length !== 1 || args[0].kind !== "name")
            throw new Error("Objeto gráfico sem nome.");
          const xobjects = resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
          const ref = xobjects?.get(PDFName.of(args[0].value));
          if (!(ref instanceof PDFRef)) throw new Error("Referência gráfica desconhecida.");
          const stream = doc.context.lookup(ref);
          if (!(stream instanceof PDFRawStream)) throw new Error("Stream gráfico indisponível.");
          const subtype = stream.dict.get(PDFName.of("Subtype"));
          if (subtype === PDFName.of("Image")) {
            const width = stream.dict.lookupMaybe(PDFName.of("Width"), PDFNumber)?.asNumber();
            const height = stream.dict.lookupMaybe(PDFName.of("Height"), PDFNumber)?.asNumber();
            if (!width || !height) throw new Error("Dimensão de imagem inválida.");
            const scale =
              (Math.max(
                Math.hypot(matrix[0], matrix[1]) / width,
                Math.hypot(matrix[2], matrix[3]) / height,
              ) *
                unit *
                dpi) /
              72;
            const budget = Math.max(width, height) * Math.min(1, scale);
            if (!Number.isFinite(budget) || budget <= 0) unknown.add(ref);
            else budgets.set(ref, Math.max(budgets.get(ref) ?? 0, budget));
          } else if (subtype === PDFName.of("Form")) {
            if (ancestors.has(ref) || ancestors.size >= 30)
              throw new Error("Grupo gráfico cíclico/profundo demais.");
            const raw = stream.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray);
            const values = raw?.asArray().map((value) => doc.context.lookup(value));
            let transform = identity();
            if (values) {
              if (values.length !== 6 || values.some((value) => !(value instanceof PDFNumber)))
                throw new Error("Matriz de grupo inválida.");
              const nums = values.map((value) =>
                value instanceof PDFNumber ? value.asNumber() : NaN,
              );
              transform = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
            }
            const nested = stream.dict.lookupMaybe(PDFName.of("Resources"), PDFDict) ?? resources;
            const decoded = decodeBoundedPdfStream(stream, 32 * 1024 * 1024);
            if (decoded.length > 32 * 1024 * 1024) throw new Error("Grupo gráfico grande demais.");
            visit(
              new TextDecoder("latin1").decode(decoded),
              nested,
              multiply(matrix, transform),
              unit,
              new Set([...ancestors, ref]),
            );
          }
        }
        args.length = 0;
      }
      if (stack.length) throw new Error("Pilha gráfica incompleta.");
    } catch (error) {
      markUnknown(resources);
      report(error);
    }
  };
  const pages = doc.getPages();
  for (let index = 0; index < pages.length; index++) {
    currentPage = index;
    const page = pages[index];
    const resources = page.node.Resources();
    if (!resources) continue;
    try {
      const raw = page.node.Contents();
      const streams =
        raw instanceof PDFArray
          ? raw.asArray().map((ref) => doc.context.lookup(ref))
          : raw
            ? [raw]
            : [];
      const contents: string[] = [];
      let size = 0;
      for (const stream of streams) {
        if (!(stream instanceof PDFRawStream) && !(stream instanceof PDFContentStream))
          throw new Error("Conteúdo de página desconhecido.");
        const decoded =
          stream instanceof PDFRawStream
            ? decodeBoundedPdfStream(stream, 32 * 1024 * 1024)
            : stream.getUnencodedContents();
        size += decoded.length;
        if (size > 32 * 1024 * 1024) throw new Error("Página gráfica grande demais.");
        contents.push(new TextDecoder("latin1").decode(decoded));
      }
      const unit = page.node.lookupMaybe(PDFName.of("UserUnit"), PDFNumber)?.asNumber() ?? 1;
      if (!(unit > 0) || !Number.isFinite(unit)) throw new Error("Unidade de página inválida.");
      visit(contents.join("\n"), resources, identity(), unit, new Set());
    } catch (error) {
      markUnknown(resources);
      report(error);
    }
  }
  for (const ref of unknown) budgets.delete(ref);
  if (preserveAll) budgets.clear();
  return {
    budgets,
    warnings:
      warnings.size > 50
        ? [...warnings]
            .slice(0, 50)
            .concat(
              `Mais ${warnings.size - 50} ocorrências de geometria não suportada; essas imagens foram preservadas.`,
            )
        : [...warnings],
  };
}
