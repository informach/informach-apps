import type { RegrasDoMundo } from "@informach/morada-sim";
import type { DefinicaoDeBairro } from "@informach/morada-sim/formatos";
import {
  FECHAMENTO,
  MensagemDoClienteSchema,
  QUADRO_MAXIMO_BYTES,
} from "@informach/morada-sim/protocolo";
import { BATIMENTO_MS, ehErroDoRecreio, MundoIdSchema, POSSE_TTL_MS } from "@informach/recreio";
import type { ClienteDoHost, VerificadorDeSessao } from "@informach/recreio/host";
import { Ator, type Conexao, type Ligacao, type MedidasDoAtor } from "./ator";
import { type Falhas, QuedaSimulada, semFalhas } from "./falhas";

/**
 * Uma instância do servidor do Morada: vários mundos abertos no mesmo
 * processo. Não sabe de WebSocket nem de relógio: recebe quadros de conexões
 * abstratas e anda quando alguém chama `passo`. Em produção quem chama é o
 * laço de 100 ms; nos testes, o próprio teste.
 */

export type OpcoesDaInstancia = {
  host: ClienteDoHost;
  verificador: VerificadorDeSessao;
  /** Relógio real, em ms. Injetado para os testes controlarem o tempo. */
  agora(): number;
  /** Endereço público do WebSocket, como o Recreio o conhece. */
  urlPublica: string;
  versao: string;
  /** Quantos mundos esta instância aceita ao mesmo tempo. */
  capacidade: number;
  definicao?: DefinicaoDeBairro;
  regras?: Partial<RegrasDoMundo>;
  checkpointMs?: number;
  diarioParaFotografarBytes?: number;
  falhas?: Falhas;
  registrar?(evento: string, dados?: Record<string, unknown>): void;
};

/** Quadros por segundo que uma conexão pode mandar, e a rajada tolerada. */
const QUADROS_POR_SEGUNDO = 20;
const RAJADA_DE_QUADROS = 40;
const INTENCOES_POR_SEGUNDO = 10;
const RAJADA_DE_INTENCOES = 20;

export type MedidasDaInstancia = {
  mundos: number;
  conexoes: number;
  drenando: boolean;
  viva: boolean;
  /** O Recreio conhece esta instância: só assim ela recebe mundos. */
  registrada: boolean;
  porMundo: MedidasDoAtor[];
};

export type Instancia = {
  /**
   * Registra a instância no Recreio. Antes disto ela não recebe mundos. Se o
   * Recreio não responde ou recusa, lança o erro dele; quem hospeda tenta de
   * novo. Também serve para registrar outra vez quando o Recreio deixa de
   * conhecer a instância.
   */
  iniciar(): Promise<void>;
  conectou(conexao: Conexao): void;
  receber(conexao: Conexao, quadro: string): Promise<void>;
  desconectou(conexao: Conexao): void;
  /** Um passo de 100 ms em todos os mundos abertos. */
  passo(): Promise<void>;
  /** Renova as posses e recolhe as sessões encerradas no Recreio. */
  batimento(): Promise<void>;
  /** Desligamento ordenado: salva tudo, solta as posses, fecha as conexões. */
  encerrar(): Promise<void>;
  medir(): MedidasDaInstancia;
  /** Para os testes: o ator de um mundo, se estiver aberto aqui. */
  ator(mundoId: string): Ator | undefined;
  readonly batimentoMs: number;
};

