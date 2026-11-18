import { ConsultaDeVisitasSchema, MutacaoDeVisitaSchema } from "@informach/recreio/contrato";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import {
  consultarCaixaDeVisitasPeloSdk,
  executarVisitaPeloSdk,
} from "@/features/visitas/consulta-http";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return responder(async () => {
    const autor = await sessaoDeJogo(request);
    const consulta = ConsultaDeVisitasSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return json(await consultarCaixaDeVisitasPeloSdk(autor, consulta));
  });
}
export function POST(request: Request) {
  return responder(async () => {
    const autor = await sessaoDeJogo(request);
    return json(
      await executarVisitaPeloSdk(autor, await corpoJson(request, MutacaoDeVisitaSchema, 4096)),
    );
  });
}
