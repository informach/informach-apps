import type { FonteDoMundo, MotivoDoEncerramento } from "@informach/jogo-morada";
import type { MundoId } from "@informach/recreio";
import {
  ErroDoRecreio,
  ehErroDoRecreio,
  type MudancaDeAcesso,
  type RecreioGameContext,
} from "@informach/recreio/sdk";

/**
 * Quem fala quando o Morada para, no portal. A regra é uma só, para a pessoa
 * nunca ler dois avisos da mesma coisa nem ficar diante de uma tela muda:
 *
 * - **Queda passageira é do jogo.** Depois que o mundo apareceu, rede que cai,
 *   instância que reinicia e Recreio que não responde ou ainda não tem
 *   instância (`INDISPONIVEL`, `SEM_INSTANCIA`, `MUITAS_TENTATIVAS`) ficam com
 *   o jogo, que mostra a faixa dele e tenta de novo sozinho. A página não diz
 *   nada.
 * - **O que é definitivo, e o que só a plataforma sabe explicar, é da página.**
 *   O jogo sai da tela e a página recebe um `ErroDoRecreio` para o aviso dela:
 *   qualquer recusa ao abrir o mundo antes de ele aparecer (inclusive "o jogo
 *   está iniciando"); recusa definitiva ao reabrir (`NAO_MEMBRO`,
 *   `MUNDO_INDISPONIVEL`, acesso, sessão); e todo fim que o servidor do jogo
 *   declara (sessão, acesso, outra janela, protocolo).
 *
 * O servidor do jogo fecha a conexão com um código, sem o motivo do Recreio
 * (trocou de aparelho? saiu da conta? perdeu o acesso?). Quando o motivo não
 * veio por outro caminho, este arquivo pergunta ao próprio Recreio, com a
 * sessão de jogo, e entrega a resposta à página.
 *
 * Sem DOM e sem o pacote do jogo (só os tipos dele): a parte que monta fica em
 * `morada.ts`.
 */

/** Recusas ao abrir o mundo que passam sozinhas. */
const PASSAGEIRAS = ["INDISPONIVEL", "SEM_INSTANCIA", "MUITAS_TENTATIVAS"] as const;

/** Quanto esperar a resposta do Recreio sobre o motivo de um fim, antes de dar o aviso padrão. */
export const PRAZO_DA_PERGUNTA_MS = 4000;

export function ehRecusaPassageira(erro: unknown): boolean {
  return PASSAGEIRAS.some((codigo) => ehErroDoRecreio(erro, codigo));
}

export type PaginaDoMorada = {
  mundoId: MundoId;
  /** A pessoa saiu por dentro do jogo. */
  aoSair(): void;
  /** O jogo não continua: a página explica com este erro. */
  aoFalhar(erro: unknown): void;
  /** Tira o jogo da vista já, antes de a página trocar a tela: o aviso do jogo não aparece. */
  esconder(): void;
  /** O mundo apareceu (a entrada ou uma volta). */
  aoEntrar?(): void;
  /** Para os testes: o temporizador do prazo da pergunta. */
  agendar?(chamar: () => void, emMs: number): () => void;
};

export type PonteDoMorada = {
  /** O que `montarMorada` recebe. */
  opcoes: {
    fonte: FonteDoMundo;
    aoSair(): void;
    aoEntrar(): void;
    aoEncerrar(motivo: MotivoDoEncerramento): void;
    aoNaoCarregar(): void;
  };
  /** Daqui em diante nada chega à página nem ao jogo. Chamado ao desmontar. */
  desligar(): void;
};

/** A mudança de acesso que o SDK avisou, como o erro que a página sabe explicar. */
function erroDaMudanca(mudanca: MudancaDeAcesso): ErroDoRecreio {
  const detalhe = {
    ...(mudanca.motivo === undefined ? {} : { motivo: mudanca.motivo }),
    ...(mudanca.estado === undefined ? {} : { estado: mudanca.estado }),
  };
  switch (mudanca.codigo) {
    case "ACESSO_PERDIDO":
    case "SESSAO_ENCERRADA":
    case "SESSAO_INVALIDA":
    case "INDISPONIVEL":
      return new ErroDoRecreio(mudanca.codigo, detalhe);
    default:
      return new ErroDoRecreio("SESSAO_ENCERRADA", detalhe);
  }
}

