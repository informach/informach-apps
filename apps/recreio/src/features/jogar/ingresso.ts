import { ErroDoRecreio, erroDaResposta } from "@informach/recreio/sdk";

/**
 * Pede o ingresso de um jogo ao portal, com o cookie da própria origem. É o
 * `obterIngresso` que a página entrega ao SDK. O pedido leva só o id do jogo:
 * o perfil sai da sessão conferida no servidor.
 *
 * Toda recusa vira o `ErroDoRecreio` com o código que o portal mandou; rede
 * fora do ar e resposta que não dá para entender viram `INDISPONIVEL`.
 */
export async function pedirIngresso(jogo: string): Promise<string> {
  let resposta: Response;
  try {
    resposta = await fetch("/api/sdk/v1/ingresso", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jogo }),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ErroDoRecreio("INDISPONIVEL");
  }
  if (!resposta.ok) throw await erroDaResposta(resposta);
  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    throw new ErroDoRecreio("INDISPONIVEL");
  }
  if (
    typeof corpo !== "object" ||
    corpo === null ||
    !("ingresso" in corpo) ||
    typeof corpo.ingresso !== "string" ||
    corpo.ingresso === ""
  )
    throw new ErroDoRecreio("INDISPONIVEL");
  return corpo.ingresso;
}
