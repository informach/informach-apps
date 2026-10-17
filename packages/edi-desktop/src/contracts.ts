import { accessDenialSchema, githubRepositorySchema } from "@informach/edi-contracts";
import { z } from "zod";
export const desktopConfigSchema = z
  .strictObject({
    portalUrl: z.url(),
    clientId: z.string().min(1),
    environment: z.enum(["development", "production"]),
    trustedKeys: z.record(z.string(), z.string()),
    publisher: z.string(),
    downloadHost: z.string(),
    distributionRepository: githubRepositorySchema.default("informach/edi-releases"),
    updateKeys: z.record(z.string(), z.string()).default({}),
    updateChannel: z.enum(["stable", "beta"]).default("stable"),
  })
  .superRefine((config, context) => {
    const url = new URL(config.portalUrl);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
      context.addIssue({ code: "custom", message: "Portal must be an origin" });
    if (
      config.environment === "production" &&
      (url.protocol !== "https:" ||
        !Object.keys(config.updateKeys).length ||
        !Object.keys(config.trustedKeys).length)
    )
      context.addIssue({
        code: "custom",
        message: "Packaged builds require HTTPS and separate license/update trust anchors",
      });
    if (
      config.environment === "development" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      context.addIssue({ code: "custom", message: "Development authentication must use loopback" });
  });
export type DesktopConfig = z.infer<typeof desktopConfigSchema>;
/**
 * Why access is restricted, set by the controller so each screen picks the next
 * step from a stable code instead of guessing from `reason` or `userId`. Null while
 * licensed or connecting. Denial values mirror `accessDenialSchema`.
 */
export const desktopStatusCauseSchema = z.enum([
  "signed_out",
  "offline",
  "expired",
  "revalidate",
  "unavailable",
  "connect_failed",
  ...accessDenialSchema.options,
]);
export type DesktopStatusCause = z.infer<typeof desktopStatusCauseSchema>;
export const desktopStatusSchema = z.strictObject({
  state: z.enum(["restricted", "connecting", "licensed"]),
  cause: desktopStatusCauseSchema.nullable(),
  reason: z.string().max(200),
  /** Account of the session kept in this computer's vault, or null when there is none. */
  userId: z.string().nullable(),
  expiresAt: z.string().nullable(),
  offline: z.boolean(),
  userCode: z.string().nullable(),
  verificationUri: z.string().nullable(),
  update: z.enum(["development", "idle", "checking", "downloading", "ready", "error"]),
});
export type DesktopStatus = z.infer<typeof desktopStatusSchema>;
export const recoveryIdSchema = z.uuid();
export const recoveryResultSchema = z.strictObject({ id: recoveryIdSchema, ok: z.boolean() });
export type EdiDesktopBridge = {
  status(): Promise<DesktopStatus>;
  connect(): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  account(): Promise<void>;
  checkUpdate(): Promise<void>;
  recover(): Promise<void>;
  onStatus(callback: (status: DesktopStatus) => void): () => void;
  onRecovery(callback: () => Promise<void> | void): () => void;
};
declare global {
  interface Window {
    ediSuite: EdiDesktopBridge;
  }
}
