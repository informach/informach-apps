import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import {
  ARQUIVO_DO_MANIFESTO,
  arquivosDoManifesto,
  type Manifesto,
  ManifestoSchema,
  SUFIXO_BROTLI,
} from "@informach/morada-arte/manifesto";
import { sessaoVencida, type VerificadorDeSessao } from "@informach/recreio/contrato";

/**
 * A entrega da arte do Morada: os pacotes que o empacotador
 * (`@informach/morada-arte`) gravou em `MORADA_ARTE_DIR`, só para quem tem
 * uma sessão de jogo válida.
 *
 * - O caminho é `/arte/<arquivo>`, e só os nomes que o manifesto cita (mais o
 *   próprio `manifest.json`) existem. O nome é comparado inteiro, sem
 *   decodificar: `..`, barras e codificações nunca chegam ao disco.
 * - A sessão vai no cabeçalho `Authorization: Bearer <sessão>`, nunca no
 *   endereço, e é conferida pelo mesmo verificador do WebSocket (o JWKS do
 *   Recreio no modo ligado; a plataforma em memória no modo `falsa`).
 * - O CORS só responde às origens de `MORADA_ORIGENS`.
 * - Os pacotes têm o hash do conteúdo no nome: cache de um ano, privado e
 *   imutável. O manifesto não tem, e é revalidado a cada abertura pelo ETag.
 * - Quem aceita brotli recebe a cópia `.br` que o empacotador gravou.
 *
 * Tudo é lido para a memória na subida, inclusive as cópias em brotli:
 * trocar a arte é reiniciar o processo.
 */

export const PREFIXO_DA_ARTE = "/arte/";

/** Um ano: o nome muda quando o conteúdo muda. */
const CACHE_DOS_PACOTES = "private, max-age=31536000, immutable";
const CACHE_DO_MANIFESTO = "private, no-cache";

type Arquivo = {
  corpo: Buffer;
  brotli: Buffer | null;
  tipo: string;
  cache: string;
  /** Um ETag por representação: a cópia em brotli é outra sequência de bytes e leva o seu. */
  etag: string;
  etagBrotli: string;
};

export type OpcoesDaArte = {
  /** A pasta com `manifest.json` e os pacotes. */
  pasta: string;
  verificador: VerificadorDeSessao;
  /** Origens de página que podem pedir a arte (as mesmas do WebSocket). */
  origens: readonly string[];
  /** Recusa também quem não manda origem, como o WebSocket no modo ligado ao Recreio. */
  exigirOrigem?: boolean;
  agora?: () => number;
  /** Quanto tempo o navegador guarda a resposta da consulta prévia do CORS, em segundos. */
  preflightS?: number;
};

export type RotaDaArte = {
  /** Trata o pedido se ele for de arte. Devolve `false` para os outros caminhos. */
  tratar(pedido: IncomingMessage, resposta: ServerResponse): boolean;
  manifesto: Manifesto;
  /** Quantos arquivos podem ser entregues e quantos bytes somam, sem as cópias em brotli. */
  arquivos: number;
  bytes: number;
};

function carregar(pasta: string, nome: string, ehManifesto: boolean): Arquivo {
  const caminho = join(pasta, nome);
  if (!existsSync(caminho)) {
    throw new Error(`MORADA_ARTE_DIR: o manifesto cita ${nome}, que não está na pasta`);
  }
  const corpo = readFileSync(caminho);
  const resumo = createHash("sha256").update(corpo).digest("base64url").slice(0, 22);
  const comprimido = `${caminho}${SUFIXO_BROTLI}`;
  return {
    corpo,
    brotli: existsSync(comprimido) ? readFileSync(comprimido) : null,
    tipo: ehManifesto
      ? "application/json; charset=utf-8"
      : nome.endsWith(".png")
        ? "image/png"
        : "model/gltf-binary",
    cache: ehManifesto ? CACHE_DO_MANIFESTO : CACHE_DOS_PACOTES,
    etag: `"${resumo}"`,
    etagBrotli: `"${resumo}-br"`,
  };
}

/** Se o navegador aceita brotli, pelo `Accept-Encoding` (um `q=0` explícito recusa). */
export function aceitaBrotli(cabecalho: string | string[] | undefined): boolean {
  const texto = Array.isArray(cabecalho) ? cabecalho.join(",") : (cabecalho ?? "");
  return texto.split(",").some((parte) => {
    const [codificacao, ...parametros] = parte.trim().toLowerCase().split(";");
    if (codificacao?.trim() !== "br") return false;
    const q = parametros.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return q === undefined || Number(q.slice(2)) > 0;
  });
}

