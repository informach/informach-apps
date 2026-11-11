import type { IncomingMessage, ServerResponse } from "node:http";
import type { MundoId, PerfilId } from "@informach/recreio";
import type { ClienteDoHost, VerificadorDeSessao } from "@informach/recreio/host";
import { criarEmissorDeTeste, criarPlataformaFalsa } from "@informach/recreio/testing";

/**
 * Plataforma de desenvolvimento: o Recreio em memória, para rodar o servidor
 * e o cliente do jogo sem subir o portal nem o banco. Qualquer pessoa entra
 * dizendo um apelido, e todos caem no mesmo mundo.
 *
 * Nada aqui é seguro nem persiste: o mundo some quando o processo para. A
 * configuração recusa este modo em produção.
 */

export type PlataformaDeDesenvolvimento = {
  host: ClienteDoHost;
  verificador: VerificadorDeSessao;
  agora(): number;
  /** Rotas HTTP de desenvolvimento. Devolve `true` se atendeu o pedido. */
  rotas(pedido: IncomingMessage, resposta: ServerResponse): boolean;
};

export async function criarPlataformaDeDesenvolvimento(opcoes: {
  urlPublica: string;
  origens: readonly string[];
}): Promise<PlataformaDeDesenvolvimento> {
  const plataforma = criarPlataformaFalsa({ inicio: Date.now() });
  const recreio = await criarEmissorDeTeste({ emissor: "http://recreio.dev" });
  const perfis = new Map<string, PerfilId>();
  let mundoId: MundoId | null = null;

  // O relógio da plataforma em memória acompanha o relógio real.
  const agora = () => {
    const falta = Date.now() - plataforma.agora();
    if (falta > 0) plataforma.avancar(falta);
    return plataforma.agora();
  };

  async function entrar(apelido: string) {
    agora();
    let perfilId = perfis.get(apelido);
    if (!perfilId) {
      perfilId = plataforma.criarPerfil({ apelido });
      perfis.set(apelido, perfilId);
      // O primeiro a chegar cria o mundo; os outros entram dividindo a família.
      if (!mundoId)
        mundoId = plataforma.criarMundo({ criador: perfilId, nome: "Mundo de desenvolvimento" });
      else plataforma.adicionarMembro(mundoId, perfilId);
    }
    if (!mundoId) throw new Error("mundo de desenvolvimento ausente");
    const { endereco } = plataforma.abrirMundo(mundoId, perfilId);
    const sid = plataforma.abrirSessao(perfilId);
    const sessao = await recreio.sessao({ perfilId, sid, agora: new Date(agora()) });
    return { sessao, mundoId, endereco, apelido };
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
    verificador: recreio.verificador("morada", () => new Date(agora())),
    agora,
    rotas(pedido, resposta) {
      const caminho = (pedido.url ?? "/").split("?")[0];
      if (caminho !== "/dev/entrar") return false;
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
        if (corpo.length > 1024) pedido.destroy();
      });
      pedido.on("end", () => {
        let apelido = "";
        try {
          apelido = String((JSON.parse(corpo) as { apelido?: unknown }).apelido ?? "").trim();
        } catch {
          apelido = "";
        }
        if (apelido.length < 2 || apelido.length > 20) {
          resposta.writeHead(400, { "content-type": "application/json" });
          resposta.end(JSON.stringify({ codigo: "ENTRADA_INVALIDA" }));
          return;
        }
        entrar(apelido).then(
          (dados) => {
            resposta.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            resposta.end(JSON.stringify(dados));
          },
          (erro: unknown) => {
            resposta.writeHead(503, { "content-type": "application/json" });
            resposta.end(
              JSON.stringify({ codigo: erro instanceof Error ? erro.message : "INDISPONIVEL" }),
            );
          },
        );
      });
      return true;
    },
  };
}