export function ligarMoradaAoRecreio(
  contexto: RecreioGameContext,
  pagina: PaginaDoMorada,
): PonteDoMorada {
  const agendar =
    pagina.agendar ??
    ((chamar, emMs) => {
      const id = setTimeout(chamar, emMs);
      return () => clearTimeout(id);
    });
  /** O mundo já apareceu alguma vez: daqui em diante, queda passageira é do jogo. */
  let entrou = false;
  /** Já foi dito à página (ou o jogo foi desmontado): mais nada passa. */
  let calado = false;
  /** O que o SDK disse sobre o acesso, se disse. */
  let mudanca: MudancaDeAcesso | null = null;
  const desfazer: (() => void)[] = [];
  let escondido = false;

  /** Tira o jogo da vista, uma vez. */
  function esconder(): void {
    if (escondido) return;
    escondido = true;
    pagina.esconder();
  }

  function calar(): void {
    calado = true;
    for (const parar of desfazer.splice(0)) parar();
  }

  function falhar(erro: unknown): void {
    if (calado) return;
    calar();
    esconder();
    pagina.aoFalhar(erro);
  }

  /**
   * O servidor do jogo encerrou sem dizer o motivo do Recreio. Pergunta a ele,
   * com a sessão de jogo: se a sessão acabou, a recusa traz o motivo; se o
   * perfil saiu do mundo, o mundo não está mais na lista. Sem resposta a
   * tempo, vale o aviso padrão do caso.
   */
  function perguntar(padrao: ErroDoRecreio): void {
    if (calado) return;
    // O jogo sai da vista enquanto a resposta não chega: o aviso é um só, o da página.
    esconder();
    let respondido = false;
    const responder = (erro: unknown) => {
      if (respondido) return;
      respondido = true;
      cancelarPrazo();
      falhar(erro);
    };
    const cancelarPrazo = agendar(() => responder(padrao), PRAZO_DA_PERGUNTA_MS);
    desfazer.push(() => {
      respondido = true;
      cancelarPrazo();
    });
    contexto.mundos.listar().then(
      (mundos) =>
        responder(
          mundos.some((mundo) => mundo.id === pagina.mundoId)
            ? padrao
            : new ErroDoRecreio("NAO_MEMBRO"),
        ),
      (erro: unknown) =>
        responder(ehErroDoRecreio(erro) && !ehRecusaPassageira(erro) ? erro : padrao),
    );
  }

  const fonte: FonteDoMundo = {
    async abrir() {
      try {
        const aberto = await contexto.mundos.abrir(pagina.mundoId);
        return { endereco: aberto.endereco, mundoId: aberto.mundoId };
      } catch (erro) {
        // Depois que o mundo apareceu, o que passa sozinho é do jogo: ele mostra a faixa e insiste.
        if (entrou && ehRecusaPassageira(erro)) throw erro;
        falhar(erro);
        // A página está tirando o jogo da tela: esta abertura não termina nunca.
        return new Promise<never>(() => {});
      }
    },
    token: () => contexto.sessao.token(),
    aoRenovar: (ouvinte) => contexto.sessao.aoRenovar(ouvinte),
    aoPerderAcesso(ouvinte) {
      const parar = contexto.sessao.aoMudarAcesso((nova) => {
        mudanca = nova;
        ouvinte(nova.codigo);
      });
      desfazer.push(parar);
      return parar;
    },
  };

  return {
    opcoes: {
      fonte,
      aoSair() {
        if (calado) return;
        calar();
        pagina.aoSair();
      },
      aoEntrar() {
        if (calado) return;
        entrou = true;
        pagina.aoEntrar?.();
      },
      aoEncerrar(motivo) {
        switch (motivo) {
          // Outra conexão do mesmo jogador tomou o lugar desta: a pessoa continuou em outra janela.
          case "substituida":
            return falhar(new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "replaced" }));
          // Cliente e servidor de versões diferentes: não é recusa do Recreio.
          case "protocolo":
            return falhar(new Error("O jogo e o servidor dele não se entenderam."));
          case "acesso_encerrado":
            // O próprio SDK já disse por quê; senão, o Recreio diz.
            return mudanca
              ? falhar(erroDaMudanca(mudanca))
              : perguntar(new ErroDoRecreio("SESSAO_ENCERRADA"));
          case "sem_acesso":
            return perguntar(new ErroDoRecreio("MUNDO_INDISPONIVEL"));
          case "sessao":
            return perguntar(new ErroDoRecreio("SESSAO_INVALIDA"));
        }
      },
      // O código do jogo não chegou (a rede caiu no meio do download).
      aoNaoCarregar: () => falhar(new ErroDoRecreio("INDISPONIVEL")),
    },
    desligar: calar,
  };
}
