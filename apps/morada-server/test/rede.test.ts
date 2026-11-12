import { aplicarMudancas, type VisaoDoCliente } from "@informach/morada-sim";
import {
  FECHAMENTO,
  type MensagemDoCliente,
  type MensagemDoServidor,
  SUBPROTOCOLO,
  VERSAO_DO_PROTOCOLO,
} from "@informach/morada-sim/protocolo";
import { ErroDoRecreio } from "@informach/recreio";
import type { ClienteDoHost } from "@informach/recreio/host";
import { criarEmissorDeTeste, criarPlataformaFalsa } from "@informach/recreio/testing";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { criarInstancia } from "../src/instancia";
import { criarServidor, type Servidor } from "../src/servidor";

/**
 * O servidor de verdade, em uma porta de verdade, com clientes WebSocket de
 * verdade. Aqui o tempo é o do relógio: os testes são curtos de propósito.
 */

const ORIGEM = "http://localhost:3009";
const abertos: Servidor[] = [];

afterEach(async () => {
  for (const servidor of abertos.splice(0)) await servidor.encerrar();
});

/**
 * O cliente das instâncias com dois interruptores, para o Recreio falhar como
 * falha pelo cliente HTTP de verdade: sem resposta (`INDISPONIVEL`) ou sem
 * conhecer mais a instância (`NAO_AUTENTICADO` no batimento).
 */
type Recreio = { foraDoAr: boolean; esqueceuAInstancia: boolean; registros: number };

function hostComFalhas(real: ClienteDoHost, recreio: Recreio, batimentoMs?: number): ClienteDoHost {
  const host = { ...real };
  for (const nome of Object.keys(real) as (keyof ClienteDoHost)[]) {
    // biome-ignore lint/suspicious/noExplicitAny: repasse genérico dos métodos do cliente.
    (host as any)[nome] = async (...args: unknown[]) => {
      if (recreio.foraDoAr) throw new ErroDoRecreio("INDISPONIVEL");
      if (nome === "batimento" && recreio.esqueceuAInstancia) {
        throw new ErroDoRecreio("NAO_AUTENTICADO");
      }
      // biome-ignore lint/suspicious/noExplicitAny: repasse genérico dos métodos do cliente.
      const resposta = await (real as any)[nome](...args);
      if (nome !== "registrar") return resposta;
      recreio.registros++;
      recreio.esqueceuAInstancia = false;
      return batimentoMs === undefined ? resposta : { ...resposta, batimentoMs };
    };
  }
  return host;
}

async function subir(
  opcoes: {
    pingMs?: number;
    /** O Recreio começa fora do ar. */
    foraDoAr?: boolean;
    batimentoMs?: number;
    exigirOrigem?: boolean;
  } = {},
) {
  const plataforma = criarPlataformaFalsa({ inicio: Date.now() });
  const recreio = await criarEmissorDeTeste();
  const doRecreio: Recreio = {
    foraDoAr: opcoes.foraDoAr ?? false,
    esqueceuAInstancia: false,
    registros: 0,
  };
  /** Tudo o que a instância e o servidor registraram ou deram como erro. */
  const registros: unknown[] = [];
  const base = Date.now();
  const inicio = performance.now();
  // O relógio da plataforma em memória acompanha o relógio real.
  const sincronizar = () => {
    const alvo = base + Math.floor(performance.now() - inicio);
    const falta = alvo - plataforma.agora();
    if (falta > 0) plataforma.avancar(falta);
    return plataforma.agora();
  };
  const instancia = criarInstancia({
    host: hostComFalhas(plataforma.cliente(), doRecreio, opcoes.batimentoMs),
    verificador: recreio.verificador("morada", () => new Date(sincronizar())),
    agora: sincronizar,
    urlPublica: "ws://localhost",
    versao: "teste",
    capacidade: 5,
    registrar: (evento, dados) => registros.push({ evento, ...dados }),
  });
  const servidor = criarServidor({
    instancia,
    origens: [ORIGEM],
    exigirOrigem: opcoes.exigirOrigem,
    commit: "abc123",
    tokenDeMetricas: "segredo-de-medidas",
    pingMs: opcoes.pingMs,
    esperaDoRegistroMs: 40,
    registrar: (evento, dados) => registros.push({ evento, ...dados }),
    aoErro: (erro, contexto) => registros.push({ contexto, erro: String(erro) }),
  });
  abertos.push(servidor);
  const porta = await servidor.iniciar(0, "127.0.0.1");

  async function jogador(apelido: string, mundoId?: string) {
    const perfilId = plataforma.criarPerfil({ apelido });
    const mundo = mundoId ?? plataforma.criarMundo({ criador: perfilId });
    if (mundoId) plataforma.adicionarMembro(mundoId as never, perfilId);
    sincronizar();
    plataforma.abrirMundo(mundo as never, perfilId);
    const sid = plataforma.abrirSessao(perfilId);
    const sessao = await recreio.sessao({ perfilId, sid, agora: new Date(sincronizar()) });
    return { perfilId, mundoId: mundo as string, sessao };
  }

  return { plataforma, instancia, servidor, porta, jogador, doRecreio, registros, recreio };
}

