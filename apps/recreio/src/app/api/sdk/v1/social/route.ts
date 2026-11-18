import { MutacaoSocialSchema } from "@informach/recreio/contrato";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { consultarSocialPeloSdk, executarMutacaoSocial } from "@/features/social/http";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return responder(async () => {
    const sessao = await sessaoDeJogo(request);
    return json(
      await consultarSocialPeloSdk(sessao, Object.fromEntries(new URL(request.url).searchParams)),
    );
  });
}
export function POST(request: Request) {
  return responder(async () => {
    const sessao = await sessaoDeJogo(request);
    return json(
      await executarMutacaoSocial(sessao, await corpoJson(request, MutacaoSocialSchema, 2048)),
    );
  });
}
