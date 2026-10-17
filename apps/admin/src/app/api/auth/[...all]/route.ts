import { guardAuthRequest } from "@/features/two-factor/gate";
import { restoreProofOf, takeProofOf } from "@/features/two-factor/proof";
import { getAuth } from "@/lib/auth";
import { reportOperationalError } from "@/lib/observability";

/**
 * Lista fechada de `auth-routes.ts`, sem `trustDevice` na segunda etapa e com a
 * prova por e-mail na ativação (`features/two-factor/gate.ts`).
 */
function handle(request: Request) {
  const auth = getAuth();
  return guardAuthRequest(request, {
    handler: (forwarded) => auth.auth.handler(forwarded),
    currentSession: async (incoming) => {
      const session = await auth.getSession(incoming.headers);
      return session ? { sessionId: session.session.id, userId: session.user.id } : null;
    },
    takeProof: takeProofOf,
    restoreProof: restoreProofOf,
    report: (error) => reportOperationalError("action.unexpected_failure", error),
  });
}

export const GET = handle;
export const POST = handle;