/** Espera uma condição que depende do relógio de verdade. */
async function ate(condicao: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const limite = Date.now() + ms;
  while (!(await condicao())) {
    if (Date.now() > limite) throw new Error("a condição não aconteceu a tempo");
    await new Promise((r) => setTimeout(r, 10));
  }
}

type ClienteReal = {
  ws: WebSocket;
  quadros: MensagemDoServidor[];
  visao: VisaoDoCliente | null;
  fechado: Promise<number>;
  mandar(mensagem: MensagemDoCliente): void;
  esperar(condicao: () => boolean, ms?: number): Promise<void>;
};

function conectar(
  porta: number,
  opcoes: { origem?: string | null; protocolo?: string } = {},
): Promise<ClienteReal> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${porta}/`, opcoes.protocolo ?? SUBPROTOCOLO, {
      ...(opcoes.origem === null ? {} : { origin: opcoes.origem ?? ORIGEM }),
    });
    const cliente: ClienteReal = {
      ws,
      quadros: [],
      visao: null,
      fechado: new Promise((fim) => ws.on("close", (codigo) => fim(codigo))),
      mandar: (mensagem) => ws.send(JSON.stringify(mensagem)),
      async esperar(condicao, ms = 3000) {
        const limite = Date.now() + ms;
        while (!condicao()) {
          if (Date.now() > limite) throw new Error("a condição não aconteceu a tempo");
          await new Promise((r) => setTimeout(r, 10));
        }
      },
    };
    ws.on("message", (dados) => {
      const mensagem = JSON.parse(dados.toString()) as MensagemDoServidor;
      cliente.quadros.push(mensagem);
      if (mensagem.t === "fotografia") cliente.visao = mensagem.visao;
      if (mensagem.t === "passo" && cliente.visao) {
        aplicarMudancas(cliente.visao, mensagem.tick, mensagem.mudancas);
      }
    });
    ws.on("open", () => resolve(cliente));
    ws.on("error", reject);
  });
}

describe("servidor em uma porta de verdade", () => {
  it("dois clientes entram pelo WebSocket, jogam e o mundo anda no relógio", async () => {
    const { porta, jogador, instancia } = await subir();
    const lia = await jogador("Lia");
    const bruno = await jogador("Bruno", lia.mundoId);

    const clienteDaLia = await conectar(porta);
    clienteDaLia.mandar({
      t: "entrar",
      v: VERSAO_DO_PROTOCOLO,
      sessao: lia.sessao,
      mundoId: lia.mundoId,
    });
    await clienteDaLia.esperar(() => clienteDaLia.visao !== null);
    const clienteDoBruno = await conectar(porta);
    clienteDoBruno.mandar({
      t: "entrar",
      v: VERSAO_DO_PROTOCOLO,
      sessao: bruno.sessao,
      mundoId: lia.mundoId,
    });
    await clienteDoBruno.esperar(() => clienteDoBruno.visao !== null);
    expect(clienteDaLia.ws.protocol).toBe(SUBPROTOCOLO);
    expect(instancia.medir()).toMatchObject({ mundos: 1, conexoes: 2 });

    // O Bruno escolhe um morador; a Lia vê a reserva dele chegar.
    const visao = clienteDoBruno.visao as VisaoDoCliente;
    const marcos = visao.moradores.ordem.find((id) => visao.moradores.porId[id]?.nome === "Marcos");
    clienteDoBruno.mandar({
      t: "intencao",
      intencao: {
        comandoId: "reservar-marcos",
        mundoId: lia.mundoId,
        moradorId: marcos as never,
        acao: { t: "reservar" },
        versaoEsperada: 0,
      },
    });
    await clienteDoBruno.esperar(() => clienteDoBruno.quadros.some((q) => q.t === "resultado"));
    await clienteDaLia.esperar(() => clienteDaLia.visao?.presenca.reservas.length === 1);
    expect(clienteDaLia.visao?.presenca.reservas[0]?.moradorId).toBe(marcos);

    // O relógio anda sozinho: dez passos por segundo.
    const tick = clienteDaLia.visao?.tick ?? 0;
    await new Promise((r) => setTimeout(r, 1000));
    const andou = (instancia.ator(lia.mundoId)?.tick ?? 0) - tick;
    expect(andou).toBeGreaterThanOrEqual(7);
    expect(andou).toBeLessThanOrEqual(13);

    // Sair de propósito é confirmado antes de fechar.
    clienteDoBruno.mandar({ t: "sair" });
    expect(await clienteDoBruno.fechado).toBe(FECHAMENTO.normal);
    expect(clienteDoBruno.quadros.at(-1)).toEqual({ t: "saiu", salvo: true });
  }, 20_000);

  it("recusa origem que não é do Recreio e subprotocolo desconhecido", async () => {
    const { porta } = await subir();
    await expect(conectar(porta, { origem: "https://outro.example" })).rejects.toThrow(/403/);
    await expect(conectar(porta, { protocolo: "outro.protocolo" })).rejects.toThrow(/400/);
    // Sem origem é um cliente que não é navegador: entra, e depende da sessão como todos.
    const semOrigem = await conectar(porta, { origem: null });
    semOrigem.mandar({ t: "entrar", v: VERSAO_DO_PROTOCOLO, sessao: "lixo", mundoId: "m" });
    expect(await semOrigem.fechado).toBe(FECHAMENTO.sessao);
  });

  it("fecha quadro grande demais e quadro binário", async () => {
    const { porta } = await subir();
    const grande = await conectar(porta);
    grande.ws.send("x".repeat(40_000));
    // O limite é do próprio WebSocket: a conexão cai com o código de mensagem grande demais.
    expect(await grande.fechado).toBe(1009);

    const binario = await conectar(porta);
    binario.ws.send(new Uint8Array([1, 2, 3]));
    expect(await binario.fechado).toBe(FECHAMENTO.protocolo);
  });

  it("a conexão que some sem fechar vira jogador em espera", async () => {
    const { porta, jogador, instancia } = await subir({ pingMs: 150 });
    const lia = await jogador("Lia");
    const cliente = await conectar(porta);
    cliente.mandar({
      t: "entrar",
      v: VERSAO_DO_PROTOCOLO,
      sessao: lia.sessao,
      mundoId: lia.mundoId,
    });
    await cliente.esperar(() => cliente.visao !== null);

    // O cabo é puxado: o socket para de responder, sem quadro de fechamento.
    cliente.ws.pause();
    (cliente.ws as unknown as { _socket: { destroy(): void } })._socket.destroy();
    const mundo = () => instancia.ator(lia.mundoId)?.simulacao;
    await cliente.esperar(() => mundo()?.presenca.sessoes[0]?.estado === "em_graca", 3000);
    expect(instancia.medir().conexoes).toBe(0);
    expect(instancia.medir().mundos).toBe(1);
  }, 20_000);

  it("saúde, prontidão e medidas", async () => {
    const { porta } = await subir();
    const base = `http://127.0.0.1:${porta}`;
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({
      app: "morada-server",
      status: "ok",
      commit: "abc123",
    });
    expect((await fetch(`${base}/api/ready`)).status).toBe(200);
    expect((await fetch(`${base}/api/metricas`)).status).toBe(401);
    expect(
      (await fetch(`${base}/api/metricas`, { headers: { authorization: "Bearer errado" } })).status,
    ).toBe(401);
    const medidas = await fetch(`${base}/api/metricas`, {
      headers: { authorization: "Bearer segredo-de-medidas" },
    });
    expect(await medidas.json()).toMatchObject({ mundos: 0, viva: true, processo: {} });
    expect((await fetch(`${base}/outra-coisa`)).status).toBe(404);
  });

  it("no desligamento, os clientes são avisados e a prontidão cai", async () => {
    const { porta, jogador, servidor, plataforma } = await subir();
    const lia = await jogador("Lia");
    const cliente = await conectar(porta);
    cliente.mandar({
      t: "entrar",
      v: VERSAO_DO_PROTOCOLO,
      sessao: lia.sessao,
      mundoId: lia.mundoId,
    });
    await cliente.esperar(() => cliente.visao !== null);

    await servidor.encerrar();
    abertos.length = 0;
    expect(await cliente.fechado).toBe(FECHAMENTO.reiniciando);
    expect(cliente.quadros).toContainEqual({ t: "aviso", codigo: "servidor_reiniciando" });
    const guardado = plataforma.mundo(lia.mundoId as never);
    expect(guardado.posse).toBeNull();
    expect(guardado.fotografias.at(-1)?.diarioSeq).toBe(guardado.diarioSeq);
  });
});

