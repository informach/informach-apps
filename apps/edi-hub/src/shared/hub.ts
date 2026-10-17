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
export const installActivitySchema = z.strictObject({
  id: toolIdSchema,
  phase: z.enum(["downloading", "installing"]),
  progress: z.number().min(0).max(1),
});
export type InstallActivity = z.infer<typeof installActivitySchema>;
export interface HubBridge {
  list(): Promise<Installation[]>;
  install(toolId: z.infer<typeof toolIdSchema>): Promise<void>;
  open(toolId: z.infer<typeof toolIdSchema>): Promise<void>;
  onActivity(callback: (activity: InstallActivity[]) => void): () => void;
}
declare global {
  interface Window {
    ediHub: HubBridge;
  }
}
