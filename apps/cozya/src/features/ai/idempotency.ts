import "server-only";
import { createHash } from "node:crypto";
import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import { and, db, eq, sql } from "@informach/db";
import { cozyaAiOperations } from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { z } from "zod";
import { readKitchenAccess } from "@/features/billing/access-repository";
import { logger } from "@/lib/logger";
import { enforceRateLimit, RateLimitedError } from "@/lib/rate-limit";
import { aiErrorResponse } from "./errors";
import { aiOperationContext } from "./operation-context";
import { recoverInterruptedAiOperation } from "./recovery";
import type { CozyaAiActor } from "./wallet-repository";

const acceptanceSchema = z.object({
  version: z.string().min(1).max(40),
  maxCredits: z.coerce.number().int().min(1).max(1000),
});
/** A browser UUID is bound permanently to actor, family and exact normalized input. */
export async function runAiOperation(
  request: Request,
  actor: CozyaAiActor,
  input: string | Blob,
  call: () => Promise<Response>,
) {
  const parsedId = z.uuid().safeParse(request.headers.get("Idempotency-Key"));
  if (!parsedId.success)
    return Response.json({ code: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const accepted = acceptanceSchema.safeParse({
    version: request.headers.get("X-Compasso-AI-Tariff"),
    maxCredits: request.headers.get("X-Compasso-AI-Credits"),
  });
  if (!accepted.success)
    return Response.json({ code: "AI_PRICE_ACCEPTANCE_REQUIRED" }, { status: 400 });
  const id = parsedId.data;
  const userId = actor.userId;
  const digest = createHash("sha256").update(new URL(request.url).pathname);
  digest.update(typeof input === "string" ? input : new Uint8Array(await input.arrayBuffer()));
  const fingerprint = digest.digest("hex");
  let admission: {
    revision: number;
    existing: typeof cozyaAiOperations.$inferSelect | null | undefined;
  };
  try {
    admission = await db.transaction(async (tx) => {
      await lockFamilyMembership(tx, userId, actor.familyGroupId);
      const revision = await lockActiveWebParticipation(tx, userId);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:ai-owner:${userId}`}))`);
      const inserted = await tx
        .insert(cozyaAiOperations)
        .values({
          id,
          userId,
          familyGroupId: actor.familyGroupId,
          fingerprint,
          webParticipationRevision: revision,
          tariff: accepted.data.version,
          maxCredits: accepted.data.maxCredits,
          expiresAt: new Date(Date.now() + 86400000),
        })
        .onConflictDoNothing()
        .returning({ id: cozyaAiOperations.id });
      if (inserted.length) return { existing: null, revision };
      const existing = (
        await tx
          .select()
          .from(cozyaAiOperations)
          .where(and(eq(cozyaAiOperations.id, id), eq(cozyaAiOperations.userId, userId)))
      )[0];
      return { existing, revision };
    });
  } catch (error) {
    return aiErrorResponse(error);
  }
  const revision = admission.revision;
  let existing = admission.existing;
  if (existing !== null) {
    if (
      !existing ||
      existing.fingerprint !== fingerprint ||
      (existing.familyGroupId !== null && existing.familyGroupId !== actor.familyGroupId)
    )
      return Response.json({ code: "OPERATION_CONFLICT" }, { status: 409 });
    if (
      existing.familyGroupId !== null &&
      (existing.tariff !== accepted.data.version ||
        existing.maxCredits !== accepted.data.maxCredits)
    )
      return Response.json({ code: "AI_PRICE_CHANGED" }, { status: 409 });
    if (existing.expiresAt <= new Date() || existing.webParticipationRevision !== revision)
      return Response.json({ code: "OPERATION_EXPIRED" }, { status: 410 });
    if (
      existing.familyGroupId === null &&
      (existing.statusCode === null || existing.statusCode >= 500)
    ) {
      existing = (await recoverInterruptedAiOperation(id, userId)).operation ?? existing;
      if (existing.statusCode === null)
        return Response.json({ code: "OPERATION_PENDING" }, { status: 409 });
    }
    // Old paid operations are never executed again against the new wallet.
    if (
      existing.familyGroupId === null ||
      (existing.statusCode !== null && existing.statusCode < 500 && existing.statusCode !== 409)
    )
      return Response.json(existing.response, {
        status: existing.statusCode ?? 409,
        headers: { "Cache-Control": "no-store", "Idempotency-Replayed": "true" },
      });
  }
  let response: Response;
  try {
    if (existing === null && (await readKitchenAccess(actor)).trialActive) {
      await enforceRateLimit({ key: `trial-ai:${userId}`, limit: 6, windowSeconds: 86400 });
      await enforceRateLimit({ key: "trial-ai:global", limit: 100, windowSeconds: 86400 });
    }
    response = await aiOperationContext.run(
      { id, actor, fingerprint, acceptedCost: accepted.data },
      call,
    );
  } catch (error) {
    logger.error(
      { operationId: id, error: error instanceof Error ? error.name : "UnknownError" },
      "cozya.ai_operation_failed",
    );
    response =
      error instanceof RateLimitedError
        ? Response.json(
            { code: "RATE_LIMITED" },
            { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
          )
        : aiErrorResponse(error);
  }
  // Transient errors can be retried with the same UUID. The durable receipt settles
  // an already produced output before any new provider call can be considered.
  if (response.status !== 409 && response.status !== 429) {
    const body: unknown = await response.clone().json();
    let saved: { id: string }[];
    try {
      saved = await db.transaction(async (tx) => {
        await lockFamilyMembership(tx, userId, actor.familyGroupId);
        await lockActiveWebParticipation(tx, userId, revision);
        return tx
          .update(cozyaAiOperations)
          .set({ response: body, statusCode: response.status })
          .where(
            and(
              eq(cozyaAiOperations.id, id),
              eq(cozyaAiOperations.userId, userId),
              sql`coalesce(${cozyaAiOperations.statusCode}, 0) <> 410`,
            ),
          )
          .returning({ id: cozyaAiOperations.id });
      });
    } catch (error) {
      return aiErrorResponse(error);
    }
    if (!saved.length) return Response.json({ code: "OPERATION_EXPIRED" }, { status: 410 });
    if (response.status < 500) response.headers.set("Idempotency-Complete", "true");
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
