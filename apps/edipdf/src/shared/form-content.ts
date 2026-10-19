import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  type PDFPage,
  PDFRawStream,
} from "pdf-lib";
import { decodeBoundedPdfStream } from "./bounded-pdf-stream.ts";
import { pruneUnreachable } from "./compress.ts";
import { type EngineOperation, engineOperationSchema } from "./engine-contracts.ts";
import type { LocalPdfEngine } from "./local-engine.ts";
import { livePdfPages } from "./pdf-pages.ts";

type Matrix = [number, number, number, number, number, number];
interface Placement {
  name: PDFName;
  start: number;
  end: number;
  matrix: Matrix;
}
export interface FormOccurrence {
  index: number;
  name: string;
  matrix: Matrix;
  bbox: [number, number, number, number];
}
const identity = (): Matrix => [1, 0, 0, 1, 0, 0];
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const unsupported = () =>
  new Error("Este grupo ainda está fora do perfil de edição interna. Preserve o original.");
function decode(stream: PDFRawStream, limit: number): Uint8Array {
  if (stream.dict.has(PDFName.of("DecodeParms"))) throw unsupported();
  return decodeBoundedPdfStream(stream, limit);
}
function pageContents(page: PDFPage, limit: number): Uint8Array {
  const contents = page.node.Contents(),
    parts: Uint8Array[] = [];
  let total = 0;
  const add = (stream: unknown) => {
    if (!(stream instanceof PDFRawStream)) throw unsupported();
    const bytes = decode(stream, limit);
    total += bytes.length + 1;
    if (total > limit) throw new Error("Conteúdo do grupo acima do limite local.");
    parts.push(bytes);
  };
  if (contents instanceof PDFArray) {
    if (contents.size() > 256) throw unsupported();
    for (let index = 0; index < contents.size(); index++) add(contents.lookup(index));
  } else if (contents) add(contents);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const bytes of parts) {
    joined.set(bytes, offset);
    offset += bytes.length;
    joined[offset++] = 10;
  }
  return joined;
}
function latin1(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16384)
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 16384)));
  return parts.join("");
}
/** Initial profile: only balanced q/cm/Do/Q page wrappers. Never guess operator boundaries. */
function placements(content: string): Placement[] {
  const clean = content.replace(/%[^\r\n]*/g, (comment) => " ".repeat(comment.length)),
    token = /\s+|\/[A-Za-z0-9_.#-]+|[+-]?(?:\d+\.?\d*|\.\d+)|[A-Za-z]+/y,
    stack: Matrix[] = [],
    operands: { value: number | PDFName; start: number; end: number }[] = [],
    result: Placement[] = [];
  let matrix = identity(),
    at = 0,
    tokens = 0;
  while (at < clean.length) {
    if (++tokens > 100000) throw unsupported();
    token.lastIndex = at;
    const match = token.exec(clean);
    if (!match) throw unsupported();
    const word = match[0],
      start = at;
    at = token.lastIndex;
    if (/^\s/.test(word)) continue;
    if (word.startsWith("/")) {
      const name = word.slice(1);
      if (/#(?![a-f\d]{2})/i.test(name)) throw unsupported();
      operands.push({
        value: PDFName.of(
          name.replace(/#([a-f\d]{2})/gi, (_, hex: string) =>
            String.fromCharCode(Number.parseInt(hex, 16)),
          ),
        ),
        start,
        end: at,
      });
    } else if (/^[+\-.\d]/.test(word)) {
      const number = Number(word);
      if (!Number.isFinite(number) || Math.abs(number) > 1e7) throw unsupported();
      operands.push({ value: number, start, end: at });
    } else if (word === "q" && !operands.length) {
      if (stack.length >= 64) throw unsupported();
      stack.push(matrix);
      matrix = [...matrix];
    } else if (word === "Q" && !operands.length) {
      const previous = stack.pop();
      if (!previous) throw unsupported();
      matrix = previous;
    } else if (word === "cm" && operands.length === 6) {
      const values = operands.map((operand) => operand.value);
      if (!values.every((value): value is number => typeof value === "number")) throw unsupported();
      matrix = multiply(matrix, [values[0], values[1], values[2], values[3], values[4], values[5]]);
      if (matrix.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e7))
        throw unsupported();
      operands.length = 0;
    } else if (word === "Do" && operands.length === 1) {
      const operand = operands[0];
      if (!(operand.value instanceof PDFName) || result.length >= 1000) throw unsupported();
      result.push({
        name: operand.value,
        start: operand.start,
        end: operand.end,
        matrix: [...matrix],
      });
      operands.length = 0;
    } else throw unsupported();
    if (operands.length > 6) throw unsupported();
  }
  if (operands.length || stack.length || !result.length) throw unsupported();
  return result;
}
function pageAt(document: PDFDocument, index: number): PDFPage {
  if (!Number.isInteger(index) || index < 0) throw new Error("Página inválida.");
  if (document.catalog.has(PDFName.of("StructTreeRoot"))) throw unsupported();
  const page = livePdfPages(document)[index];
  if (!page || page.node.has(PDFName.of("Group"))) throw unsupported();
  return page;
}
function formAt(
  page: PDFPage,
  placement: Placement,
): { stream: PDFRawStream; bbox: [number, number, number, number]; resources: PDFDict } {
  const resources = page.node.Resources(),
    xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict),
    stream = xobjects?.lookup(placement.name);
  if (
    !(stream instanceof PDFRawStream) ||
    stream.dict.get(PDFName.of("Subtype")) !== PDFName.of("Form")
  )
    throw unsupported();
  for (const key of ["Group", "OC", "Ref", "OPI", "PS", "StructParent", "StructParents"])
    if (stream.dict.has(PDFName.of(key))) throw unsupported();
  const array = stream.dict.lookupMaybe(PDFName.of("BBox"), PDFArray);
  if (array?.size() !== 4) throw unsupported();
  const numbers = array.asArray().map((item) => stream.dict.context.lookup(item));
  if (!numbers.every((item): item is PDFNumber => item instanceof PDFNumber)) throw unsupported();
  const [left, bottom, right, top] = numbers.map((item) => item.asNumber());
  if (
    ![left, bottom, right, top].every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 1e7,
    ) ||
    right <= left ||
    top <= bottom
  )
    throw unsupported();
  const formMatrix = stream.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray);
  if (
    formMatrix &&
    (formMatrix.size() !== 6 ||
      formMatrix.asArray().some((item, index) => {
        const value = stream.dict.context.lookup(item);
        return !(value instanceof PDFNumber) || value.asNumber() !== identity()[index];
      }))
  )
    throw unsupported();
  const ownResources = stream.dict.lookupMaybe(PDFName.of("Resources"), PDFDict) ?? resources;
  if (!ownResources) throw unsupported();
  return { stream, bbox: [left, bottom, right, top], resources: ownResources };
}
/** Resource maps are private; their font/image/program objects can remain shared and immutable. */
function privateResources(resources: PDFDict): PDFDict {
  const clone = resources.clone();
  for (const [name, object] of resources.entries()) {
    const value = resources.context.lookup(object);
    if (value instanceof PDFDict) clone.set(name, value.clone());
  }
  return clone;
}
function assertInput(bytes: Uint8Array): void {
  if (!bytes.length || bytes.length > 64 * 1024 * 1024)
    throw new Error("Edição interna limitada a revisões de até 64 MB.");
}
export async function listFormOccurrences(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<FormOccurrence[]> {
  assertInput(bytes);
  const document = await PDFDocument.load(bytes, { updateMetadata: false }),
    page = pageAt(document, pageIndex);
  return placements(latin1(pageContents(page, 1024 * 1024))).map((placement, index) => {
    const { bbox } = formAt(page, placement);
    return { index, name: placement.name.decodeText(), matrix: placement.matrix, bbox };
  });
}
export async function prepareFormContent(
  bytes: Uint8Array,
  pageIndex: number,
  occurrence: number,
): Promise<{ bytes: Uint8Array; page: number; occurrence: FormOccurrence }> {
  assertInput(bytes);
  const document = await PDFDocument.load(bytes, { updateMetadata: false }),
    page = pageAt(document, pageIndex),
    placement = placements(latin1(pageContents(page, 1024 * 1024)))[occurrence];
  if (!Number.isInteger(occurrence) || occurrence < 0 || !placement)
    throw new Error("Ocorrência de grupo inexistente.");
  const { stream, bbox, resources } = formAt(page, placement),
    [left, bottom, right, top] = bbox,
    temporaryIndex = livePdfPages(document).length,
    temporary = document.addPage([right - left, top - bottom]);
  temporary.setMediaBox(left, bottom, right - left, top - bottom);
  temporary.node.set(PDFName.of("Resources"), privateResources(resources));
  // A private stream prevents PDFium from rewriting the original Form through a shared ref.
  temporary.node.set(
    PDFName.of("Contents"),
    document.context.register(document.context.flateStream(decode(stream, 16 * 1024 * 1024))),
  );
  const standalone = await PDFDocument.create(),
    [copied] = await standalone.copyPages(document, [temporaryIndex]);
  if (!copied) throw unsupported();
  standalone.addPage(copied);
  return {
    bytes: await standalone.save({ updateFieldAppearances: false }),
    page: 0,
    occurrence: {
      index: occurrence,
      name: placement.name.decodeText(),
      matrix: placement.matrix,
      bbox,
    },
  };
}
/** Edit a standalone content page, then replace only the selected Do with a new Form resource. */
export async function transformFormContent(
  engine: LocalPdfEngine,
  bytes: Uint8Array,
  pageIndex: number,
  occurrence: number,
  operation: EngineOperation,
): Promise<Uint8Array> {
  const parsed = engineOperationSchema.parse(operation);
  if (parsed.kind === "redact") throw new Error("Use a remoção segura na página, com sanitização.");
  const prepared = await prepareFormContent(bytes, pageIndex, occurrence),
    transformed = engine.transform(prepared.bytes, [{ ...parsed, page: prepared.page }]);
  return mergeEditedFormContent(bytes, pageIndex, occurrence, transformed);
}

export async function mergeEditedFormContent(
  bytes: Uint8Array,
  pageIndex: number,
  occurrence: number,
  editedBytes: Uint8Array,
): Promise<Uint8Array> {
  assertInput(bytes);
  assertInput(editedBytes);
  const edited = await PDFDocument.load(editedBytes, { updateMetadata: false }),
    document = await PDFDocument.load(bytes, { updateMetadata: false }),
    page = pageAt(document, pageIndex),
    content = latin1(pageContents(page, 1024 * 1024)),
    placement = placements(content)[occurrence];
  if (!placement) throw new Error("A ocorrência do grupo mudou durante a edição.");
  if (livePdfPages(edited).length !== 1) throw unsupported();
  const original = formAt(page, placement),
    [temporary] = await document.copyPages(edited, [0]);
  if (!temporary) throw unsupported();
  const resources = temporary.node.Resources();
  if (!resources) throw unsupported();
  const replacement = document.context.flateStream(pageContents(temporary, 16 * 1024 * 1024));
  for (const [name, value] of original.stream.dict.entries())
    if (!["Length", "Filter", "DecodeParms", "Resources"].includes(name.decodeText()))
      replacement.dict.set(name, value);
  replacement.dict.set(PDFName.of("Resources"), privateResources(resources));
  const pageResources = page.node.Resources();
  if (!pageResources) throw unsupported();
  const privatePageResources = privateResources(pageResources),
    xobjects = privatePageResources.lookupMaybe(PDFName.of("XObject"), PDFDict);
  if (!xobjects) throw unsupported();
  let index = 1;
  while (xobjects.has(PDFName.of(`EdiFormCopy${index}`))) {
    if (++index > 10000) throw unsupported();
  }
  const name = PDFName.of(`EdiFormCopy${index}`);
  xobjects.set(name, document.context.register(replacement));
  page.node.set(PDFName.of("Resources"), privatePageResources);
  const rewritten =
    content.slice(0, placement.start) + name.toString() + content.slice(placement.end);
  page.node.set(
    PDFName.of("Contents"),
    document.context.register(
      document.context.flateStream(Uint8Array.from(rewritten, (char) => char.charCodeAt(0))),
    ),
  );
  await document.flush();
  pruneUnreachable(document);
  return document.save({ updateFieldAppearances: false });
}
