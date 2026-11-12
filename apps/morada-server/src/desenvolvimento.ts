import type { IncomingMessage, ServerResponse } from "node:http";
import type { MundoId, PerfilId, SessaoDeJogoId } from "@informach/recreio";
import type { ClienteDoHost, VerificadorDeSessao } from "@informach/recreio/host";
import { criarEmissorDeTeste, criarPlataformaFalsa } from "@informach/recreio/testing";

/**
 * Plataforma de desenvolvimento: o Recreio em memória, para rodar o servidor
 * e o cliente do jogo sem subir o portal nem o banco. Qualquer pessoa entra
 * dizendo um apelido, e todos caem no mesmo mundo.
 *
 * Nada aqui é seguro nem persiste: o mundo some quando o processo para. A
 * configuração recusa este modo em produção, e fora dele as rotas `/dev/*`
 * não existem.
 */

const JOGO = "morada";
/** Abaixo disto o token venceria antes de chegar a quem pediu. */
const VALIDADE_MINIMA_S = 2;
const CORPO_MAXIMO = 8 * 1024;

export type SessaoDeDesenvolvimento = {
  /** A sessão de jogo, como o Recreio a entregaria. */
  sessao: string;
  /** Quanto este token ainda vale, em ms. Quem joga renova antes disso. */
  validadeMs: number;
};

export type EntradaDeDesenvolvimento = SessaoDeDesenvolvimento & {
  mundoId: MundoId;
  endereco: string;
  apelido: string;
};

export type OpcoesDaEntrada = {
  /**
   * Voltar com a sessão que este apelido já tem aberta, em vez de abrir outra:
   * é o que faz o mundo retomar a reserva depois de uma queda. Uma sessão nova
   * toma o lugar da antiga.
   */
  continuar?: boolean;
  /** Validade dos tokens desta sessão, em segundos, para testar a renovação sem esperar 15 minutos. */
  validadeS?: number;
};

export type PlataformaDeDesenvolvimento = {
  host: ClienteDoHost;
  verificador: VerificadorDeSessao;
  agora(): number;
  /** Entra no mundo de desenvolvimento com um apelido. */
  entrar(apelido: string, opcoes?: OpcoesDaEntrada): Promise<EntradaDeDesenvolvimento>;
  /**
   * Troca um token que ainda vale por outro, da mesma sessão e com prazo novo.
   * `null` se o token não confere ou se a sessão já foi trocada por outra.
   */
  renovar(token: string): Promise<SessaoDeDesenvolvimento | null>;
  /** Rotas HTTP de desenvolvimento. Devolve `true` se atendeu o pedido. */
  rotas(pedido: IncomingMessage, resposta: ServerResponse): boolean;
};

type JogadorDeDesenvolvimento = {
  perfilId: PerfilId;
  /** A sessão de jogo aberta deste apelido. */
  sid: SessaoDeJogoId | null;
  validadeS: number | null;
};

type Resposta = { status: number; corpo: unknown };

