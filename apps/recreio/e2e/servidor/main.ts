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
import { type RenovacaoDeVisita, sessaoVencida } from "@informach/recreio/contrato";
import {
  type ClienteDoHost,
  type ClienteDoHostComVisitas,
  criarClienteDoHost,
  criarPermissaoDeVisita,
  criarVerificadorDeSessao,
  type PermissaoDeVisita,
  type PresencaDaConexao,
} from "@informach/recreio/host";
import { config as carregarEnv } from "dotenv";
import { type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import {
  type DoCliente,
  DoClienteSchema,
  type DoServidor,
  FINS_PASSAGEIROS,
  lerQuadro,
  PRAZO_PARA_ENTRAR_MS,
  QUADRO_MAX_BYTES,
} from "../../src/features/jogo-de-teste/protocolo";
import { JOGO_DE_TESTE, JOGO_DE_TESTE_ID } from "../../src/features/jogos/catalogo";
import { PresencasDaInstancia } from "./presencas";
import { SessoesVisitantesDaInstancia } from "./visitas";

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

function clienteDoPortal(): ClienteDoHostComVisitas {
  return criarClienteDoHost({
    baseUrl: cfg.origemDoPortal,
    jogo: JOGO_DE_TESTE_ID,
    segredo: cfg.segredo,
    fotografiaMaxBytes: JOGO_DE_TESTE.limites.fotografiaMaxBytes,
    diarioMaxBytes: JOGO_DE_TESTE.limites.diarioPendenteMaxBytes,
  });
}
function produtorDePresencas(cliente: ClienteDoHostComVisitas): PresencasDaInstancia {
  return new PresencasDaInstancia(cliente, (mundo, erro) =>
    registrarNoLog("presença pendente", { mundo, codigo: codigoDe(erro) }),
  );
}
let host = clienteDoPortal();
let presencas = produtorDePresencas(host);
const sessoesVisitantes = new SessoesVisitantesDaInstancia((mundo, erro) =>
  registrarNoLog("encerramento de visita pendente", { mundo, codigo: codigoDe(erro) }),
);
const sincronizacoesDePresenca = new WeakSet<PresencasDaInstancia>();

function sincronizarPresencas(apenasEncerramentos = false): void {
  const geracao = presencas;
  const cliente = host;
  if (sincronizacoesDePresenca.has(geracao)) return;
  sincronizacoesDePresenca.add(geracao);
  const operacao = apenasEncerramentos
    ? geracao.recuperarEncerramentos()
    : geracao.sincronizar().then(() => renovarVisitas(cliente));
  void operacao
    .catch((erro: unknown) =>
      registrarNoLog("sincronização de presenças falhou", { codigo: codigoDe(erro) }),
    )
    .finally(() => sincronizacoesDePresenca.delete(geracao));
}
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

type ParticipacaoVisitante = {
  tipo: "visita";
  pedido: RenovacaoDeVisita;
  presencaId: string;
  cliente: ClienteDoHostComVisitas;
  permissao: PermissaoDeVisita;
  aviso: boolean | null;
};
type Jogador = {
  socket: WebSocket;
  sid: SessaoDeJogoId;
  perfilId: PerfilId;
  participacao: { tipo: "membro"; membroId: string } | ParticipacaoVisitante;
  visitas: boolean;
  presenca: PresencaDaConexao | null;
  apelido: string;
  /** Prazo do token da sessão, em milissegundos. A renovação o empurra. */
  expiraEm: number;
  pausado: boolean;
  checkpoint: { id: string; revisao: number; diarioSeq: number; confirmado: boolean } | null;
  salvamento: boolean;
  finalizacao: Promise<boolean> | null;
  provaFinal: { revisao: number; diarioSeq: number } | null;
  fimDaMargem: number | null;
  esperaDesconexao: ReturnType<typeof setTimeout> | null;
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
let visitasDaInstancia = false;
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
    presentes: [...mundo.jogadores]
      .filter((jogador) => jogador.socket.readyState === jogador.socket.OPEN)
      .map((jogador) => ({
        id:
          jogador.participacao.tipo === "membro"
            ? jogador.participacao.membroId
            : jogador.participacao.pedido.sessaoDeVisitaId,
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
  for (const jogador of mundo.jogadores) {
    fecharVisita(jogador, "autoridade_perdida");
    void presencas.fechar(jogador.presenca);
    if (jogador.esperaDesconexao) clearTimeout(jogador.esperaDesconexao);
    fim(jogador.socket, codigo);
  }
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

function removerJogador(mundo: Mundo, jogador: Jogador): void {
  if (!mundo.jogadores.delete(jogador)) return;
  fecharVisita(
    jogador,
    jogador.participacao.tipo === "visita" && jogador.participacao.permissao.estado === "encerrada"
      ? "autoridade_perdida"
      : "sair",
  );
  void presencas.fechar(jogador.presenca);
  if (jogador.esperaDesconexao) clearTimeout(jogador.esperaDesconexao);
  difundir(mundo);
  hibernarSeVazio(mundo);
}

function tirar(mundo: Mundo, jogador: Jogador, codigo?: string, motivo?: string): void {
  if (!mundo.jogadores.has(jogador)) return;
  if (codigo !== undefined && jogador.participacao.tipo === "visita")
    jogador.participacao.permissao.encerrar();
  // A visita termina quando o anfitrião sai, mesmo durante a margem de salvamento.
  void presencas.fechar(jogador.presenca);
  const fimElegivel =
    codigo === undefined ||
    codigo === "SESSAO_INVALIDA" ||
    (codigo === "SESSAO_ENCERRADA" && ["expired", "access_lost", "left"].includes(motivo ?? ""));
  if (jogador.salvamento && fimElegivel && !mundo.parado) {
    if (codigo !== undefined) {
      void finalizar(mundo, jogador);
      fim(jogador.socket, codigo, motivo);
    } else if (!jogador.esperaDesconexao && !jogador.finalizacao) {
      // Reconectar o mesmo SID a tempo cancela esta espera, sem outra concessão.
      jogador.esperaDesconexao = setTimeout(() => {
        jogador.esperaDesconexao = null;
        if (mundo.jogadores.has(jogador)) void finalizar(mundo, jogador);
      }, 5000);
      difundir(mundo);
    }
    return;
  }
  if (codigo !== undefined) fim(jogador.socket, codigo, motivo);
  removerJogador(mundo, jogador);
}

/** Congela antes de enfileirar; o prefixo admitido é persistido antes da prova final. */
function finalizar(mundo: Mundo, jogador: Jogador): Promise<boolean> {
  void presencas.fechar(jogador.presenca);
  if (jogador.finalizacao) return jogador.finalizacao;
  if (!jogador.salvamento || mundo.parado || !mundo.jogadores.has(jogador))
    return Promise.resolve(false);
  if (jogador.fimDaMargem !== null && Date.now() >= jogador.fimDaMargem) {
    removerJogador(mundo, jogador);
    return Promise.resolve(false);
  }
  jogador.pausado = true;
  if (jogador.esperaDesconexao) clearTimeout(jogador.esperaDesconexao);
  jogador.esperaDesconexao = null;
  jogador.fimDaMargem ??= Math.min(Date.now() + 30_000, jogador.expiraEm + 30_000);
  jogador.esperaDesconexao = setTimeout(
    () => removerJogador(mundo, jogador),
    Math.max(0, jogador.fimDaMargem - Date.now()),
  );
  const pedido = mundo.fila.then(async () => {
    if (mundo.parado || !mundo.jogadores.has(jogador)) return false;
    const base = { mundoId: mundo.id, sid: jogador.sid, cerca: mundo.cerca };
    try {
      const preparada = await host.salvarSessao({ ...base, operacao: "preparar" });
      if (preparada.estado === "ready") {
        if (!jogador.provaFinal) {
          await fotografar(mundo, "checkpoint");
          jogador.provaFinal = { revisao: mundo.revisao, diarioSeq: mundo.diarioSeq };
        }
        const confirmar = () => {
          if (!jogador.provaFinal) throw new ErroDoRecreio("INDISPONIVEL");
          return host.salvarSessao({ ...base, ...jogador.provaFinal, operacao: "concluir" });
        };
        try {
          const resultado = await confirmar();
          if (resultado.estado !== "completed") throw new ErroDoRecreio("INDISPONIVEL");
        } catch (erro) {
          if (ehErroDoRecreio(erro, "CHECKPOINT_NECESSARIO")) {
            // Só uma negativa explícita permite fotografar de novo. Uma resposta
            // incerta conserva a prova que pode já ter sido confirmada.
            await fotografar(mundo, "checkpoint");
            jogador.provaFinal = { revisao: mundo.revisao, diarioSeq: mundo.diarioSeq };
          } else if (!ehErroDoRecreio(erro, "INDISPONIVEL")) throw erro;
          const recuperada = await confirmar();
          if (recuperada.estado !== "completed") throw new ErroDoRecreio("INDISPONIVEL");
        }
      } else if (preparada.estado !== "completed") throw new ErroDoRecreio("INDISPONIVEL");
      enviar(jogador.socket, { t: "salvamento", confirmado: true });
      removerJogador(mundo, jogador);
      return true;
    } catch (erro) {
      registrarNoLog("salvamento final recusado", { mundo: mundo.id, codigo: codigoDe(erro) });
      enviar(jogador.socket, { t: "salvamento", confirmado: false });
      const restante = Math.max(0, (jogador.fimDaMargem ?? Date.now()) - Date.now());
      if (jogador.esperaDesconexao) clearTimeout(jogador.esperaDesconexao);
      jogador.esperaDesconexao = setTimeout(() => removerJogador(mundo, jogador), restante);
      return false;
    }
  });
  mundo.fila = pedido.then(() => undefined);
  const tarefa = pedido.finally(() => {
    if (jogador.finalizacao === tarefa) jogador.finalizacao = null;
  });
  jogador.finalizacao = tarefa;
  return tarefa;
}

async function entrar(
  socket: WebSocket,
  quadro: Extract<DoCliente, { t: "entrar" }>,
): Promise<{ mundo: Mundo; jogador: Jogador }> {
  if (descendo) throw new ErroDoRecreio("INDISPONIVEL");
  // Assinatura, emissor, audiência (este jogo), tipo e prazo.
  const sessao = await verificador.verificar(quadro.token);
  const mundoId = MundoIdSchema.parse(quadro.mundoId);
  // Visitante só entra no mundo que já tem o anfitrião conectado nesta instância.
  const mundo = quadro.visita ? mundos.get(mundoId) : await abrirMundo(mundoId);
  if (!mundo || mundo.parado || deveSeCercar(mundo.prazo, Date.now()))
    throw new ErroDoRecreio("POSSE_PERDIDA");
  if (quadro.visita && (!visitasDaInstancia || quadro.visitas !== true))
    throw new ErroDoRecreio("SEM_PERMISSAO");
  for (const outro of mundo.jogadores)
    if (outro.perfilId === sessao.perfilId && (outro.finalizacao || outro.fimDaMargem !== null))
      throw new ErroDoRecreio("CHECKPOINT_PENDENTE");
  let participacao: Jogador["participacao"];
  let apelido: string;
  let pedidoDeVisita: RenovacaoDeVisita | null = null;
  try {
    const base = { mundoId, cerca: mundo.cerca, sid: sessao.sid, perfilId: sessao.perfilId };
    if (quadro.visita) {
      const pedido = {
        ...base,
        visitaId: quadro.visita.id,
        sessaoDeVisitaId: quadro.visita.sessaoId,
      };
      const cliente = host;
      sessoesVisitantes.reservar(pedido, cliente);
      pedidoDeVisita = pedido;
      const enviadoEm = performance.now();
      const entrada = await cliente.verificarEntradaDeVisita(pedido);
      const permissao = criarPermissaoDeVisita(
        entrada,
        { enviadoEm, recebidoEm: performance.now() },
        {
          agora: () => performance.now(),
          anfitriaoConectado: (id) => anfitriaoConectado(mundo, id),
        },
      );
      if (!permissao.podeJogar() || socket.readyState !== socket.OPEN)
        throw new ErroDoRecreio("SESSAO_ENCERRADA");
      participacao = {
        tipo: "visita",
        pedido,
        presencaId: entrada.presencaDoAnfitriaoId,
        cliente,
        permissao,
        aviso: null,
      };
      apelido = entrada.apelido;
    } else {
      const entrada = await host.verificarEntrada(base);
      participacao = { tipo: "membro", membroId: entrada.membroId };
      apelido = entrada.apelido;
    }
    if (mundo.parado || descendo) throw new ErroDoRecreio("POSSE_PERDIDA");
    for (const outro of mundo.jogadores)
      if (outro.perfilId === sessao.perfilId && (outro.finalizacao || outro.fimDaMargem !== null))
        throw new ErroDoRecreio("CHECKPOINT_PENDENTE");
    if (pedidoDeVisita) sessoesVisitantes.admitir(pedidoDeVisita.sessaoDeVisitaId);
  } catch (erro) {
    if (pedidoDeVisita)
      sessoesVisitantes.encerrar(pedidoDeVisita.sessaoDeVisitaId, "entrada_nao_concluida");
    if (ehErroDoRecreio(erro, "POSSE_PERDIDA")) pararMundo(mundo, "POSSE_PERDIDA");
    else hibernarSeVazio(mundo);
    throw erro;
  }
  // O mesmo perfil entrando de novo ocupa uma única conexão, conservando o
  // tipo verdadeiro de participação e o contrato de checkpoint do SID.
  for (const outro of [...mundo.jogadores])
    if (outro.perfilId === sessao.perfilId) {
      if (outro.esperaDesconexao) clearTimeout(outro.esperaDesconexao);
      void presencas.fechar(outro.presenca);
      mundo.jogadores.delete(outro);
      fim(outro.socket, "SESSAO_ENCERRADA", "replaced");
    }
  const jogador: Jogador = {
    socket,
    sid: sessao.sid,
    perfilId: sessao.perfilId,
    participacao,
    visitas: participacao.tipo === "membro" && visitasDaInstancia && quadro.visitas === true,
    presenca: null,
    apelido,
    expiraEm: sessao.expiraEm,
    pausado: false,
    checkpoint: null,
    salvamento: quadro.salvamento === true,
    finalizacao: null,
    provaFinal: null,
    fimDaMargem: null,
    esperaDesconexao: null,
  };
  mundo.jogadores.add(jogador);
  prepararPresenca(mundo, jogador);
  difundir(mundo);
  informarVisita(jogador);
  return { mundo, jogador };
}

function anfitriaoConectado(mundo: Mundo, presencaId: string): boolean {
  return (
    !descendo &&
    !mundo.parado &&
    [...mundo.jogadores].some(
      (jogador) =>
        jogador.participacao.tipo === "membro" &&
        jogador.presenca?.recibo?.presencaId === presencaId &&
        jogador.presenca.renovacao() !== null,
    )
  );
}

function fecharVisita(jogador: Jogador, motivo: "sair" | "autoridade_perdida"): void {
  if (jogador.participacao.tipo !== "visita") return;
  jogador.participacao.permissao.encerrar();
  sessoesVisitantes.encerrar(jogador.participacao.pedido.sessaoDeVisitaId, motivo);
}

function informarVisita(jogador: Jogador): void {
  const p = jogador.participacao;
  if (p.tipo !== "visita") return;
  const vigente = p.permissao.podeJogar();
  if (p.aviso === vigente) return;
  p.aviso = vigente;
  enviar(jogador.socket, { t: "visita", estado: vigente ? "ativa" : "pausada" });
}

function prepararPresenca(mundo: Mundo, jogador: Jogador): void {
  if (
    descendo ||
    mundo.parado ||
    !jogador.visitas ||
    jogador.pausado ||
    jogador.finalizacao ||
    jogador.fimDaMargem !== null ||
    jogador.socket.readyState !== jogador.socket.OPEN ||
    (jogador.presenca && !jogador.presenca.concluida)
  )
    return;
  jogador.presenca = presencas.abrir(
    {
      mundoId: mundo.id,
      cerca: mundo.cerca,
      sid: jogador.sid,
      perfilId: jogador.perfilId,
      chaveDeEntrada: crypto.randomUUID(),
    },
    () =>
      !descendo &&
      !mundo.parado &&
      mundo.jogadores.has(jogador) &&
      jogador.socket.readyState === jogador.socket.OPEN &&
      !jogador.finalizacao &&
      jogador.fimDaMargem === null,
  );
}

/** Soma 1: primeiro o diário, depois o estado e os clientes. */
function somar(mundo: Mundo, jogador: Jogador, comandoId: string): void {
  // A pausa corta comandos novos; os já admitidos terminam antes da fotografia na fila.
  if (
    jogador.pausado ||
    (jogador.participacao.tipo === "visita" && !jogador.participacao.permissao.podeJogar())
  )
    return;
  mundo.fila = mundo.fila.then(async () => {
    if (mundo.parado || !mundo.jogadores.has(jogador)) return;
    if (jogador.participacao.tipo === "visita" && !jogador.participacao.permissao.podeJogar())
      return;
    // O mesmo comando dá o mesmo id de fato: repetir não soma duas vezes.
    const p = jogador.participacao;
    const fatoId =
      p.tipo === "membro"
        ? `soma:${p.membroId}:${comandoId}`
        : `soma-visita:${p.pedido.sessaoDeVisitaId}:${comandoId}`;
    if (mundo.estado.comandos.includes(fatoId)) return;
    // Perto do prazo a instância para sozinha: o Recreio pode já ter dado o mundo a outra.
    if (deveSeCercar(mundo.prazo, Date.now())) return pararMundo(mundo, "POSSE_PERDIDA");
    const anexar = () => {
      if (p.tipo === "visita" && !p.permissao.podeJogar())
        throw new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "access_lost" });
      return host.anexarAoDiario({
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
    };
    try {
      await conferirJogador(mundo, jogador);
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
      else if (ehErroDoRecreio(erro) && !FINS_PASSAGEIROS.includes(codigo))
        tirar(mundo, jogador, codigo);
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

async function conferirJogador(
  mundo: Mundo,
  jogador: Jogador,
  revalidarVisita = false,
): Promise<void> {
  if (sessaoVencida(jogador.expiraEm, Date.now())) throw new ErroDoRecreio("SESSAO_INVALIDA");
  const p = jogador.participacao;
  if (p.tipo === "visita") {
    if (revalidarVisita) {
      const enviadoEm = performance.now();
      const entrada = await p.cliente.verificarEntradaDeVisita(p.pedido);
      if (entrada.presencaDoAnfitriaoId !== p.presencaId) {
        p.permissao.encerrar();
        throw new ErroDoRecreio("SEM_PERMISSAO");
      }
      p.permissao.renovar(
        {
          sessaoDeVisitaId: entrada.sessaoDeVisitaId,
          estado: "ok",
          permissaoAte: entrada.permissaoAte,
          agora: entrada.agora,
        },
        { enviadoEm, recebidoEm: performance.now() },
      );
    }
    if (!p.permissao.podeJogar()) throw new ErroDoRecreio("INDISPONIVEL");
    return;
  }
  await host.verificarEntrada({
    mundoId: mundo.id,
    cerca: mundo.cerca,
    sid: jogador.sid,
    perfilId: jogador.perfilId,
  });
}

/** Fotografia e recibo na mesma fila dos comandos, sem confiar no booleano do navegador. */
function checkpoint(mundo: Mundo, jogador: Jogador, id: string): void {
  jogador.pausado = true;
  mundo.fila = mundo.fila.then(async () => {
    if (mundo.parado || !mundo.jogadores.has(jogador)) return;
    try {
      const anterior = jogador.checkpoint;
      if (anterior?.id === id && anterior.confirmado) {
        enviar(jogador.socket, { t: "checkpoint", id, confirmado: true });
        return;
      }
      if (anterior?.id !== id) {
        // Visitante já admitido só recebe o caminho de persistência. A API do
        // checkpoint relê a prova histórica e nunca concede gameplay por isso.
        if (jogador.participacao.tipo !== "visita") await conferirJogador(mundo, jogador);
        await fotografar(mundo, "checkpoint");
        jogador.checkpoint = {
          id,
          revisao: mundo.revisao,
          diarioSeq: mundo.diarioSeq,
          confirmado: false,
        };
      }
      const confirmar = () => {
        const prova = jogador.checkpoint;
        if (!prova) throw new ErroDoRecreio("INDISPONIVEL");
        return host.confirmarCheckpoint({
          mundoId: mundo.id,
          id,
          sid: jogador.sid,
          cerca: mundo.cerca,
          confirmado: true,
          revisao: prova.revisao,
          diarioSeq: prova.diarioSeq,
        });
      };
      let resultado: Awaited<ReturnType<typeof confirmar>>;
      try {
        resultado = await confirmar();
      } catch (erro) {
        if (!ehErroDoRecreio(erro, "CHECKPOINT_NECESSARIO")) throw erro;
        // Outros moradores podem ter avançado o diário desde uma tentativa perdida.
        // Uma recusa explícita permite atualizar a prova; uma resposta incerta, não.
        if (jogador.participacao.tipo !== "visita") await conferirJogador(mundo, jogador);
        await fotografar(mundo, "checkpoint");
        jogador.checkpoint = {
          id,
          revisao: mundo.revisao,
          diarioSeq: mundo.diarioSeq,
          confirmado: false,
        };
        resultado = await confirmar();
      }
      if (jogador.checkpoint) jogador.checkpoint.confirmado = resultado.pausada;
      enviar(jogador.socket, { t: "checkpoint", id, confirmado: resultado.pausada });
    } catch (erro) {
      // A resposta pode ter se perdido depois do commit. Guardar a prova permite
      // repetir exatamente o recibo; somente o controle do Recreio libera o cliente.
      registrarNoLog("checkpoint recusado", { mundo: mundo.id, codigo: codigoDe(erro) });
      enviar(jogador.socket, { t: "checkpoint", id, confirmado: false });
    }
  });
}

function retomar(mundo: Mundo, jogador: Jogador): void {
  mundo.fila = mundo.fila.then(async () => {
    if (mundo.parado || !mundo.jogadores.has(jogador)) return;
    try {
      // Uma mensagem do cliente nunca derruba a barreira persistida da sessão.
      await conferirJogador(mundo, jogador, true);
      jogador.pausado = false;
      jogador.checkpoint = null;
      enviar(jogador.socket, { t: "retomado" });
      informarVisita(jogador);
      difundir(mundo);
    } catch (erro) {
      if (ehErroDoRecreio(erro) && !FINS_PASSAGEIROS.includes(erro.codigo))
        tirar(mundo, jogador, erro.codigo);
    }
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

async function renovarVisitas(cliente: ClienteDoHostComVisitas): Promise<void> {
  const atuais: { mundo: Mundo; jogador: Jogador; p: ParticipacaoVisitante }[] = [];
  for (const mundo of mundos.values())
    for (const jogador of mundo.jogadores) {
      const p = jogador.participacao;
      if (
        mundo.parado ||
        p.tipo !== "visita" ||
        p.cliente !== cliente ||
        jogador.pausado ||
        jogador.finalizacao ||
        jogador.fimDaMargem !== null ||
        jogador.socket.readyState !== jogador.socket.OPEN
      )
        continue;
      if (p.permissao.estado === "encerrada") {
        tirar(mundo, jogador, "SESSAO_ENCERRADA", "access_lost");
        continue;
      }
      atuais.push({ mundo, jogador, p });
    }
  for (let inicio = 0; inicio < atuais.length; inicio += 64) {
    const lote = atuais.slice(inicio, inicio + 64),
      enviadoEm = performance.now();
    try {
      const resultado = await cliente.renovarVisitas(lote.map(({ p }) => p.pedido));
      const recebidoEm = performance.now();
      for (const [indice, recibo] of resultado.visitas.entries()) {
        const item = lote[indice];
        if (
          !item ||
          item.mundo.parado ||
          !item.mundo.jogadores.has(item.jogador) ||
          item.jogador.pausado ||
          item.jogador.finalizacao ||
          item.jogador.fimDaMargem !== null
        )
          continue;
        item.p.permissao.renovar(recibo, { enviadoEm, recebidoEm });
        informarVisita(item.jogador);
        if (item.p.permissao.estado === "encerrada")
          tirar(item.mundo, item.jogador, "SESSAO_ENCERRADA", "access_lost");
      }
    } catch (erro) {
      for (const item of lote) {
        item.p.permissao.suspender();
        informarVisita(item.jogador);
      }
      const primeiro = lote[0];
      if (primeiro)
        registrarNoLog("renovação de visita incerta", {
          mundo: primeiro.mundo.id,
          codigo: codigoDe(erro),
        });
    }
  }
}

async function registrar(): Promise<void> {
  // Um cliente por registro: recibos antigos nunca passam a usar a identidade
  // de outra instância. Rejeição do registro conserva a geração anterior.
  const cliente = clienteDoPortal();
  const registrada = await cliente.registrar({
    urlPublica: cfg.urlPublica,
    versao: "teste",
    capacidade: 20,
    suportaVisitas: true,
  });
  host = cliente;
  presencas = produtorDePresencas(cliente);
  batimentoMs = registrada.batimentoMs;
  posseTtlMs = registrada.posseTtlMs;
  visitasDaInstancia = registrada.visitas === true;
  cursor = null;
  registrarNoLog("instância registrada", { instancia: registrada.instanciaId });
}

async function bater(): Promise<void> {
  void sessoesVisitantes.processar();
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
    sincronizarPresencas(true);
    // O Recreio não conhece mais esta instância: larga tudo e registra de novo.
    if (ehErroDoRecreio(erro, "NAO_AUTENTICADO")) {
      for (const mundo of lista) pararMundo(mundo, "POSSE_PERDIDA");
      void presencas.fecharTodas();
      sessoesVisitantes.aposentarCliente(host);
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
  if (!descendo) {
    for (const mundo of mundos.values())
      for (const jogador of mundo.jogadores) prepararPresenca(mundo, jogador);
    // A rede de presenças não pode atrasar o próximo batimento da posse.
    sincronizarPresencas();
  }
}

function cercar(): void {
  const agora = Date.now();
  for (const mundo of [...mundos.values()]) {
    if (deveSeCercar(mundo.prazo, agora)) pararMundo(mundo, "POSSE_PERDIDA");
    else
      for (const jogador of [...mundo.jogadores]) {
        if (jogador.participacao.tipo !== "visita") continue;
        informarVisita(jogador);
        if (jogador.participacao.permissao.estado === "encerrada")
          tirar(mundo, jogador, "SESSAO_ENCERRADA", "access_lost");
      }
  }
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
    else if (quadro.t === "checkpoint") checkpoint(dentro.mundo, dentro.jogador, quadro.id);
    else if (quadro.t === "retomar") retomar(dentro.mundo, dentro.jogador);
    else if (quadro.t === "salvar") void finalizar(dentro.mundo, dentro.jogador);
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
  const fechandoPresencas = presencas.fecharTodas();
  for (const mundo of mundos.values())
    for (const jogador of mundo.jogadores) {
      jogador.pausado = true;
      if (jogador.participacao.tipo === "visita") jogador.participacao.permissao.encerrar();
    }
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
  await fechandoPresencas;
  sessoesVisitantes.encerrarTodas();
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
