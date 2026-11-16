import type { EdicaoDoCliente } from "@informach/morada-sim";

/** ACK antigo não devolve uma sequência ou uma prévia já superada pelo espelho. */
export function atualizarEdicaoDoCliente(
  atual: EdicaoDoCliente | undefined,
  recebida: EdicaoDoCliente,
): EdicaoDoCliente {
  const proxima = recebida.proximaSequencia;
  const historico =
    recebida.historico &&
    (!atual?.historico || recebida.historico.revisao >= atual.historico.revisao)
      ? recebida.historico
      : atual?.historico;
  return {
    proximaSequencia:
      proxima === null || atual?.proximaSequencia === null
        ? null
        : Math.max(atual?.proximaSequencia ?? 1, proxima),
    ...(historico ? { historico } : {}),
  };
}
