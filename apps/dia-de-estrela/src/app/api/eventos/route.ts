import { requestFamily } from "@/features/familia/quem";
import { hasChildAccess } from "@/features/familia/repository";
import { fluxoDaFamilia } from "@/features/tempo-real/bus";
import { authResult } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Avisos "algo mudou" da família, para o tablet e o celular dos pais se atualizarem. */
export async function GET(request: Request) {
  const quem = await requestFamily();
  if (!quem) return new Response("Unauthorized", { status: 401 });
  return fluxoDaFamilia(quem.familyGroupId, request.signal, async () => {
    if (quem.kind === "adult") {
      const session = await authResult.getSession(request.headers);
      if (session?.user.id !== quem.userId || !session.user.emailVerified) return false;
    }
    return hasChildAccess(quem);
  });
}
