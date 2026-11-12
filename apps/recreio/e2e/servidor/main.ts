/**
 * Servidor do jogo de teste do Recreio: um contador por mundo, com a lista de
 * quem está presente. É pequeno, mas é um cidadão correto da plataforma, e
 * existe para provar o caminho inteiro sem código de jogo nenhum:
 *
 * - registra-se a cada subida, no endereço de `RECREIO_GAME_ORIGINS.teste.ws`;
 * - a cada conexão confere a sessão de jogo (assinatura e audiência), reivindica
 *   a posse do mundo se ainda não a tem e confere a entrada no Recreio;
 * - recupera o mundo da última fotografia mais o diário depois dela;
 * - cada soma vai para o diário, com id de fato determinístico, **antes** de ser
 *   aplicada e difundida;
 * - bate a cada `batimentoMs` com todos os mundos e o cursor da resposta
 *   anterior, tira quem teve a sessão encerrada e para o mundo cuja posse voltou
 *   `perdida`;
 * - para de escrever 3 s antes do prazo da posse, por conta própria;
 * - quando o mundo fica vazio, grava a fotografia e libera a posse (`vazio`);
 * - só aceita conexão vinda da origem do portal.
 *
 * Lê o mesmo ambiente do portal: `NEXT_PUBLIC_APP_URL`, `RECREIO_HOST_SECRETS`
 * e `RECREIO_GAME_ORIGINS` (do processo ou de `apps/recreio/.env.local`).
 * Nunca roda em produção: o jogo `teste` só existe com `RECREIO_JOGO_DE_TESTE=1`.
 *
 *   pnpm --filter @informach/recreio-app jogo-de-teste
 */
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deveSeCercar,
  ErroDoRecreio,
  ehErroDoRecreio,
  type MundoId,
  MundoIdSchema,
  type PerfilId,
  type SessaoDeJogoId,
} from "@informach/recreio";
import { sessaoVencida } from "@informach/recreio/contrato";
import {
  type ClienteDoHost,
  criarClienteDoHost,
  criarVerificadorDeSessao,
} from "@informach/recreio/host";
import { config as carregarEnv } from "dotenv";
import { type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import {
  type DoCliente,
  DoClienteSchema,
  type DoServidor,
  lerQuadro,
  PRAZO_PARA_ENTRAR_MS,
  QUADRO_MAX_BYTES,
} from "../../src/features/jogo-de-teste/protocolo";
import { JOGO_DE_TESTE_ID } from "../../src/features/jogos/catalogo";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
carregarEnv({ path: resolve(app, ".env.local"), quiet: true });

// --- Configuração ---

function mapaDoAmbiente(nome: string): Record<string, unknown> {
  try {
    const lido: unknown = JSON.parse(process.env[nome] ?? "{}");
    return typeof lido === "object" && lido !== null ? { ...lido } : {};
  } catch {
    return {};
  }
}

function configurar() {
  const portal = process.env.NEXT_PUBLIC_APP_URL;
  const segredo = mapaDoAmbiente("RECREIO_HOST_SECRETS")[JOGO_DE_TESTE_ID];
  const origens = z
    .object({ ws: z.url() })
    .safeParse(mapaDoAmbiente("RECREIO_GAME_ORIGINS")[JOGO_DE_TESTE_ID]);
  if (!portal || typeof segredo !== "string" || !origens.success)
    throw new Error(
      `Faltam NEXT_PUBLIC_APP_URL, RECREIO_HOST_SECRETS.${JOGO_DE_TESTE_ID} ou RECREIO_GAME_ORIGINS.${JOGO_DE_TESTE_ID}.ws`,
    );
  const publica = new URL(origens.data.ws);
  if (!publica.port) throw new Error("RECREIO_GAME_ORIGINS.teste.ws precisa dizer a porta");
  return {
    origemDoPortal: new URL(portal).origin,
    segredo,
    urlPublica: `${publica.protocol}//${publica.host}`,
    porta: Number(publica.port),
  };
}

const cfg = configurar();

function registrarNoLog(mensagem: string, dados: Record<string, unknown> = {}): void {
  // Só ids de mundo e códigos: nunca token, perfil ou apelido.
  process.stdout.write(
    `${JSON.stringify({ quando: new Date().toISOString(), mensagem, ...dados })}\n`,
  );
}

const host: ClienteDoHost = criarClienteDoHost({
  baseUrl: cfg.origemDoPortal,
  jogo: JOGO_DE_TESTE_ID,
  segredo: cfg.segredo,
});
const verificador = criarVerificadorDeSessao({
  emissor: cfg.origemDoPortal,
  jogo: JOGO_DE_TESTE_ID,
  jwksUrl: `${cfg.origemDoPortal}/api/sdk/v1/jwks`,
});

// --- Mundos ---

/** O que vai na fotografia: o contador e os últimos comandos aplicados. */
const EstadoSchema = z.strictObject({
  contador: z.number().int().nonnegative(),
  comandos: z.array(z.string()).max(64),
});
type Estado = z.infer<typeof EstadoSchema>;

type Jogador = {
  socket: WebSocket;
  sid: SessaoDeJogoId;
  perfilId: PerfilId;
  membroId: string;
  apelido: string;
  /** Prazo do token da sessão, em milissegundos. A renovação o empurra. */
  expiraEm: number;
};

type Mundo = {
  id: MundoId;
  cerca: number;
  revisao: number;
  diarioSeq: number;
  schemaVersion: number;
  estado: Estado;
  jogadores: Set<Jogador>;
  /**
   * Até quando esta instância se considera dona do mundo: conta da hora em que
   * o último batimento aceito foi **enviado**. Não se compara o relógio daqui
   * com o do Recreio.
   */
  prazo: number;
  /** As escritas do mundo, uma de cada vez: o diário não aceita buraco. */
  fila: Promise<void>;
  parado: boolean;
};

let batimentoMs = 10_000;
let posseTtlMs = 30_000;
let cursor: string | null = null;
const mundos = new Map<MundoId, Mundo>();
const carregando = new Map<MundoId, Promise<Mundo>>();
const hibernando = new Map<MundoId, Promise<void>>();

const texto = new TextEncoder();
const leitor = new TextDecoder("utf-8", { fatal: true });

function aplicar(estado: Estado, fatoId: string): void {
  estado.contador += 1;
  estado.comandos.push(fatoId);
  if (estado.comandos.length > 64) estado.comandos.shift();
}

function enviar(socket: WebSocket, quadro: DoServidor): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(quadro));
}

