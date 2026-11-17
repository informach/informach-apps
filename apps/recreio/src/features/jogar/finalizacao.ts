import type { SalvamentoDaSessao } from "@informach/recreio/contrato";
import { comPrazoDePedido, ErroDoRecreio, ehErroDoRecreio } from "@informach/recreio/sdk";

/** O módulo pede persistência; só o recibo do Recreio confirma que ela terminou. */
export async function confirmarFinalizacao(
  capacidade: SalvamentoDaSessao,
  finalizar: () => Promise<void>,
): Promise<"completed" | "conflicted"> {
  const limite = Date.now() + 30_000;
  capacidade.parar();
  let falha: unknown;
  try {
    await comPrazoDePedido(finalizar, 8000);
  } catch (erro) {
    falha = erro;
  }
  for (;;) {
    const restante = limite - Date.now();
    if (restante <= 0) throw new ErroDoRecreio("INDISPONIVEL");
    try {
      const recibo = await comPrazoDePedido(() => capacidade.estado(), restante);
      if (recibo.estado !== "ready") return recibo.estado;
      if (Date.parse(recibo.expiraEm) <= Date.now()) throw new ErroDoRecreio("SESSAO_INVALIDA");
      if (falha !== undefined && !ehErroDoRecreio(falha, "INDISPONIVEL")) throw falha;
    } catch (erro) {
      if (!ehErroDoRecreio(erro, "INDISPONIVEL")) throw erro;
    }
    const espera = Math.min(1000, limite - Date.now());
    if (espera <= 0) throw new ErroDoRecreio("INDISPONIVEL");
    await new Promise<void>((resolve) => setTimeout(resolve, espera));
  }
}
