import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import { verificarSalvamentoEmitido } from "@informach/recreio/emissor";
import { tokenDoPedido } from "@/lib/http";
import { chavesDoRecreio } from "@/lib/tokens";

export async function salvamentoDoPedido(request: Request) {
  const token = tokenDoPedido(request);
  if (!token) throw new ErroDoRecreio("SESSAO_INVALIDA");
  const { chaves, emissor } = await chavesDoRecreio();
  return verificarSalvamentoEmitido(token, { chaves, emissor: emissor.emissor });
}
