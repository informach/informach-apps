import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  FECHAMENTO,
  PRAZO_PARA_ENTRAR_MS,
  QUADRO_MAXIMO_BYTES,
  SUBPROTOCOLO,
} from "@informach/morada-sim/protocolo";
import { type WebSocket, WebSocketServer } from "ws";
import type { Conexao } from "./ator";
import type { Instancia } from "./instancia";

/**
 * O servidor de rede em volta de uma instância: WebSocket para o jogo e HTTP
 * para saúde e medidas. A instância não sabe de nada disto; aqui só se
 * traduz socket em conexão e relógio em passo.
 */

export type OpcoesDoServidor = {
  instancia: Instancia;
  /** Origens de página que podem abrir o WebSocket. Outra origem é recusada na subida. */
  origens: readonly string[];
  commit: string | null;
  /** Segredo para ler as medidas. Sem ele, a rota não existe. */
  tokenDeMetricas: string | null;
  /** De quanto em quanto tempo o servidor confere se o cliente ainda responde. */
  pingMs?: number;
  /** Rotas extras, só para desenvolvimento. */
  rotas?(pedido: IncomingMessage, resposta: ServerResponse): boolean;
  aoErro?(erro: unknown, contexto: string): void;
};

export type Servidor = {
  http: Server;
  /** Começa a ouvir e a andar. Devolve a porta em uso. */
  iniciar(porta: number, host?: string): Promise<number>;
  /** Para de aceitar conexões, salva os mundos e fecha tudo. */
  encerrar(): Promise<void>;
};

const PASSO_MS = 100;

function json(resposta: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo);
  resposta.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  resposta.end(texto);
}