describe("registro no Recreio", () => {
  it("se o Recreio ainda não está no ar, o servidor sobe, não aceita jogo e se registra quando ele responde", async () => {
    const { porta, jogador, doRecreio, registros, instancia } = await subir({ foraDoAr: true });
    const base = `http://127.0.0.1:${porta}`;

    // Vivo, mas não pronto: a saúde responde, a prontidão não, e o WebSocket é recusado.
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    expect((await fetch(`${base}/api/ready`)).status).toBe(503);
    await expect(conectar(porta)).rejects.toThrow(/503/);
    expect(instancia.medir().registrada).toBe(false);
    expect(registros).toContainEqual(
      expect.objectContaining({ evento: "registro_falhou", codigo: "INDISPONIVEL" }),
    );

    // O Recreio sobe: o registro acontece sozinho, sem reiniciar o servidor.
    doRecreio.foraDoAr = false;
    await ate(async () => (await fetch(`${base}/api/ready`)).status === 200);
    expect(doRecreio.registros).toBe(1);
    const lia = await jogador("Lia");
    const cliente = await conectar(porta);
    cliente.mandar({
      t: "entrar",
      v: VERSAO_DO_PROTOCOLO,
      sessao: lia.sessao,
      mundoId: lia.mundoId,
    });
    await cliente.esperar(() => cliente.visao !== null);
  });

  it("se o Recreio deixa de conhecer a instância, ela larga os mundos e se registra de novo", async () => {
    const { porta, jogador, doRecreio, registros, instancia } = await subir({ batimentoMs: 60 });
    const base = `http://127.0.0.1:${porta}`;
    const lia = await jogador("Lia");
    const cliente = await conectar(porta);
    cliente.mandar({
      t: "entrar",
      v: VERSAO_DO_PROTOCOLO,
      sessao: lia.sessao,
      mundoId: lia.mundoId,
    });
    await cliente.esperar(() => cliente.visao !== null);
    expect(doRecreio.registros).toBe(1);

    doRecreio.esqueceuAInstancia = true;
    // A posse que ela tinha não vale mais: o cliente é mandado reabrir o mundo pelo Recreio.
    expect(await cliente.fechado).toBe(FECHAMENTO.posse);
    await ate(() => doRecreio.registros === 2);
    await ate(async () => (await fetch(`${base}/api/ready`)).status === 200);
    expect(instancia.medir()).toMatchObject({ registrada: true, mundos: 0 });
    expect(registros).toContainEqual(expect.objectContaining({ evento: "registro_perdido" }));
  });

  it("com a origem exigida, quem não manda origem não conecta", async () => {
    const { porta } = await subir({ exigirOrigem: true });
    await expect(conectar(porta, { origem: null })).rejects.toThrow(/403/);
    await expect(conectar(porta, { origem: "https://outro.example" })).rejects.toThrow(/403/);
    const doPortal = await conectar(porta);
    expect(doPortal.ws.protocol).toBe(SUBPROTOCOLO);
  });
});

