import { SVG_SOURCE_BYTES } from "./svgImport.js";
export async function readSvgFile(file: File) {
  if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml")
    throw new Error("Escolha um arquivo SVG não comprimido.");
  if (file.size > SVG_SOURCE_BYTES) throw new Error("SVG excede 1,5 MB em UTF-8.");
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > SVG_SOURCE_BYTES) throw new Error("SVG excede 1,5 MB em UTF-8.");
  return {
    source: new TextDecoder("utf-8", { fatal: true }).decode(buffer),
    name:
      file.name
        .replace(/\.svg$/i, "")
        .trim()
        .slice(0, 120) || "SVG importado",
  };
}
export function bindSvgIngress(
  open: (source: string, name: string) => void,
  openFile: (file: File) => void,
  report: (message: string) => void,
) {
  const editable = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    if (target.closest("input,textarea,select")) return true;
    let element: Element | null = target;
    while (element) {
      if (element instanceof HTMLElement) return element.isContentEditable;
      element = element.parentElement;
    }
    return false;
  };
  const nativeFileInput = (target: EventTarget | null) =>
    target instanceof HTMLInputElement && target.type === "file" && !target.matches(":disabled");
  const drop = (event: DragEvent) => {
    const data = event.dataTransfer;
    if (!data || (!data.types.includes("Files") && !data.files.length)) return;
    // Native file inputs own selection/change; every other file drop must be
    // prevented even when global import is ineligible, or the browser may navigate.
    if (nativeFileInput(event.target)) return;
    event.preventDefault();
    if (editable(event.target) || document.querySelector("dialog[open]")) return;
    if (data.files.length !== 1) {
      report("Importe um SVG por vez; nenhum arquivo foi importado.");
      return;
    }
    const file = data.files[0];
    if (file) openFile(file);
  };
  const drag = (event: DragEvent) => {
    const data = event.dataTransfer;
    if (!data?.types.includes("Files") || nativeFileInput(event.target)) return;
    event.preventDefault();
    data.dropEffect =
      editable(event.target) || document.querySelector("dialog[open]") ? "none" : "copy";
  };
  const paste = (event: ClipboardEvent) => {
    if (editable(event.target) || document.querySelector("dialog[open]")) return;
    const source =
      event.clipboardData?.getData("image/svg+xml") || event.clipboardData?.getData("text/plain");
    if (!source || !/^\s*(?:<\?xml\b|<svg\b|<!DOCTYPE\b)/i.test(source)) return;
    event.preventDefault();
    open(source, "SVG colado");
  };
  window.addEventListener("drop", drop, true);
  window.addEventListener("dragover", drag, true);
  document.addEventListener("paste", paste);
  return () => {
    window.removeEventListener("drop", drop, true);
    window.removeEventListener("dragover", drag, true);
    document.removeEventListener("paste", paste);
  };
}
