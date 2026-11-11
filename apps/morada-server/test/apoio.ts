import {
  type AcaoPedida,
  aplicarMudancas,
  type MoradorId,
  type Mundo,
  REGRAS_DA_PROVA,
  type RegrasDoMundo,
  type Resultado,
  type VisaoDoCliente,
} from "@informach/morada-sim";
import type { DefinicaoDeBairro } from "@informach/morada-sim/formatos";
import {
  type MensagemDoCliente,
  type MensagemDoServidor,
  VERSAO_DO_PROTOCOLO,
} from "@informach/morada-sim/protocolo";
import type { MundoId, PerfilId, SessaoDeJogoId } from "@informach/recreio";
import type { ClienteDoHost } from "@informach/recreio/host";
import {
  criarEmissorDeTeste,
  criarPlataformaFalsa,
  type EmissorDeTeste,
  type PlataformaFalsa,
} from "@informach/recreio/testing";
import type { Conexao } from "../src/ator";
import { criarFalhas, type Falhas, QuedaSimulada } from "../src/falhas";
import { criarInstancia, type Instancia } from "../src/instancia";

/**
 * Bancada de testes do servidor: a plataforma em memória, um emissor de
 * tokens, instâncias de verdade e clientes que falam o protocolo por conexões
 * em memória. O tempo é do teste: cada `andar` são passos de 100 ms.
 */

export class ClienteDeTeste {
  readonly quadros: MensagemDoServidor[] = [];
  readonly resultados = new Map<string, Resultado>();
  visao: VisaoDoCliente | null = null;
  jogadorId: string | null = null;
  fechamento: number | null = null;
  enviados = 0;
  private comandos = 0;
  private instancia: Instancia | null = null;
  readonly conexao: Conexao;

  constructor(
    readonly nome: string,
    readonly perfilId: PerfilId,
  ) {
    this.conexao = {
      enviar: (texto) => this.chegou(JSON.parse(texto) as MensagemDoServidor),
      fechar: (codigo) => {
        this.fechamento = codigo;
      },
      pendente: () => 0,
    };
  }

  private chegou(mensagem: MensagemDoServidor): void {
    this.quadros.push(mensagem);
    switch (mensagem.t) {
      case "bem_vindo":
        this.jogadorId = mensagem.jogadorId;
        break;
      case "fotografia":
        this.visao = mensagem.visao;
        break;
      case "passo":
        if (this.visao) aplicarMudancas(this.visao, mensagem.tick, mensagem.mudancas);
        break;
      case "resultado":
        this.resultados.set(mensagem.resultado.comandoId, mensagem.resultado);
        break;
    }
  }

  get aberto(): boolean {
    return this.fechamento === null && this.instancia !== null;
  }

  async ligar(instancia: Instancia, mundoId: string, token: string): Promise<void> {
    this.instancia = instancia;
    this.fechamento = null;
    instancia.conectou(this.conexao);
    await this.mandar({ t: "entrar", v: VERSAO_DO_PROTOCOLO, sessao: token, mundoId });
  }

  async mandar(mensagem: MensagemDoCliente): Promise<void> {
    await this.bruto(JSON.stringify(mensagem));
  }

  async bruto(quadro: string): Promise<void> {
    if (!this.instancia) throw new Error("cliente sem instância");
    this.enviados++;
    await this.instancia.receber(this.conexao, quadro);
  }

  /** Manda uma intenção. A resposta chega em `resultados` depois do próximo passo. */
  async comando(
    moradorId: MoradorId | null,
    acao: AcaoPedida,
    comandoId?: string,
  ): Promise<string> {
    const id = comandoId ?? `${this.nome}-${String(++this.comandos).padStart(4, "0")}`;
    await this.mandar({
      t: "intencao",
      intencao: {
        comandoId: id,
        mundoId: this.visao?.mundoId ?? "",
        moradorId,
        acao,
        versaoEsperada: 0,
      },
    });
    return id;
  }

  /** A conexão some sem aviso, como um cabo puxado. */
  cair(): void {
    this.instancia?.desconectou(this.conexao);
    this.instancia = null;
  }

  moradorDeNome(nome: string) {
    const visao = this.visao;
    if (!visao) throw new Error("cliente sem visão");
    const achado = visao.moradores.ordem
      .map((id) => visao.moradores.porId[id])
      .find((morador) => morador?.nome === nome);
    if (!achado) throw new Error(`Não há morador chamado ${nome}`);
    return achado;
  }
}

export type Bancada = Awaited<ReturnType<typeof criarBancada>>;