function mesmoSegredo(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function criarServidor(op: OpcoesDoServidor): Servidor {
  const { instancia } = op;
  const aoErro = op.aoErro ?? (() => {});
  const pingMs = op.pingMs ?? 5000;
  let pronto = false;
  let encerrando = false;
  let relogio: NodeJS.Timeout | null = null;
  let batimento: NodeJS.Timeout | null = null;
  let pulsacao: NodeJS.Timeout | null = null;

  const http = createServer((pedido, resposta) => {
    const caminho = (pedido.url ?? "/").split("?")[0];
    if (pedido.method === "GET" && caminho === "/api/health") {
      return json(resposta, 200, { app: "morada-server", status: "ok", commit: op.commit });
    }
    if (pedido.method === "GET" && caminho === "/api/ready") {
      // Pronto é estar registrado no Recreio e aceitando mundos.
      const medidas = instancia.medir();
      const ok = pronto && !encerrando && medidas.viva && !medidas.drenando;
      return json(resposta, ok ? 200 : 503, { status: ok ? "ready" : "unavailable" });
    }
    if (pedido.method === "GET" && caminho === "/api/metricas" && op.tokenDeMetricas) {
      const autorizacao = pedido.headers.authorization ?? "";
      if (!mesmoSegredo(autorizacao, `Bearer ${op.tokenDeMetricas}`)) {
        return json(resposta, 401, { codigo: "NAO_AUTENTICADO" });
      }
      const memoria = process.memoryUsage();
      const cpu = process.cpuUsage();
      return json(resposta, 200, {
        ...instancia.medir(),
        processo: {
          cpuUsuarioMs: Math.round(cpu.user / 1000),
          cpuSistemaMs: Math.round(cpu.system / 1000),
          rssBytes: memoria.rss,
          heapBytes: memoria.heapUsed,
          ligadoHaS: Math.round(process.uptime()),
        },
      });
    }
    if (op.rotas?.(pedido, resposta)) return;
    json(resposta, 404, { codigo: "NAO_ENCONTRADO" });
  });

  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: QUADRO_MAXIMO_BYTES,
    perMessageDeflate: false,
    handleProtocols: (protocolos) => (protocolos.has(SUBPROTOCOLO) ? SUBPROTOCOLO : false),
  });

  http.on("upgrade", (pedido, socket, cabeca) => {
    const origem = pedido.headers.origin;
    const recusar = (status: number, texto: string) => {
      socket.write(`HTTP/1.1 ${status} ${texto}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (encerrando || !pronto) return recusar(503, "Service Unavailable");
    // Navegador sempre manda a origem. Sem origem, só quem não é navegador (testes, robôs de carga).
    if (origem !== undefined && !op.origens.includes(origem)) return recusar(403, "Forbidden");
    const pedidos = (pedido.headers["sec-websocket-protocol"] ?? "")
      .split(",")
      .map((p) => p.trim());
    if (!pedidos.includes(SUBPROTOCOLO)) return recusar(400, "Bad Request");
    sockets.handleUpgrade(pedido, socket, cabeca, (ws) => sockets.emit("connection", ws, pedido));
  });

  const vivos = new WeakMap<WebSocket, boolean>();

  sockets.on("connection", (ws: WebSocket) => {
    let entrou = false;
    const conexao: Conexao = {
      enviar(texto) {
        if (ws.readyState === ws.OPEN) ws.send(texto);
      },
      fechar(codigo) {
        if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close(codigo);
      },
      pendente: () => ws.bufferedAmount,
    };
    vivos.set(ws, true);
    instancia.conectou(conexao);

    // Quem conecta e não se apresenta não fica ocupando lugar.
    const prazo = setTimeout(() => {
      if (!entrou) ws.close(FECHAMENTO.sessao);
    }, PRAZO_PARA_ENTRAR_MS);

    ws.on("pong", () => vivos.set(ws, true));
    ws.on("message", (dados, binario) => {
      entrou = true;
      if (binario) return ws.close(FECHAMENTO.protocolo);
      instancia.receber(conexao, dados.toString("utf8")).catch((erro: unknown) => {
        aoErro(erro, "receber");
        ws.close(FECHAMENTO.reiniciando);
      });
    });
    ws.on("close", () => {
      clearTimeout(prazo);
      instancia.desconectou(conexao);
    });
    ws.on("error", (erro) => {
      // Quadro grande demais ou fora do protocolo do WebSocket: a conexão cai.
      aoErro(erro, "socket");
      ws.terminate();
    });
  });

  /** O laço de 100 ms. Se um passo demora, o seguinte espera: nunca dois ao mesmo tempo. */
  function ligarRelogio(): void {
    let proximo = performance.now() + PASSO_MS;
    const rodar = () => {
      if (encerrando) return;
      instancia
        .passo()
        .catch((erro: unknown) => aoErro(erro, "passo"))
        .finally(() => {
          const agora = performance.now();
          // Atrasou mais de três passos: recomeça a contar daqui, sem tentar recuperar tudo.
          if (agora - proximo > 3 * PASSO_MS) proximo = agora;
          proximo += PASSO_MS;
          relogio = setTimeout(rodar, Math.max(0, proximo - performance.now()));
        });
    };
    relogio = setTimeout(rodar, PASSO_MS);
  }

  return {
    http,

    async iniciar(porta, host = "::") {
      await new Promise<void>((resolve, reject) => {
        http.once("error", reject);
        http.listen(porta, host, () => {
          http.off("error", reject);
          resolve();
        });
      });
      await instancia.iniciar();
      pronto = true;
      ligarRelogio();
      batimento = setInterval(() => {
        instancia.batimento().catch((erro: unknown) => aoErro(erro, "batimento"));
      }, instancia.batimentoMs);
      // Conexão que não responde ao ping em um intervalo é derrubada: a queda vira sessão em espera.
      pulsacao = setInterval(() => {
        for (const ws of sockets.clients) {
          if (vivos.get(ws) === false) {
            ws.terminate();
            continue;
          }
          vivos.set(ws, false);
          ws.ping();
        }
      }, pingMs);
      const endereco = http.address();
      return typeof endereco === "object" && endereco ? endereco.port : porta;
    },

    async encerrar() {
      if (encerrando) return;
      encerrando = true;
      if (relogio) clearTimeout(relogio);
      if (batimento) clearInterval(batimento);
      if (pulsacao) clearInterval(pulsacao);
      await instancia.encerrar();
      for (const ws of sockets.clients) ws.close(FECHAMENTO.reiniciando);
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
