import { z } from "zod";
import { type Asset, assetIdSchema } from "../assets/model";
import { isXmlText } from "../assets/xmlText";

const id = z.string().regex(/^[a-z]+-[\w-]{1,100}$/);
export const audioBindingSchema = z.strictObject({
  id,
  eventId: id,
  assetId: assetIdSchema,
  volume: z.number().min(0).max(1),
  caption: z.string().trim().min(1).max(500).refine(isXmlText),
});
export const audioDocumentSchema = z.strictObject({
  version: z.literal(1),
  bindings: z.array(audioBindingSchema).max(256),
});
export type AudioDocument = z.infer<typeof audioDocumentSchema>;
export type AudioBinding = z.infer<typeof audioBindingSchema>;
export interface AudioStatus {
  enabled: boolean;
  activeVoices: number;
  buffers: number;
  envelopeSegments: number;
  stolenVoices: number;
  skippedLate: number;
  masterVolume: number;
  contextState: string;
  destroyed: boolean;
}
export interface AudioCueEmission {
  bindingId: string;
  eventId: string;
  assetId: string;
  caption: string;
  instancePath: string[];
}
export interface AudioControlHandle {
  enableAudio(): Promise<void>;
  disableAudio(): void;
  setAudioVolume(value: number): void;
  inspectAudio(): AudioStatus;
  onAudioCue(callback: (cue: AudioCueEmission) => void): () => void;
  onAudioStateChange(callback: (status: AudioStatus) => void): () => void;
}
export function parseAudioDocument(
  input: unknown,
  assets: ReadonlyMap<string, Asset>,
  events: ReadonlySet<string>,
): AudioDocument {
  const audio = audioDocumentSchema.parse(input, { jitless: true }),
    ids = new Set<string>();
  for (const binding of audio.bindings) {
    if (ids.has(binding.id)) throw new Error("IDs de vínculos de áudio duplicados.");
    ids.add(binding.id);
    if (assets.get(binding.assetId)?.kind !== "audio")
      throw new Error("Vínculo de áudio referencia recurso ausente/incompatível.");
    if (!events.has(binding.eventId))
      throw new Error("Vínculo de áudio referencia evento ausente.");
  }
  return audio;
}