function objetoDe(texto: string): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(texto);
    return typeof valor === "object" && valor !== null && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function criarPlataformaDeDesenvolvimento(opcoes: {
  urlPublica: string;
  origens: readonly string[];
  /** Relógio real, em ms. Só os testes trocam. */
  relogio?: () => number;
}): Promise<PlataformaDeDesenvolvimento> {
  const relogio = opcoes.relogio ?? Date.now;
  const plataforma = criarPlataformaFalsa({ inicio: relogio() });
  const recreio = await criarEmissorDeTeste({ emissor: "http://recreio.dev" });
  const jogadores = new Map<string, JogadorDeDesenvolvimento>();
  let mundoId: MundoId | null = null;

  // O relógio da plataforma em memória acompanha o relógio real.
  const agora = () => {
    const falta = relogio() - plataforma.agora();
    if (falta > 0) plataforma.avancar(falta);
    return plataforma.agora();
  };
  const verificador = recreio.verificador(JOGO, () => new Date(agora()));

  async function emitir(
    jogador: JogadorDeDesenvolvimento,
    sid: SessaoDeJogoId,
  ): Promise<SessaoDeDesenvolvimento> {
    const emitidaEm = agora();
    const { token, expiraEm } = await recreio.emissor.sessao({
      jogo: JOGO,
      perfilId: jogador.perfilId,
      sid,
      versaoDaPolitica: 1,
      jti: crypto.randomUUID(),
      agora: new Date(emitidaEm),
      validoAte: jogador.validadeS === null ? null : new Date(emitidaEm + jogador.validadeS * 1000),
    });
    return { sessao: token, validadeMs: expiraEm.getTime() - emitidaEm };
  }

  async function entrar(
    apelido: string,
    daEntrada: OpcoesDaEntrada = {},
  ): Promise<EntradaDeDesenvolvimento> {
    agora();
    let jogador = jogadores.get(apelido);
    if (!jogador) {
      jogador = { perfilId: plataforma.criarPerfil({ apelido }), sid: null, validadeS: null };
      jogadores.set(apelido, jogador);
      // O primeiro a chegar cria o mundo; os outros entram dividindo a família.
      if (!mundoId) {
        mundoId = plataforma.criarMundo({
          criador: jogador.perfilId,
          nome: "Mundo de desenvolvimento",
        });
      } else plataforma.adicionarMembro(mundoId, jogador.perfilId);
    }
    if (!mundoId) throw new Error("mundo de desenvolvimento ausente");
    const { endereco } = plataforma.abrirMundo(mundoId, jogador.perfilId);
    let sid = daEntrada.continuar ? jogador.sid : null;
    if (!sid) {
      sid = plataforma.abrirSessao(jogador.perfilId);
      jogador.sid = sid;
      jogador.validadeS =
        daEntrada.validadeS === undefined
          ? null
          : Math.max(VALIDADE_MINIMA_S, Math.floor(daEntrada.validadeS));
    }
    return { ...(await emitir(jogador, sid)), mundoId, endereco, apelido };
  }

  async function renovar(token: string): Promise<SessaoDeDesenvolvimento | null> {
    agora();
    let sid: SessaoDeJogoId;
    let perfilId: PerfilId;
    try {
      ({ sid, perfilId } = await verificador.verificar(token));
    } catch {
      return null;
    }
    // Só a sessão aberta de cada apelido renova: a que outra entrada substituiu acabou.
    for (const jogador of jogadores.values()) {
      if (jogador.sid === sid && jogador.perfilId === perfilId) return emitir(jogador, sid);
    }
    return null;
  }

  async function atender(caminho: string, corpo: string): Promise<Resposta> {
    const dados = objetoDe(corpo);
    if (caminho === "/dev/renovar") {
      if (typeof dados?.sessao !== "string") {
        return { status: 400, corpo: { codigo: "ENTRADA_INVALIDA" } };
      }
      const renovada = await renovar(dados.sessao);
      return renovada
        ? { status: 200, corpo: renovada }
        : { status: 401, corpo: { codigo: "SESSAO_INVALIDA" } };
    }
    const apelido = typeof dados?.apelido === "string" ? dados.apelido.trim() : "";
    const pedida = dados?.validadeS;
    const validadeS = typeof pedida === "number" && Number.isFinite(pedida) ? pedida : undefined;
    if (
      apelido.length < 2 ||
      apelido.length > 20 ||
      (pedida !== undefined && validadeS === undefined)
    ) {
      return { status: 400, corpo: { codigo: "ENTRADA_INVALIDA" } };
    }
    return {
      status: 200,
      corpo: await entrar(apelido, { continuar: dados?.continuar === true, validadeS }),
    };
  }

  function cors(pedido: IncomingMessage, resposta: ServerResponse): void {
    const origem = pedido.headers.origin;
    if (origem && opcoes.origens.includes(origem)) {
      resposta.setHeader("access-control-allow-origin", origem);
      resposta.setHeader("access-control-allow-headers", "content-type");
      resposta.setHeader("vary", "origin");
    }
  }

  return {
    host: plataforma.cliente(),
    verificador,
    agora,
    entrar,
    renovar,
    rotas(pedido, resposta) {
      const caminho = (pedido.url ?? "/").split("?")[0];
      if (caminho !== "/dev/entrar" && caminho !== "/dev/renovar") return false;
      cors(pedido, resposta);
      if (pedido.method === "OPTIONS") {
        resposta.writeHead(204).end();
        return true;
      }
      if (pedido.method !== "POST") {
        resposta.writeHead(405).end();
        return true;
      }
      let corpo = "";
      pedido.on("data", (parte: Buffer) => {
        corpo += parte.toString("utf8");
        if (corpo.length > CORPO_MAXIMO) pedido.destroy();
      });
      pedido.on("end", () => {
        atender(caminho, corpo)
          .catch(
            (erro: unknown): Resposta => ({
              status: 503,
              corpo: { codigo: erro instanceof Error ? erro.message : "INDISPONIVEL" },
            }),
          )
          .then(({ status, corpo: dados }) => {
            resposta.writeHead(status, {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            });
            resposta.end(JSON.stringify(dados));
          });
      });
      return true;
    },
  };
}