export function criarInstancia(op: OpcoesDaInstancia): Instancia {
  const atores = new Map<string, Ator>();
  const ligacoes = new Map<Conexao, Ligacao>();
  const falhas = op.falhas ?? semFalhas();
  const registrar = op.registrar ?? (() => {});
  let batimentoMs = BATIMENTO_MS;
  let posseTtlMs = POSSE_TTL_MS;
  let cursor: string | null = null;
  let drenando = false;
  let registrada = false;
  /** Depois de uma queda simulada a instância não faz mais nada, como um processo morto. */
  let viva = true;

  function morrer(): void {
    viva = false;
    for (const ator of [...atores.values()]) ator.cair();
    atores.clear();
    for (const ligacao of ligacoes.values()) ligacao.fase = "fechada";
    ligacoes.clear();
  }

  /** Roda um trabalho de ator; uma queda simulada nele derruba a instância inteira. */
  async function vigiar<T>(trabalho: Promise<T>): Promise<T | undefined> {
    try {
      return await trabalho;
    } catch (erro) {
      if (erro instanceof QuedaSimulada) {
        morrer();
        throw erro;
      }
      throw erro;
    }
  }

  function atorDe(mundoId: string): Ator | null {
    const existente = atores.get(mundoId);
    if (existente) return existente;
    if (drenando || atores.size >= op.capacidade) return null;
    const novo = new Ator({
      mundoId: MundoIdSchema.parse(mundoId),
      host: op.host,
      agora: op.agora,
      posseTtlMs,
      falhas,
      definicao: op.definicao,
      regras: op.regras,
      checkpointMs: op.checkpointMs ?? 30_000,
      diarioParaFotografarBytes: op.diarioParaFotografarBytes,
      registrar,
      aoFechar(ator) {
        if (atores.get(ator.mundoId) === ator) atores.delete(ator.mundoId);
      },
    });
    atores.set(mundoId, novo);
    return novo;
  }

  function fechar(ligacao: Ligacao, codigo: number): void {
    if (ligacao.fase === "fechada") return;
    ligacao.fase = "fechada";
    ligacao.conexao.fechar(codigo);
    ligacoes.delete(ligacao.conexao);
  }

  /** Balde de fichas: recarrega com o tempo e gasta uma por quadro. */
  function temFicha(ligacao: Ligacao, intencao: boolean): boolean {
    const agora = op.agora();
    const passou = Math.max(0, agora - ligacao.recarregadaEm) / 1000;
    ligacao.recarregadaEm = agora;
    ligacao.fichas = Math.min(RAJADA_DE_QUADROS, ligacao.fichas + passou * QUADROS_POR_SEGUNDO);
    ligacao.fichasDeIntencao = Math.min(
      RAJADA_DE_INTENCOES,
      ligacao.fichasDeIntencao + passou * INTENCOES_POR_SEGUNDO,
    );
    if (ligacao.fichas < 1) return false;
    ligacao.fichas -= 1;
    if (!intencao) return true;
    if (ligacao.fichasDeIntencao < 1) return false;
    ligacao.fichasDeIntencao -= 1;
    return true;
  }

  return {
    get batimentoMs() {
      return batimentoMs;
    },

    async iniciar() {
      const registro = await op.host.registrar({
        urlPublica: op.urlPublica,
        versao: op.versao,
        capacidade: op.capacidade,
      });
      batimentoMs = registro.batimentoMs;
      posseTtlMs = registro.posseTtlMs;
      // Um registro novo é outra instância para o Recreio: cursor e drenagem começam do zero.
      cursor = null;
      drenando = false;
      registrada = true;
      registrar("instancia_registrada", {
        instanciaId: registro.instanciaId,
        batimentoMs,
        posseTtlMs,
      });
    },

    conectou(conexao) {
      if (!viva) return;
      ligacoes.set(conexao, {
        conexao,
        fase: "nova",
        ator: null,
        sid: null,
        jogadorId: null,
        perfilId: null,
        expiraEm: 0,
        seq: 0,
        fichas: RAJADA_DE_QUADROS,
        fichasDeIntencao: RAJADA_DE_INTENCOES,
        recarregadaEm: op.agora(),
      });
    },

    async receber(conexao, quadro) {
      const ligacao = ligacoes.get(conexao);
      if (!viva || !ligacao || ligacao.fase === "fechada") return;
      if (quadro.length > QUADRO_MAXIMO_BYTES) return fechar(ligacao, FECHAMENTO.protocolo);

      let bruto: unknown;
      try {
        bruto = JSON.parse(quadro);
      } catch {
        return fechar(ligacao, FECHAMENTO.protocolo);
      }
      const lida = MensagemDoClienteSchema.safeParse(bruto);
      if (!lida.success) return fechar(ligacao, FECHAMENTO.protocolo);
      const mensagem = lida.data;
      if (!temFicha(ligacao, mensagem.t === "intencao")) {
        return fechar(ligacao, FECHAMENTO.protocolo);
      }

      if (ligacao.fase === "nova") {
        // O primeiro quadro é sempre a entrada, com a sessão de jogo.
        if (mensagem.t !== "entrar") return fechar(ligacao, FECHAMENTO.protocolo);
        ligacao.fase = "entrando";
        let sessao: Awaited<ReturnType<VerificadorDeSessao["verificar"]>>;
        try {
          sessao = await op.verificador.verificar(mensagem.sessao);
        } catch (erro) {
          // Sem as chaves públicas do Recreio (ele não respondeu a tempo) não dá para
          // dizer que a sessão é inválida: o cliente reabre o mundo e tenta de novo.
          if (ehErroDoRecreio(erro, "INDISPONIVEL")) {
            registrar("chaves_indisponiveis", {});
            return fechar(ligacao, FECHAMENTO.reiniciando);
          }
          return fechar(ligacao, FECHAMENTO.sessao);
        }
        // Sem registro no Recreio a instância não abre mundo nenhum: o cliente reabre pelo Recreio.
        if (!registrada) return fechar(ligacao, FECHAMENTO.reiniciando);
        if (!MundoIdSchema.safeParse(mensagem.mundoId).success) {
          return fechar(ligacao, FECHAMENTO.semAcesso);
        }
        const ator = atorDe(mensagem.mundoId);
        if (!ator) return fechar(ligacao, FECHAMENTO.cheio);
        try {
          await vigiar(ator.entrar(ligacao, sessao));
        } catch (erro) {
          if (erro instanceof QuedaSimulada) throw erro;
          registrar("entrada_falhou", { codigo: ehErroDoRecreio(erro) ? erro.codigo : "erro" });
          fechar(ligacao, FECHAMENTO.reiniciando);
        }
        // A fase muda durante a entrada, por outras mãos: lê de novo, sem o estreitamento do compilador.
        if ((ligacao.fase as Ligacao["fase"]) === "fechada") ligacoes.delete(conexao);
        return;
      }

      if (ligacao.fase !== "dentro" || !ligacao.ator) return;
      switch (mensagem.t) {
        case "intencao":
          ligacao.ator.receber({ t: "intencao", ligacao, intencao: mensagem.intencao });
          return;
        case "sair":
          ligacao.ator.receber({ t: "sair", ligacao });
          return;
        case "pulso":
          return;
        case "renovar_sessao": {
          // A sessão renovada precisa ser a mesma: outro perfil ou outra sessão não entra por aqui.
          try {
            const nova = await op.verificador.verificar(mensagem.sessao);
            if (nova.sid !== ligacao.sid || nova.perfilId !== ligacao.perfilId) {
              return fechar(ligacao, FECHAMENTO.sessao);
            }
            ligacao.expiraEm = nova.expiraEm;
          } catch {
            // Token ruim não derruba quem ainda tem sessão valendo; ela vence no prazo dela.
          }
          return;
        }
        case "entrar":
          return fechar(ligacao, FECHAMENTO.protocolo);
      }
    },

    desconectou(conexao) {
      const ligacao = ligacoes.get(conexao);
      ligacoes.delete(conexao);
      if (!ligacao || ligacao.fase === "fechada") return;
      const { ator, sid } = ligacao;
      ligacao.fase = "fechada";
      // Só vale como queda se esta ainda é a conexão daquela sessão.
      if (ator && sid && ator.ligacoes.get(sid) === ligacao) {
        ator.ligacoes.delete(sid);
        ator.receber({ t: "caiu", sid });
      }
    },

    async passo() {
      if (!viva) return;
      await vigiar(Promise.all([...atores.values()].map((ator) => ator.passo())));
    },

    async batimento() {
      if (!viva || !registrada) return;
      const enviadoEm = op.agora();
      const ativos = [...atores.values()].filter((ator) => ator.estado === "ativo");
      let resposta: Awaited<ReturnType<ClienteDoHost["batimento"]>>;
      try {
        resposta = await op.host.batimento({
          mundos: ativos.map((ator) => ({
            mundoId: ator.mundoId,
            cerca: ator.cerca,
            jogadores: ator.ligacoes.size,
            tick: ator.tick,
          })),
          cursor,
        });
      } catch (erro) {
        if (ehErroDoRecreio(erro, "NAO_AUTENTICADO")) {
          // O Recreio não conhece mais esta instância, então as posses dela não
          // valem: larga os mundos sem escrever. Quem hospeda registra de novo.
          registrada = false;
          registrar("registro_perdido", { mundos: atores.size });
          for (const ator of [...atores.values()]) ator.perder("registro");
          return;
        }
        // Sem resposta, as posses não são renovadas: cada mundo se cerca sozinho no prazo.
        registrar("batimento_falhou", { codigo: ehErroDoRecreio(erro) ? erro.codigo : "erro" });
        return;
      }
      cursor = resposta.cursor;
      drenando = resposta.drenar;
      for (const posse of resposta.posses) {
        const ator = atores.get(posse.mundoId);
        if (!ator) continue;
        if (posse.estado === "perdida") ator.perder("batimento");
        // O prazo local conta da hora em que o pedido saiu: nunca passa do prazo do Recreio.
        else ator.validaAte = enviadoEm + posseTtlMs;
      }
      // Cada ator sabe se a sessão é dele, conectada ou em espera.
      for (const { sid } of resposta.sessoesEncerradas) {
        for (const ator of atores.values()) ator.encerrarSessao(sid);
      }
      if (ativos.length > 0 || resposta.sessoesEncerradas.length > 0) {
        registrar("batimento", {
          mundos: ativos.length,
          perdidas: resposta.posses.filter((posse) => posse.estado === "perdida").length,
          sessoesEncerradas: resposta.sessoesEncerradas.length,
          drenar: resposta.drenar,
        });
      }
    },

    async encerrar() {
      if (!viva) return;
      drenando = true;
      try {
        await op.host.drenar();
      } catch {
        // Sem o Recreio, ainda vale salvar o que der.
      }
      await Promise.allSettled([...atores.values()].map((ator) => ator.encerrar()));
      for (const ligacao of [...ligacoes.values()]) fechar(ligacao, FECHAMENTO.reiniciando);
      viva = false;
    },

    medir() {
      return {
        mundos: atores.size,
        conexoes: ligacoes.size,
        drenando,
        viva,
        registrada,
        porMundo: [...atores.values()].map((ator) => ator.medir()),
      };
    },

    ator: (mundoId) => atores.get(mundoId),
  };
}
