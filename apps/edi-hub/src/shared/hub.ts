import { toolIdSchema } from "@informach/edi-contracts";
import { z } from "zod";
export const installationSchema = z.strictObject({
  id: toolIdSchema,
  installed: z.boolean(),
  version: z.string().nullable(),
  available: z.string().nullable(),
  busy: z.boolean(),
  error: z.string().nullable(),
});
export type Installation = z.infer<typeof installationSchema>;
export interface HubBridge {
  list(): Promise<Installation[]>;
  install(toolId: z.infer<typeof toolIdSchema>): Promise<void>;
  open(toolId: z.infer<typeof toolIdSchema>): Promise<void>;
}
declare global {
  interface Window {
    ediHub: HubBridge;
  }
}
