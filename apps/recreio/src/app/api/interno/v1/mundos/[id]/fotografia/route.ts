import { CABECALHO_DA_FOTOGRAFIA, jsonParaCabecalho } from "@informach/recreio/contrato";
import { hostDoPedido } from "@/features/posse/http";
import { lerFotografia } from "@/features/posse/service";
import { inteiroDaConsulta, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/** A fotografia mais nova do mundo, crua, com os metadados no cabeçalho; 204 se não há nenhuma. */
export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const host = await hostDoPedido(request);
    const cerca = inteiroDaConsulta(new URL(request.url).searchParams.get("cerca"));
    const foto = await lerFotografia(host, (await params).id, cerca);
    if (!foto) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    return new Response(Buffer.from(foto.bytes), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/octet-stream",
        [CABECALHO_DA_FOTOGRAFIA]: jsonParaCabecalho(foto.meta),
      },
    });
  });
}
