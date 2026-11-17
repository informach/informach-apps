import { createHash } from "node:crypto";
import { getCollectionApps } from "@informach/config/collections";
import type { WebClosurePlan } from "@informach/db/schema";
import { z } from "zod";

export const webClosurePlanSchema = z.strictObject({
  version: z.literal(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  personalRecords: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sharedRecords: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  credentials: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  blockers: z
    .array(
      z.enum(["responsibilities", "pending_operations", "financial_review", "changed_authority"]),
    )
    .max(4)
    .refine((items) => new Set(items).size === items.length),
}) satisfies z.ZodType<WebClosurePlan>;
export type { WebClosurePlan };
export class WebClosureError extends Error {
  constructor(
    readonly code:
      | "unauthorized"
      | "review-unavailable"
      | "already-requested"
      | "not-found"
      | "not-ready"
      | "catalog-changed"
      | "stale-plan"
      | "stale-claim"
      | "irreversible"
      | "unsupported-domain",
  ) {
    super(`Web closure: ${code}`);
    this.name = "WebClosureError";
  }
}
export const closureActorSchema = z.strictObject({
  actorId: z.string().min(1).max(200),
  sessionId: z.string().min(1).max(300),
});
export type ClosureActor = z.infer<typeof closureActorSchema>;
/** Passed only by a fenced server worker, never accepted as browser authority. */
export type WebClosureAuthority = {
  actorId: string;
  operationId: string;
  frozenRevision: number;
};
export type WebClosureExecution = WebClosureAuthority & {
  phase: "erase" | "resume";
  plan: WebClosurePlan | null;
};
export const closureCatalog = () =>
  getCollectionApps("compasso")
    .map((app) => app.slug)
    .sort();
export const closureDomains = (catalog = closureCatalog()) =>
  ["billing", "family", ...catalog.map((app) => `app:${app}`)].sort();
export const sameClosureCatalog = (catalog: string[]) =>
  JSON.stringify(catalog) === JSON.stringify(closureCatalog());

/** Plan order is deterministic; only the prepared domain selection is accepted. */
export function webClosurePlanDigest(
  plans: { domain: string; plan: WebClosurePlan }[],
  revision = 1,
) {
  const canonical = [...plans]
    .sort((a, b) => a.domain.localeCompare(b.domain))
    .map(({ domain, plan }) => ({ domain, plan: webClosurePlanSchema.parse(plan) }));
  return createHash("sha256")
    .update(JSON.stringify(revision === 1 ? canonical : { revision, plans: canonical }))
    .digest("hex");
}