/** Diz por que a conexão acaba e fecha. */
function fim(socket: WebSocket, codigo: string, motivo?: string): void {
  enviar(socket, { t: "fim", codigo, ...(motivo === undefined ? {} : { motivo }) });
  socket.close(4000, codigo);
}

function difundir(mundo: Mundo): void {
  const quadro: DoServidor = {
    t: "estado",
    contador: mundo.estado.contador,
    presentes: [...mundo.jogadores].map((jogador) => ({
      id: jogador.membroId,
      apelido: jogador.apelido,
    })),
  };
  for (const jogador of mundo.jogadores) enviar(jogador.socket, quadro);
}

/** Larga o mundo na hora, sem escrever mais nada: a posse não é mais daqui. */
function pararMundo(mundo: Mundo, codigo: string): void {
  if (mundo.parado) return;
  mundo.parado = true;
  if (mundos.get(mundo.id) === mundo) mundos.delete(mundo.id);
  registrarNoLog("mundo parado", { mundo: mundo.id, codigo });
  for (const jogador of mundo.jogadores) fim(jogador.socket, codigo);
  mundo.jogadores.clear();
}

async function fotografar(mundo: Mundo, tipo: "checkpoint" | "hibernate"): Promise<void> {
  const { revisao } = await host.gravarFotografia({
    mundoId: mundo.id,
    cerca: mundo.cerca,
    revisaoEsperada: mundo.revisao,
    diarioSeq: mundo.diarioSeq,
    tick: mundo.estado.contador,
    schemaVersion: mundo.schemaVersion,
    tipo,
    bytes: texto.encode(JSON.stringify(mundo.estado)),
    resumo: { titulo: `Contador em ${mundo.estado.contador}`, subtitulo: "" },
  });
  mundo.revisao = revisao;
}

