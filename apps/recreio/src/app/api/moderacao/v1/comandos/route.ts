import { ErroDoRecreio } from "@informach/recreio";
import { ComandoDeModeracaoSchema } from "@informach/recreio/contrato";
import { executarComandoDeModeracao } from "@/features/moderacao/comandos-service";
import { corpoJson, json, responder, tokenDoPedido } from "@/lib/http";

export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return responder(async () => {
    const token = tokenDoPedido(request);
    if (!token || token.length > 4096) throw new ErroDoRecreio("SEM_PERMISSAO");
    return json(
      await executarComandoDeModeracao(
        token,
        await corpoJson(request, ComandoDeModeracaoSchema, 4096),
      ),
    );
  });
}
