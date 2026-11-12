import { AnexarAoDiarioSchema } from "@informach/recreio/contrato";
import { hostDoPedido } from "@/features/posse/http";
import { anexarAoDiario, lerDiario, tetoDoCorpoDoDiario } from "@/features/posse/service";
import { corpoJson, inteiroDaConsulta, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/** As entradas do diário depois de um ponto, em ordem, com os bytes em base64. */
export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const host = await hostDoPedido(request);
    const consulta = new URL(request.url).searchParams;
    return json(
      await lerDiario(host, (await params).id, {
        cerca: inteiroDaConsulta(consulta.get("cerca")),
        apos: inteiroDaConsulta(consulta.get("apos")),
      }),
    );
  });
}

/** Anexa fatos ao diário do mundo: o lote entra inteiro ou não entra. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const host = await hostDoPedido(request);
    const corpo = await corpoJson(request, AnexarAoDiarioSchema, tetoDoCorpoDoDiario(host.jogo));
    return json(await anexarAoDiario(host, (await params).id, corpo));
  });
}
