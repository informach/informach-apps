import { CABECALHO_DO_RESUMO } from "@informach/recreio/contrato";
import { hostDoPedido } from "@/features/posse/http";
import { gravarFotografia, tetoDaFotografia } from "@/features/posse/service";
import { boundedBytes, inteiroDaConsulta, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Grava uma fotografia do mundo. O corpo são os bytes crus; os números vão na
 * consulta e o resumo opcional, no cabeçalho. O corpo é lido só até o teto do
 * jogo: o que passa disso é recusado sem ser guardado.
 */
export function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const host = await hostDoPedido(request);
    const consulta = new URL(request.url).searchParams;
    const bytes = await boundedBytes(request, tetoDaFotografia(host.jogo));
    return json(
      await gravarFotografia(
        host,
        (await params).id,
        {
          cerca: inteiroDaConsulta(consulta.get("cerca")),
          revisaoEsperada: inteiroDaConsulta(consulta.get("revisaoEsperada")),
          diarioSeq: inteiroDaConsulta(consulta.get("diarioSeq")),
          tick: inteiroDaConsulta(consulta.get("tick")),
          schemaVersion: inteiroDaConsulta(consulta.get("schemaVersion")),
          tipo: consulta.get("tipo"),
        },
        bytes,
        request.headers.get(CABECALHO_DO_RESUMO),
      ),
    );
  });
}
