import { audioDocumentSchema } from "@informach/edi-motion/audio";
import { z } from "zod";
import type { Artboard } from "./project";
export const audioCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    type: z.literal("audio"),
    operation: z.literal("replace"),
    value: audioDocumentSchema,
  }),
  z.strictObject({ type: z.literal("audio"), operation: z.literal("disable") }),
]);
export function applyAudio(board: Artboard, command: z.infer<typeof audioCommandSchema>) {
  if (command.operation === "disable") delete board.audio;
  else board.audio = command.value;
}
