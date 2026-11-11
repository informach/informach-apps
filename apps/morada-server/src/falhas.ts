/**
 * Pontos de falha para os testes de queda. Um teste pede que a instância
 * "morra" em um ponto exato (antes de o fato chegar ao diário, depois, antes
 * de avisar os clientes) e confere que o mundo volta inteiro.
 *
 * Em produção não há ponto armado: `atingir` não faz nada.
 */

export const PONTOS_DE_FALHA = [
  /** O fato existe na memória da instância e ainda não foi para o diário. */
  "antes_do_diario",
  /** O fato está no diário e nenhum cliente ficou sabendo. */
  "depois_do_diario",
  /** Os clientes já souberam; a fotografia seguinte ainda não foi tirada. */
  "depois_de_avisar",
  /** A fotografia está pronta e ainda não foi gravada. */
  "antes_da_fotografia",
] as const;

export type PontoDeFalha = (typeof PONTOS_DE_FALHA)[number];

/** Lançado quando um ponto armado é atingido. Quem hospeda trata como queda do processo. */
export class QuedaSimulada extends Error {
  readonly ponto: PontoDeFalha;

  constructor(ponto: PontoDeFalha) {
    super(`Queda simulada em ${ponto}`);
    this.name = "QuedaSimulada";
    this.ponto = ponto;
  }
}

export type Falhas = {
  /** Arma um ponto: a próxima vez que a condição valer, a instância cai ali. */
  armar(ponto: PontoDeFalha, quando?: (contexto: Record<string, unknown>) => boolean): void;
  atingir(ponto: PontoDeFalha, contexto?: Record<string, unknown>): void;
};

export function semFalhas(): Falhas {
  return { armar() {}, atingir() {} };
}

export function criarFalhas(): Falhas {
  const armados = new Map<PontoDeFalha, (contexto: Record<string, unknown>) => boolean>();
  return {
    armar(ponto, quando = () => true) {
      armados.set(ponto, quando);
    },
    atingir(ponto, contexto = {}) {
      const quando = armados.get(ponto);
      if (!quando?.(contexto)) return;
      armados.delete(ponto);
      throw new QuedaSimulada(ponto);
    },
  };
}
