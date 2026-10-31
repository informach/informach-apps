import { z } from "zod";
import { imageAssetSchema, parseAsset } from "./assets/model";
import { type InteractiveDocument, parseInteractiveDocument } from "./interactiveDocument";

export const ANIMATION_ARTIFACT_VERSION = 1;
export const ANIMATION_ARTIFACT_BYTES = 10_000_000;

const envelope = z.strictObject({
  format: z.literal("edi-animation"),
  version: z.literal(ANIMATION_ARTIFACT_VERSION),
  title: z.string().trim().min(1).max(200),
  fit: z.enum(["contain", "cover", "stretch"]),
  autoplay: z.boolean(),
  respectReducedMotion: z.boolean(),
  pauseOffscreen: z.boolean(),
  poster: imageAssetSchema
    .refine((value) => value.width <= 1024 && value.height <= 1024, "A prévia excede 1024 pixels.")
    .optional(),
  document: z.unknown(),
});

export interface AnimationArtifact extends Omit<z.infer<typeof envelope>, "document"> {
  document: InteractiveDocument;
}

/** Public input names are part of the artwork's API, not inferred from generated IDs. */
export function animationControls(artifact: AnimationArtifact) {
  return {
    inputs: artifact.document.behavior.inputs.map(({ id, name, kind }) => ({ id, name, kind })),
    events: [...new Set(artifact.document.behavior.events.map(({ name }) => name))],
  };
}

function preflight(input: unknown) {
  const ancestors = new Set<object>();
  let work = 0,
    text = 0;
  const encoder = new TextEncoder();
  function visit(value: unknown, depth: number) {
    if (++work > 200000 || depth > 128)
      throw new Error("Animação excede o limite de profundidade ou de elementos.");
    if (typeof value === "string") {
      if (value.length > ANIMATION_ARTIFACT_BYTES - text)
        throw new Error("Animação excede o tamanho permitido.");
      text += encoder.encode(value).byteLength;
      if (text > ANIMATION_ARTIFACT_BYTES) throw new Error("Animação excede o tamanho permitido.");
    } else if (value !== null && typeof value === "object") {
      if (ancestors.has(value)) throw new Error("Animação contém uma referência circular.");
      const prototype = Object.getPrototypeOf(value);
      if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null)
        throw new Error("Animação precisa conter somente dados JSON.");
      ancestors.add(value);
      for (const [key, item] of Object.entries(value)) {
        visit(key, depth + 1);
        visit(item, depth + 1);
      }
      ancestors.delete(value);
    } else if (
      typeof value === "function" ||
      typeof value === "symbol" ||
      typeof value === "bigint"
    ) {
      throw new Error("Animação precisa conter somente dados JSON.");
    }
  }
  visit(input, 0);
}

/** DOM-free boundary shared by the exporter, upload service and browser player. */
export function parseAnimationArtifact(input: unknown): AnimationArtifact {
  let value = input;
  if (typeof value === "string") {
    if (
      value.length > ANIMATION_ARTIFACT_BYTES ||
      new TextEncoder().encode(value).byteLength > ANIMATION_ARTIFACT_BYTES
    )
      throw new Error("Animação excede o tamanho permitido.");
    value = JSON.parse(value);
  }
  preflight(value);
  const parsed = envelope.parse(value, { jitless: true });
  if (parsed.poster) parseAsset(parsed.poster);
  const document = parseInteractiveDocument(parsed.document);
  if (!document.visual) throw new Error("Animação precisa incluir a descrição visual portátil.");
  if (!document.content.length)
    throw new Error("A prancheta selecionada está vazia. Escolha a prancheta com o desenho.");
  const names = new Set<string>();
  for (const input of document.behavior.inputs) {
    if (names.has(input.name))
      throw new Error(
        "Os controles da animação têm nomes repetidos. Renomeie os inputs antes de exportar.",
      );
    names.add(input.name);
  }
  names.clear();
  for (const machine of document.behavior.machines) {
    if (names.has(machine.name))
      throw new Error("As máquinas da animação têm nomes repetidos. Renomeie antes de exportar.");
    names.add(machine.name);
  }
  const artifact = { ...parsed, document };
  if (new TextEncoder().encode(JSON.stringify(artifact)).byteLength > ANIMATION_ARTIFACT_BYTES)
    throw new Error("Animação excede o tamanho permitido.");
  return artifact;
}

export function serializeAnimationArtifact(input: unknown): string {
  const artifact = parseAnimationArtifact(input);
  return JSON.stringify(artifact);
}
