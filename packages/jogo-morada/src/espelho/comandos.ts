import type { AcaoPedida, Intencao, MoradorId, Resultado } from "@informach/morada-sim";

/**
 * Os pedidos do cliente. O cliente não muda o mundo: monta uma intenção com
 * um id novo, manda e guarda até a resposta chegar. Se a conexão cai no
 * meio, o que ficou sem resposta é mandado de novo com o mesmo id; o servidor
 * reconhece o id e não faz duas vezes.
 */

export type ComandoPendente = {
  intencao: Intencao;
  /** Se já saiu por alguma conexão. */
  enviado: boolean;
  resolver(resultado: Resultado): void;
};

export type OpcoesDosComandos = {
  /** Manda a intenção. Devolve `false` se não há conexão agora. */
  enviar(intencao: Intencao): boolean;
  mundoId(): string | null;
  /** Um id novo por comando, com 8 caracteres ou mais. */
  novoId?(): string;
};

function idAleatorio(): string {
  return crypto.randomUUID();
}

export class Comandos {
  private readonly pendentes = new Map<string, ComandoPendente>();
  private readonly novoId: () => string;

  constructor(private readonly opcoes: OpcoesDosComandos) {
    this.novoId = opcoes.novoId ?? idAleatorio;
  }

  /** Os comandos ainda sem resposta, na ordem em que foram feitos. */
  emAberto(): Intencao[] {
    return [...this.pendentes.values()].map((pendente) => pendente.intencao);
  }

  /**
   * Faz um pedido. A promessa se cumpre com a resposta do servidor, aceita ou
   * recusada; ela não rejeita por recusa.
   */
  comando(
    moradorId: MoradorId | null,
    acao: AcaoPedida,
  ): { comandoId: string; resultado: Promise<Resultado> } {
    const comandoId = this.novoId();
    const mundoId = this.opcoes.mundoId();
    if (!mundoId) {
      return {
        comandoId,
        resultado: Promise.resolve({ ok: false, comandoId, motivo: "sem_sessao" }),
      };
    }
    const intencao: Intencao = { comandoId, mundoId, moradorId, acao, versaoEsperada: 0 };
    const resultado = new Promise<Resultado>((resolver) => {
      this.pendentes.set(comandoId, { intencao, enviado: false, resolver });
    });
    const pendente = this.pendentes.get(comandoId);
    if (pendente) pendente.enviado = this.opcoes.enviar(intencao);
    return { comandoId, resultado };
  }

  /** A resposta do servidor a um comando. Devolve se era de um comando em aberto. */
  receber(resultado: Resultado): boolean {
    const pendente = this.pendentes.get(resultado.comandoId);
    if (!pendente) return false;
    this.pendentes.delete(resultado.comandoId);
    pendente.resolver(resultado);
    return true;
  }

  /**
   * A conexão voltou: manda de novo, com os mesmos ids, o que ficou sem
   * resposta. Pedidos feitos a outro mundo (o servidor recomeçou do zero) não
   * valem mais e são dados como recusados.
   */
  reenviar(): void {
    const mundoId = this.opcoes.mundoId();
    for (const [comandoId, pendente] of [...this.pendentes]) {
      if (pendente.intencao.mundoId !== mundoId) {
        this.pendentes.delete(comandoId);
        pendente.resolver({ ok: false, comandoId, motivo: "mundo_errado" });
        continue;
      }
      pendente.enviado = this.opcoes.enviar(pendente.intencao) || pendente.enviado;
    }
  }

  /** O jogo acabou: quem ainda esperava resposta fica sabendo que não vem. */
  desistir(): void {
    for (const [comandoId, pendente] of [...this.pendentes]) {
      this.pendentes.delete(comandoId);
      pendente.resolver({ ok: false, comandoId, motivo: "sem_sessao" });
    }
  }
}
