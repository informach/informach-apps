import { ErroDoRecreio } from "@informach/recreio";
import { NovoMundoSchema } from "@informach/recreio/contrato";
import { criarMundo, listarMundos } from "@/features/mundos/service";
import { sessaoDeJogo } from "@/features/sessao-de-jogo/http";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Os mundos do jogo em que o perfil da sessão é membro ativo. */
export function GET(request: Request) {
  return responder(async () => {
    const sessao = await sessaoDeJogo(request);
    // A sessão é de um jogo só: pedir os mundos de outro é usar o token errado.
    if (new URL(request.url).searchParams.get("jogo") !== sessao.jogo)
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    return json({ mundos: await listarMundos(sessao) });
  });
}

/** Cria um mundo do jogo da sessão; quem cria vira o responsável. */
export function POST(request: Request) {
  return responder(async () => {
    const sessao = await sessaoDeJogo(request);
    return json(await criarMundo(sessao, await corpoJson(request, NovoMundoSchema, 2048)));
  });
}