/** Lê o manifesto e os pacotes da pasta. Falha na subida se algo do manifesto não estiver lá. */
export function carregarArte(opcoes: OpcoesDaArte): RotaDaArte {
  const agora = opcoes.agora ?? Date.now;
  const caminhoDoManifesto = join(opcoes.pasta, ARQUIVO_DO_MANIFESTO);
  if (!existsSync(caminhoDoManifesto)) {
    throw new Error(`MORADA_ARTE_DIR: não há ${ARQUIVO_DO_MANIFESTO} na pasta`);
  }
  const lido = ManifestoSchema.safeParse(JSON.parse(readFileSync(caminhoDoManifesto, "utf8")));
  if (!lido.success) {
    throw new Error(`MORADA_ARTE_DIR: ${ARQUIVO_DO_MANIFESTO} fora do formato do empacotador`);
  }
  const manifesto = lido.data;
  const arquivos = new Map<string, Arquivo>();
  for (const nome of arquivosDoManifesto(manifesto)) {
    arquivos.set(nome, carregar(opcoes.pasta, nome, nome === ARQUIVO_DO_MANIFESTO));
  }

  /** Os cabeçalhos de CORS de uma origem permitida; nenhum para as outras. */
  const cors = (origem: string | undefined): Record<string, string> =>
    origem !== undefined && opcoes.origens.includes(origem)
      ? { "access-control-allow-origin": origem, vary: "Origin" }
      : {};

  const responder = (
    resposta: ServerResponse,
    status: number,
    origem: string | undefined,
    codigo: string,
  ): void => {
    resposta.writeHead(status, {
      ...cors(origem),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    resposta.end(JSON.stringify({ codigo }));
  };

  /** Confere a sessão; só depois procura o nome, para quem não tem sessão não descobrir quais existem. */
  async function atender(
    pedido: IncomingMessage,
    resposta: ServerResponse,
    nome: string,
  ): Promise<void> {
    const origem = pedido.headers.origin;
    const autorizacao = pedido.headers.authorization ?? "";
    const token = autorizacao.startsWith("Bearer ") ? autorizacao.slice(7).trim() : "";
    if (!token) return responder(resposta, 401, origem, "SESSAO_AUSENTE");
    try {
      const sessao = await opcoes.verificador.verificar(token);
      if (sessaoVencida(sessao.expiraEm, agora())) {
        return responder(resposta, 401, origem, "SESSAO_INVALIDA");
      }
    } catch {
      return responder(resposta, 401, origem, "SESSAO_INVALIDA");
    }

    const arquivo = arquivos.get(nome);
    if (!arquivo) return responder(resposta, 404, origem, "NAO_ENCONTRADO");
    const comBrotli = arquivo.brotli !== null && aceitaBrotli(pedido.headers["accept-encoding"]);
    const corpo = comBrotli && arquivo.brotli ? arquivo.brotli : arquivo.corpo;
    const etag = comBrotli ? arquivo.etagBrotli : arquivo.etag;
    const cabecalhos: Record<string, string> = {
      ...cors(origem),
      "content-type": arquivo.tipo,
      "cache-control": arquivo.cache,
      etag,
      "x-content-type-options": "nosniff",
      // A resposta muda com a origem (CORS) e com a codificação aceita.
      vary: "Origin, Accept-Encoding",
    };
    if (comBrotli) cabecalhos["content-encoding"] = "br";
    if (pedido.headers["if-none-match"] === etag) {
      resposta.writeHead(304, cabecalhos);
      resposta.end();
      return;
    }
    cabecalhos["content-length"] = String(corpo.length);
    resposta.writeHead(200, cabecalhos);
    resposta.end(pedido.method === "HEAD" ? undefined : corpo);
  }

  return {
    manifesto,
    arquivos: arquivos.size,
    bytes: [...arquivos.values()].reduce((soma, a) => soma + a.corpo.length, 0),

    tratar(pedido, resposta) {
      const caminho = (pedido.url ?? "/").split("?")[0] ?? "/";
      if (!caminho.startsWith(PREFIXO_DA_ARTE)) return false;
      const origem = pedido.headers.origin;
      const permitida =
        origem === undefined ? !opcoes.exigirOrigem : opcoes.origens.includes(origem);
      if (!permitida) {
        responder(resposta, 403, undefined, "ORIGEM_RECUSADA");
        return true;
      }
      if (pedido.method === "OPTIONS") {
        resposta.writeHead(204, {
          ...cors(origem),
          "access-control-allow-methods": "GET, HEAD",
          "access-control-allow-headers": "authorization",
          "access-control-max-age": String(opcoes.preflightS ?? 600),
          "cache-control": "no-store",
        });
        resposta.end();
        return true;
      }
      if (pedido.method !== "GET" && pedido.method !== "HEAD") {
        responder(resposta, 405, origem, "METODO_NAO_PERMITIDO");
        return true;
      }
      // O nome é comparado inteiro, sem decodificar: `..`, barras e `%2e` nunca casam.
      atender(pedido, resposta, caminho.slice(PREFIXO_DA_ARTE.length)).catch(() => {
        if (!resposta.headersSent) responder(resposta, 500, origem, "ERRO");
        else resposta.destroy();
      });
      return true;
    },
  };
}