/** Mundo sem ninguém: fotografia que cobre o diário inteiro e posse liberada. */
function hibernarSeVazio(mundo: Mundo): void {
  if (mundo.parado || mundo.jogadores.size > 0) return;
  const tarefa = mundo.fila.then(async () => {
    // Alguém pode ter entrado enquanto a fila andava.
    if (mundo.parado || mundo.jogadores.size > 0) return;
    mundo.parado = true;
    if (mundos.get(mundo.id) === mundo) mundos.delete(mundo.id);
    try {
      if (deveSeCercar(mundo.prazo, Date.now())) return;
      await fotografar(mundo, "hibernate");
      await host.liberarPosse({ mundoId: mundo.id, cerca: mundo.cerca, motivo: "vazio" });
      registrarNoLog("mundo hibernado", { mundo: mundo.id, contador: mundo.estado.contador });
    } catch (erro) {
      // Sem a liberação a posse vence sozinha; o que foi para o diário está guardado.
      registrarNoLog("hibernação falhou", { mundo: mundo.id, codigo: codigoDe(erro) });
    }
  });
  mundo.fila = tarefa;
  // Quem abrir o mundo de novo espera a liberação terminar antes de reivindicar.
  const espera = tarefa.finally(() => {
    if (hibernando.get(mundo.id) === espera) hibernando.delete(mundo.id);
  });
  hibernando.set(mundo.id, espera);
}

/** Reivindica a posse e monta o mundo: última fotografia mais o diário depois dela. */
async function carregarMundo(id: MundoId): Promise<Mundo> {
  await hibernando.get(id);
  const enviadoEm = Date.now();
  const posse = await host.reivindicarPosse(id);
  let estado: Estado = { contador: 0, comandos: [] };
  if (posse.fotografia) {
    const foto = await host.lerFotografia({ mundoId: id, cerca: posse.cerca });
    if (!foto) throw new ErroDoRecreio("INDISPONIVEL");
    estado = EstadoSchema.parse(JSON.parse(leitor.decode(foto.bytes)));
  }
  const entradas = await host.lerDiario({
    mundoId: id,
    cerca: posse.cerca,
    apos: posse.fotografia?.diarioSeq ?? 0,
  });
  for (const entrada of entradas) aplicar(estado, entrada.fatoId);
  const mundo: Mundo = {
    id,
    cerca: posse.cerca,
    revisao: posse.revisao,
    diarioSeq: posse.diarioSeq,
    schemaVersion: posse.schemaVersion,
    estado,
    jogadores: new Set(),
    prazo: enviadoEm + posseTtlMs,
    fila: Promise.resolve(),
    parado: false,
  };
  mundos.set(id, mundo);
  registrarNoLog("mundo aberto", {
    mundo: id,
    cerca: posse.cerca,
    contador: estado.contador,
    doDiario: entradas.length,
    comFotografia: posse.fotografia !== null,
  });
  return mundo;
}

function abrirMundo(id: MundoId): Promise<Mundo> {
  const aberto = mundos.get(id);
  if (aberto && !aberto.parado) return Promise.resolve(aberto);
  let pendente = carregando.get(id);
  if (!pendente) {
    pendente = carregarMundo(id).finally(() => carregando.delete(id));
    carregando.set(id, pendente);
  }
  return pendente;
}

function codigoDe(erro: unknown): string {
  return ehErroDoRecreio(erro) ? erro.codigo : "INDISPONIVEL";
}