export async function criarBancada(
  opcoes: {
    regras?: Partial<RegrasDoMundo>;
    definicao?: DefinicaoDeBairro;
    checkpointMs?: number;
    capacidade?: number;
  } = {},
) {
  const plataforma: PlataformaFalsa = criarPlataformaFalsa();
  const recreio: EmissorDeTeste = await criarEmissorDeTeste();
  let agoraMs = plataforma.agora();
  const instancias = new Map<string, { instancia: Instancia; falhas: Falhas; host: HostDeTeste }>();
  const sessoes = new Map<ClienteDeTeste, SessaoDeJogoId>();

  /** O cliente das instâncias, com um interruptor para simular o Recreio fora do ar. */
  type HostDeTeste = ClienteDoHost & { foraDoAr: boolean; chamadas: string[] };
  function hostDeTeste(): HostDeTeste {
    const real = plataforma.cliente();
    const host = { foraDoAr: false, chamadas: [] as string[] } as HostDeTeste;
    for (const nome of Object.keys(real) as (keyof ClienteDoHost)[]) {
      // biome-ignore lint/suspicious/noExplicitAny: repasse genérico dos métodos do cliente.
      (host as any)[nome] = async (...args: unknown[]) => {
        if (host.foraDoAr) throw new Error("Recreio fora do ar");
        host.chamadas.push(nome);
        // biome-ignore lint/suspicious/noExplicitAny: repasse genérico dos métodos do cliente.
        return (real as any)[nome](...args);
      };
    }
    return host;
  }

  async function novaInstancia(url = "wss://a.test") {
    const falhas = criarFalhas();
    const host = hostDeTeste();
    const instancia = criarInstancia({
      host,
      verificador: recreio.verificador("morada", () => new Date(agoraMs)),
      agora: () => agoraMs,
      urlPublica: url,
      versao: "teste",
      capacidade: opcoes.capacidade ?? 10,
      regras: opcoes.regras ?? REGRAS_DA_PROVA,
      definicao: opcoes.definicao,
      checkpointMs: opcoes.checkpointMs ?? 30_000,
      falhas,
    });
    await instancia.iniciar();
    instancias.set(url, { instancia, falhas, host });
    return { instancia, falhas, host };
  }

  function token(cliente: ClienteDeTeste): Promise<string> {
    const sid = sessoes.get(cliente);
    if (!sid) throw new Error("cliente sem sessão de jogo");
    return recreio.sessao({ perfilId: cliente.perfilId, sid, agora: new Date(agoraMs) });
  }

  return {
    plataforma,
    recreio,
    instancias,
    novaInstancia,
    agora: () => agoraMs,

    jogador(nome: string): ClienteDeTeste {
      return new ClienteDeTeste(nome, plataforma.criarPerfil({ apelido: nome }));
    },

    criarMundo(dono: ClienteDeTeste): MundoId {
      return plataforma.criarMundo({ criador: dono.perfilId });
    },

    convidar(mundoId: MundoId, convidado: ClienteDeTeste, participacao?: string): void {
      plataforma.adicionarMembro(mundoId, convidado.perfilId, { participacao });
    },

    /**
     * O que o navegador faz para jogar: pede ao Recreio para abrir o mundo,
     * recebe o endereço da instância e entra nela com a sessão de jogo.
     */
    async entrar(
      cliente: ClienteDeTeste,
      mundoId: MundoId,
      novaSessao = false,
    ): Promise<Instancia> {
      const { endereco } = plataforma.abrirMundo(mundoId, cliente.perfilId);
      const alvo = instancias.get(endereco);
      if (!alvo) throw new Error(`Não há instância em ${endereco}`);
      if (novaSessao || !sessoes.has(cliente)) {
        sessoes.set(cliente, plataforma.abrirSessao(cliente.perfilId));
      }
      await cliente.ligar(alvo.instancia, mundoId, await token(cliente));
      return alvo.instancia;
    },

    sessaoDe: (cliente: ClienteDeTeste) => sessoes.get(cliente),
    token,

    /**
     * Anda o tempo: cada tick são 100 ms no relógio das instâncias e no do
     * Recreio. As instâncias batem a cada 10 s e os clientes renovam a sessão
     * a cada 5 min, como o SDK faz.
     */
    async andar(
      ticks: number,
      quais: Instancia[] = [...instancias.values()].map((i) => i.instancia),
      clientes: ClienteDeTeste[] = [],
    ): Promise<void> {
      for (let i = 0; i < ticks; i++) {
        agoraMs += 100;
        plataforma.avancar(100);
        for (const instancia of quais) await instancia.passo();
        if (agoraMs % 10_000 === 0) for (const instancia of quais) await instancia.batimento();
        if (agoraMs % 300_000 === 0) {
          for (const cliente of clientes) {
            if (cliente.aberto)
              await cliente.mandar({ t: "renovar_sessao", sessao: await token(cliente) });
          }
        }
      }
    },

    /** Passa o tempo sem que ninguém ande: instâncias paradas, Recreio vivo. */
    esperar(ms: number): void {
      agoraMs += ms;
      plataforma.avancar(ms);
    },
  };
}

/** O mundo de um ator, para os testes olharem. */
export function mundoDe(instancia: Instancia, mundoId: string): Mundo {
  const mundo = instancia.ator(mundoId)?.simulacao;
  if (!mundo) throw new Error("mundo não está aberto nesta instância");
  return mundo;
}

/** Anda até a condição valer; falha se passar do limite. */
export async function ate(
  bancada: Bancada,
  condicao: () => boolean,
  limite: number,
  descricao: string,
  clientes: ClienteDeTeste[] = [],
): Promise<void> {
  for (let i = 0; i < limite; i++) {
    if (condicao()) return;
    await bancada.andar(1, undefined, clientes);
  }
  if (!condicao()) throw new Error(`Passaram ${limite} ticks e ${descricao} não aconteceu`);
}

/** Anda esperando uma queda simulada; devolve o ponto em que a instância caiu. */
export async function ateCair(
  bancada: Bancada,
  limite: number,
  clientes: ClienteDeTeste[] = [],
): Promise<string> {
  for (let i = 0; i < limite; i++) {
    try {
      await bancada.andar(1, undefined, clientes);
    } catch (erro) {
      if (erro instanceof QuedaSimulada) return erro.ponto;
      throw erro;
    }
  }
  throw new Error(`Passaram ${limite} ticks e a instância não caiu`);
}
