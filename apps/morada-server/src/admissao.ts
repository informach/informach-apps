import { performance } from "node:perf_hooks";

export const LIMITES_DE_REDE = {
  conexoes: 1024,
  pedidosEmCurso: 32,
  quadrosPorSegundo: 400,
} as const;

/** Uma instância inteira, inclusive conexões que ainda não provaram a sessão. */
export function criarAdmissao(
  limites: { conexoes: number; pedidosEmCurso: number; quadrosPorSegundo: number },
  agora: () => number = performance.now,
) {
  for (const limite of Object.values(limites))
    if (!Number.isSafeInteger(limite) || limite <= 0) throw new Error("Limite de rede inválido");
  let conexoes = 0;
  let pedidos = 0;
  let fichas = limites.quadrosPorSegundo;
  let recarregadaEm = agora();

  return {
    conectar(): (() => void) | null {
      if (conexoes >= limites.conexoes) return null;
      conexoes++;
      let liberada = false;
      return () => {
        if (liberada) return;
        liberada = true;
        conexoes--;
      };
    },
    pedir(): (() => void) | null {
      const instante = agora();
      fichas = Math.min(
        limites.quadrosPorSegundo,
        fichas + (Math.max(0, instante - recarregadaEm) * limites.quadrosPorSegundo) / 1000,
      );
      recarregadaEm = instante;
      if (pedidos >= limites.pedidosEmCurso || fichas < 1) return null;
      fichas--;
      pedidos++;
      let liberado = false;
      return () => {
        if (liberado) return;
        liberado = true;
        pedidos--;
      };
    },
    medir: () => ({ conexoes, pedidosEmCurso: pedidos }),
  };
}
