import { aplicarMudancas, type VisaoDoCliente } from "@informach/morada-sim";
import {
  FECHAMENTO,
  type MensagemDoCliente,
  type MensagemDoServidor,
  SUBPROTOCOLO,
  VERSAO_DO_PROTOCOLO,
} from "@informach/morada-sim/protocolo";
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

async function subir(opcoes: { pingMs?: number } = {}) {
  const plataforma = criarPlataformaFalsa({ inicio: Date.now() });
  const recreio = await criarEmissorDeTeste();
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
    host: plataforma.cliente(),
    verificador: recreio.verificador("morada", () => new Date(sincronizar())),
    agora: sincronizar,
    urlPublica: "ws://localhost",
    versao: "teste",
    capacidade: 5,
  });
  const servidor = criarServidor({
    instancia,
    origens: [ORIGEM],
    commit: "abc123",
    tokenDeMetricas: "segredo-de-medidas",
    pingMs: opcoes.pingMs,
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

  return { plataforma, instancia, servidor, porta, jogador };
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