function tirar(mundo: Mundo, jogador: Jogador, codigo?: string, motivo?: string): void {
  if (!mundo.jogadores.delete(jogador)) return;
  if (codigo !== undefined) fim(jogador.socket, codigo, motivo);
  difundir(mundo);
  hibernarSeVazio(mundo);
}

async function entrar(
  socket: WebSocket,
  quadro: Extract<DoCliente, { t: "entrar" }>,
): Promise<{ mundo: Mundo; jogador: Jogador }> {
  // Assinatura, emissor, audiência (este jogo), tipo e prazo.
  const sessao = await verificador.verificar(quadro.token);
  const mundoId = MundoIdSchema.parse(quadro.mundoId);
  const mundo = await abrirMundo(mundoId);
  let entrada: Awaited<ReturnType<ClienteDoHost["verificarEntrada"]>>;
  try {
    // O Recreio confere de novo: sessão viva, daquele perfil, membro ativo do mundo.
    entrada = await host.verificarEntrada({
      mundoId,
      cerca: mundo.cerca,
      sid: sessao.sid,
      perfilId: sessao.perfilId,
    });
  } catch (erro) {
    if (ehErroDoRecreio(erro, "POSSE_PERDIDA")) pararMundo(mundo, "POSSE_PERDIDA");
    else hibernarSeVazio(mundo);
    throw erro;
  }
  if (mundo.parado) throw new ErroDoRecreio("POSSE_PERDIDA");
  // O mesmo membro entrando de novo (outra sessão, ou a conexão antiga que
  // ainda não caiu) toma o lugar da entrada anterior.
  for (const outro of [...mundo.jogadores])
    if (outro.membroId === entrada.membroId) {
      mundo.jogadores.delete(outro);
      fim(outro.socket, "SESSAO_ENCERRADA", "replaced");
    }
  const jogador: Jogador = {
    socket,
    sid: sessao.sid,
    perfilId: sessao.perfilId,
    membroId: entrada.membroId,
    apelido: entrada.apelido,
    expiraEm: sessao.expiraEm,
  };
  mundo.jogadores.add(jogador);
  difundir(mundo);
  return { mundo, jogador };
}

/** Soma 1: primeiro o diário, depois o estado e os clientes. */
function somar(mundo: Mundo, jogador: Jogador, comandoId: string): void {
  mundo.fila = mundo.fila.then(async () => {
    if (mundo.parado || !mundo.jogadores.has(jogador)) return;
    // O mesmo comando dá o mesmo id de fato: repetir não soma duas vezes.
    const fatoId = `soma:${jogador.membroId}:${comandoId}`;
    if (mundo.estado.comandos.includes(fatoId)) return;
    // Perto do prazo a instância para sozinha: o Recreio pode já ter dado o mundo a outra.
    if (deveSeCercar(mundo.prazo, Date.now())) return pararMundo(mundo, "POSSE_PERDIDA");
    const anexar = () =>
      host.anexarAoDiario({
        mundoId: mundo.id,
        cerca: mundo.cerca,
        entradas: [
          {
            seq: mundo.diarioSeq + 1,
            tick: mundo.estado.contador + 1,
            fatoId,
            bytes: texto.encode(JSON.stringify({ tipo: "soma" })),
          },
        ],
      });
    try {
      try {
        await anexar();
      } catch (erro) {
        if (!ehErroDoRecreio(erro, "CHECKPOINT_NECESSARIO")) throw erro;
        // Diário pendente no teto: uma fotografia o compacta, e a soma entra.
        await fotografar(mundo, "checkpoint");
        await anexar();
      }
    } catch (erro) {
      const codigo = codigoDe(erro);
      if (codigo === "POSSE_PERDIDA" || codigo === "POSSE_DE_OUTRA_INSTANCIA")
        pararMundo(mundo, "POSSE_PERDIDA");
      // Qualquer outra falha: a soma não entrou no diário, então não aconteceu.
      else registrarNoLog("soma recusada", { mundo: mundo.id, codigo });
      return;
    }
    if (mundo.parado) return;
    mundo.diarioSeq += 1;
    aplicar(mundo.estado, fatoId);
    difundir(mundo);
  });
}