describe("o que vai para o registro", () => {
  it("nenhuma linha leva a sessão de jogo, o perfil ou o apelido de quem joga", async () => {
    const { porta, jogador, registros, servidor, recreio, plataforma } = await subir();
    const lia = await jogador("Lia Segredosa");
    const cliente = await conectar(porta);
    cliente.mandar({
      t: "entrar",
      v: VERSAO_DO_PROTOCOLO,
      sessao: lia.sessao,
      mundoId: lia.mundoId,
    });
    await cliente.esperar(() => cliente.visao !== null);
    // Uma renovação, uma sessão que não confere e uma entrada recusada (não é membro).
    const renovada = await recreio.sessao({
      perfilId: lia.perfilId,
      sid: (await recreio.verificador("morada").verificar(lia.sessao)).sid,
    });
    cliente.mandar({ t: "renovar_sessao", sessao: renovada });
    const forjada = await conectar(porta);
    forjada.mandar({
      t: "entrar",
      v: VERSAO_DO_PROTOCOLO,
      sessao: `${lia.sessao}x`,
      mundoId: lia.mundoId,
    });
    expect(await forjada.fechado).toBe(FECHAMENTO.sessao);
    const deFora = plataforma.criarPerfil({ apelido: "Intruso" });
    const sessaoDeFora = await recreio.sessao({
      perfilId: deFora,
      sid: plataforma.abrirSessao(deFora),
    });
    const intruso = await conectar(porta);
    intruso.mandar({
      t: "entrar",
      v: VERSAO_DO_PROTOCOLO,
      sessao: sessaoDeFora,
      mundoId: lia.mundoId,
    });
    expect(await intruso.fechado).toBe(FECHAMENTO.semAcesso);
    await servidor.encerrar();
    abertos.length = 0;

    const texto = JSON.stringify(registros);
    expect(registros.length).toBeGreaterThan(4);
    expect(texto).toContain(lia.mundoId);
    for (const proibido of [
      lia.sessao,
      renovada,
      sessaoDeFora,
      lia.perfilId,
      deFora,
      "Segredosa",
    ]) {
      expect(texto).not.toContain(proibido);
    }
    // Nenhum token em nenhuma forma: todo JWS começa assim.
    expect(texto).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });
});
