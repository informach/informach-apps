import "server-only";
import { enforceRateLimit } from "@informach/auth/server-actions";
import { z } from "zod";
import {
  beginClosure,
  confirmClosure,
  currentClosure,
  refreshClosure,
  reprepareClosure,
  resumeClosure,
} from "@/lib/account-closure";
import { departureAuthorization } from "./departure-service";

const operation = { closureId: z.uuid() };
export const closureActionSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("begin"), reviewId: z.uuid(), confirmed: z.literal("on") }),
  z.object({
    operation: z.literal("confirm"),
    ...operation,
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal("on"),
    confirmation: z.literal("ENCERRAR COMPASSO"),
  }),
  z.object({ operation: z.literal("refresh"), ...operation }),
  z.object({ operation: z.literal("reprepare"), ...operation }),
  z.object({ operation: z.literal("resume"), ...operation, confirmed: z.literal("on") }),
]);

export async function loadAccountClosure(headers: Headers) {
  const { actorId, sessionId } = await departureAuthorization(headers);
  await enforceRateLimit({ key: `conta:privacy:closure-view:${actorId}`, max: 60, window: "1h" });
  return currentClosure({ actorId, sessionId });
}
export async function changeAccountClosure(headers: Headers, raw: unknown) {
  const input = closureActionSchema.parse(raw);
  const { actorId, sessionId } = await departureAuthorization(headers);
  const actor = { actorId, sessionId };
  await enforceRateLimit({ key: `conta:privacy:closure:${actorId}`, max: 12, window: "1h" });
  switch (input.operation) {
    case "begin":
      return beginClosure(actor, input.reviewId);
    case "confirm":
      return confirmClosure(actor, input.closureId, input.digest);
    case "refresh":
      return refreshClosure(actor, input.closureId);
    case "reprepare":
      return reprepareClosure(actor, input.closureId);
    case "resume":
      return resumeClosure(actor, input.closureId);
  }
}
