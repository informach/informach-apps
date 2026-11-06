import { requestFamily } from "@/features/familia/quem";
import { fluxoDaFamilia } from "@/features/tempo-real/bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Avisos "algo mudou" da família, para o tablet e o celular dos pais se atualizarem. */
export async function GET(request: Request) {
  const quem = await requestFamily();
  if (!quem) return new Response("Unauthorized", { status: 401 });
  return fluxoDaFamilia(quem.ownerId, request.signal);
}
