import { ConsultaDeDenunciasSchema, RevisaoDeDenunciaSchema } from "@informach/recreio/contrato";
import {
  acompanharDenunciasDoSdk,
  reverDenunciaDoSdk,
} from "@/features/moderacao/acompanhamento-http";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return responder(async () => {
    const sessao = await sessaoDeJogo(request);
    const consulta = ConsultaDeDenunciasSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return json(await acompanharDenunciasDoSdk(sessao, consulta));
  });
}
export function POST(request: Request) {
  return responder(async () => {
    const sessao = await sessaoDeJogo(request);
    return json(
      await reverDenunciaDoSdk(sessao, await corpoJson(request, RevisaoDeDenunciaSchema, 2048)),
    );
  });
}
