import "server-only";
import { createHash } from "node:crypto";
import { and, db, eq, sql } from "@informach/db";
import { cozyaAiOperations } from "@informach/db/schema";
import { z } from "zod";
import { getKitchenAccess } from "@/features/kitchen/access";
import { logger } from "@/lib/logger";
import { enforceRateLimit, RateLimitedError } from "@/lib/rate-limit";
import { aiErrorResponse } from "./errors";
import { aiOperationContext } from "./operation-context";
import { recoverInterruptedAiOperation } from "./recovery";

/** One execution per browser operation. A network retry can retrieve the same preview for 24h. */
export async function runAiOperation(
  request: Request,
  userId: string,
  input: string | Blob,
  call: () => Promise<Response>,
) {
  const parsedId = z.string().uuid().safeParse(request.headers.get("Idempotency-Key"));
  if (!parsedId.success)
    return Response.json({ code: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const id = parsedId.data;
  const digest = createHash("sha256").update(new URL(request.url).pathname);
  digest.update(typeof input === "string" ? input : new Uint8Array(await input.arrayBuffer()));
  const fingerprint = digest.digest("hex");
  const inserted = await db.transaction(async (tx) => {
    // Serialize registration with data clearing, so an in-flight paid task cannot
    // lose its recovery record or recreate a preview after deletion.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:ai-owner:${userId}`}))`);
    return tx
      .insert(cozyaAiOperations)
      .values({ id, userId, fingerprint, expiresAt: new Date(Date.now() + 86400000) })
      .onConflictDoNothing()
      .returning({ id: cozyaAiOperations.id });
  });
  if (!inserted.length) {
    let [existing] = await db
      .select()
      .from(cozyaAiOperations)
      .where(and(eq(cozyaAiOperations.id, id), eq(cozyaAiOperations.userId, userId)));
    if (!existing || existing.fingerprint !== fingerprint)
      return Response.json({ code: "OPERATION_CONFLICT" }, { status: 409 });
    if (
      existing.createdAt.getTime() <= Date.now() - 3_600_000 &&
      (existing.statusCode === null || existing.statusCode >= 500)
    ) {
      existing = (await recoverInterruptedAiOperation(id, userId)).operation ?? existing;
    }
    if (existing.expiresAt <= new Date())
      return Response.json({ code: "OPERATION_EXPIRED" }, { status: 410 });
    if (existing.statusCode === null)
      return Response.json(
        { code: "OPERATION_PENDING" },
        { status: 409, headers: { "Retry-After": "5" } },
      );
    return Response.json(existing.response, {
      status: existing.statusCode,
      headers: { "Cache-Control": "no-store", "Idempotency-Replayed": "true" },
    });
  }
  let response: Response;
  try {
    const access = await getKitchenAccess(userId);
    if (!access.isPro) {
      await enforceRateLimit({ key: `trial-ai:${userId}`, limit: 6, windowSeconds: 86400 });
      await enforceRateLimit({ key: "trial-ai:global", limit: 100, windowSeconds: 86400 });
    }
    response = await aiOperationContext.run(id, call);
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
  const body: unknown = await response.clone().json();
  await db
    .update(cozyaAiOperations)
    .set({ response: body, statusCode: response.status })
    .where(and(eq(cozyaAiOperations.id, id), eq(cozyaAiOperations.userId, userId)));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Idempotency-Complete", "true");
  return response;
}