async function renovar(mundo: Mundo, jogador: Jogador, token: string): Promise<void> {
  try {
    const sessao = await verificador.verificar(token);
    if (sessao.sid !== jogador.sid || sessao.perfilId !== jogador.perfilId)
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    jogador.expiraEm = sessao.expiraEm;
  } catch {
    tirar(mundo, jogador, "SESSAO_INVALIDA");
  }
}

// --- Batimento e autocerca ---

async function registrar(): Promise<void> {
  const registrada = await host.registrar({
    urlPublica: cfg.urlPublica,
    versao: "teste",
    capacidade: 20,
  });
  batimentoMs = registrada.batimentoMs;
  posseTtlMs = registrada.posseTtlMs;
  cursor = null;
  registrarNoLog("instância registrada", { instancia: registrada.instanciaId });
}

async function bater(): Promise<void> {
  const lista = [...mundos.values()].filter((mundo) => !mundo.parado);
  const enviadoEm = Date.now();
  let resposta: Awaited<ReturnType<ClienteDoHost["batimento"]>>;
  try {
    resposta = await host.batimento({
      mundos: lista.map((mundo) => ({
        mundoId: mundo.id,
        cerca: mundo.cerca,
        jogadores: mundo.jogadores.size,
        tick: mundo.estado.contador,
      })),
      cursor,
    });
  } catch (erro) {
    registrarNoLog("batimento falhou", { codigo: codigoDe(erro) });
    // O Recreio não conhece mais esta instância: larga tudo e registra de novo.
    if (ehErroDoRecreio(erro, "NAO_AUTENTICADO")) {
      for (const mundo of lista) pararMundo(mundo, "POSSE_PERDIDA");
      await registrar().catch(() => undefined);
    }
    // Sem resposta, o prazo local não anda, e a autocerca para os mundos a tempo.
    return;
  }
  cursor = resposta.cursor;
  const posses = new Map(resposta.posses.map((posse) => [posse.mundoId, posse.estado]));
  for (const mundo of lista) {
    if (mundo.parado) continue;
    if (posses.get(mundo.id) === "ok") mundo.prazo = enviadoEm + posseTtlMs;
    else pararMundo(mundo, "POSSE_PERDIDA");
  }
  const agora = Date.now();
  for (const mundo of [...mundos.values()])
    for (const jogador of [...mundo.jogadores]) {
      const encerrada = resposta.sessoesEncerradas.find((sessao) => sessao.sid === jogador.sid);
      if (encerrada) tirar(mundo, jogador, "SESSAO_ENCERRADA", encerrada.motivo);
      // Token vencido sem renovação: a sessão não vale mais aqui.
      else if (sessaoVencida(jogador.expiraEm, agora)) tirar(mundo, jogador, "SESSAO_INVALIDA");
    }
}

function cercar(): void {
  const agora = Date.now();
  for (const mundo of [...mundos.values()])
    if (deveSeCercar(mundo.prazo, agora)) pararMundo(mundo, "POSSE_PERDIDA");
}

// --- Conexões ---

const http = createServer((pedido, resposta) => {
  if (pedido.method === "GET" && pedido.url === "/saude") {
    resposta.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    resposta.end(JSON.stringify({ ok: true, mundos: mundos.size }));
    return;
  }
  resposta.writeHead(404).end();
});
const wss = new WebSocketServer({ noServer: true, maxPayload: QUADRO_MAX_BYTES });

