import { sairDaConta } from "@/features/sessao/http";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** Sai da conta e encerra a sessão deste aparelho no mesmo pedido. */
export async function POST(request: Request) {
  try {
    return await sairDaConta(request);
  } catch (error) {
    reportError(error, crypto.randomUUID());
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