http.on("upgrade", (pedido, soquete, cabeca) => {
  // Só o portal abre conexão: a origem é a do documento que hospeda o jogo.
  if (pedido.headers.origin !== cfg.origemDoPortal) {
    soquete.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  wss.handleUpgrade(pedido, soquete, cabeca, (socket) => wss.emit("connection", socket));
});

wss.on("connection", (socket: WebSocket) => {
  let dentro: { mundo: Mundo; jogador: Jogador } | null = null;
  let entrando = false;
  const prazo = setTimeout(() => fim(socket, "SESSAO_INVALIDA"), PRAZO_PARA_ENTRAR_MS);

  socket.on("message", (dados, binario) => {
    const quadro = binario ? null : lerQuadro(DoClienteSchema, dados.toString());
    if (!quadro) return fim(socket, "ENTRADA_INVALIDA");
    if (!dentro) {
      // O primeiro quadro é a entrada, uma vez só.
      if (quadro.t !== "entrar" || entrando) return fim(socket, "ENTRADA_INVALIDA");
      entrando = true;
      clearTimeout(prazo);
      entrar(socket, quadro).then(
        (entrou) => {
          dentro = entrou;
          // A conexão caiu enquanto o Recreio respondia.
          if (socket.readyState !== socket.OPEN) tirar(entrou.mundo, entrou.jogador);
        },
        (erro: unknown) => {
          const motivo = ehErroDoRecreio(erro) ? erro.detalhe.motivo : undefined;
          fim(socket, codigoDe(erro), typeof motivo === "string" ? motivo : undefined);
        },
      );
      return;
    }
    if (quadro.t === "somar") somar(dentro.mundo, dentro.jogador, quadro.id);
    else if (quadro.t === "renovar") void renovar(dentro.mundo, dentro.jogador, quadro.token);
    else fim(socket, "ENTRADA_INVALIDA");
  });

  socket.on("close", () => {
    clearTimeout(prazo);
    if (dentro) tirar(dentro.mundo, dentro.jogador);
  });
  socket.on("error", () => socket.terminate());
});

// --- Subida e descida ---

async function subir(): Promise<void> {
  // O portal pode ainda estar subindo: tenta por um minuto antes de desistir.
  for (let tentativa = 1; ; tentativa++) {
    try {
      await registrar();
      break;
    } catch (erro) {
      if (tentativa >= 60 || (ehErroDoRecreio(erro) && erro.codigo !== "INDISPONIVEL")) throw erro;
      await new Promise((resolver) => setTimeout(resolver, 1_000));
    }
  }
  // Um batimento por vez: o cursor de um é a resposta do anterior.
  let batendo = false;
  setInterval(() => {
    if (batendo) return;
    batendo = true;
    void bater().finally(() => {
      batendo = false;
    });
  }, batimentoMs);
  setInterval(cercar, 1_000);
  await new Promise<void>((resolver) => http.listen(cfg.porta, resolver));
  registrarNoLog("pronto", { porta: cfg.porta, portal: cfg.origemDoPortal });
}

/** Descida ordenada: avisa o Recreio, guarda cada mundo e solta as posses. */
async function descer(): Promise<void> {
  await host.drenar().catch(() => undefined);
  for (const mundo of [...mundos.values()]) {
    await mundo.fila.catch(() => undefined);
    if (mundo.parado) continue;
    try {
      await fotografar(mundo, "hibernate");
      await host.liberarPosse({ mundoId: mundo.id, cerca: mundo.cerca, motivo: "drenagem" });
    } catch (erro) {
      registrarNoLog("drenagem falhou", { mundo: mundo.id, codigo: codigoDe(erro) });
    }
    // Passageiro para o cliente: ele abre o mundo de novo e acha outra instância.
    pararMundo(mundo, "INDISPONIVEL");
  }
}

let descendo = false;
function iniciarDescida(): void {
  if (descendo) return;
  descendo = true;
  void descer().finally(() => process.exit(0));
}
for (const sinal of ["SIGINT", "SIGTERM"] as const) process.on(sinal, iniciarDescida);
// Quem iniciou o processo com um canal (o E2E) pede a descida por mensagem: no
// Windows um sinal encerra o processo na hora, sem chance de descer em ordem.
process.on("message", (mensagem) => {
  if (mensagem === "descer") iniciarDescida();
});

subir().catch((erro: unknown) => {
  registrarNoLog("não subiu", { codigo: codigoDe(erro) });
  process.exit(1);
});
