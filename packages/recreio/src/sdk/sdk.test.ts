import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MudancaDeAcesso } from "../contrato/sdk";
import { FRACAO_PARA_RENOVAR } from "../contrato/tokens";
import { TEMPO_LIMITE_DO_PEDIDO_MS } from "../transporte/prazo";
import { criarRecreio, type OpcoesDoRecreio, REPETIR_RENOVACAO_APOS_MS } from "./index";

const INICIO = Date.UTC(2026, 10, 11, 12, 0, 0);
const QUINZE_MIN = 15 * 60_000;
const PERFIL = "6f1f0a52-7a3b-4d58-9a55-0e4a3c1f2b10";
const MUNDO = "0b6f8f0e-58a1-4a39-8f0b-1c2d3e4f5a6b";
const MEMBRO = "9d2c7b1a-3e4f-4a5b-8c6d-7e8f9a0b1c2d";

/** Quando o SDK renova uma sessão que ainda vale `ms`. */
const fracao = (ms: number) => Math.floor(ms * FRACAO_PARA_RENOVAR);
const capacidadeDeSalvar = (token = "somente-salvar") => ({
  token,
  expiraEm: new Date(INICIO + QUINZE_MIN + 30_000).toISOString(),
});

afterEach(() => vi.useRealTimers());

type Chamada = { url: string; method: string; headers: Record<string, string>; corpo: unknown };
type Resposta = { status?: number; corpo?: unknown; texto?: string } | Error;

/** Um Recreio de mentira: responde na ordem em que as respostas foram enfileiradas. */
function ambiente() {
  let relogio = INICIO;
  const chamadas: Chamada[] = [];
  const fila: Resposta[] = [];
  const agendadas: { chamar: () => void; emMs: number; cancelada: boolean }[] = [];

  const buscar = async (url: string, init?: RequestInit): Promise<Response> => {
    chamadas.push({
      url,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      corpo: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const proxima = fila.shift();
    if (!proxima) throw new Error(`Pedido sem resposta preparada: ${url}`);
    if (proxima instanceof Error) throw proxima;
    if (proxima.texto !== undefined)
      return new Response(proxima.texto, { status: proxima.status ?? 200 });
    return Response.json(proxima.corpo ?? {}, { status: proxima.status ?? 200 });
  };

  const sessao = (token: string, expiraEmMs: number) => ({
    token,
    expiraEm: new Date(expiraEmMs).toISOString(),
  });

  return {
    chamadas,
    agendadas,
    responder: (...respostas: Resposta[]) => fila.push(...respostas),
    sessao,
    aberta: (token = "sessao-1", expiraEmMs = INICIO + QUINZE_MIN) => ({
      ...sessao(token, expiraEmMs),
      perfil: { profileId: PERFIL, apelido: "Lia", avatar: "sol" },
      politica: { multiplayer: true, textoLivre: false, faixa: "18", versao: 1 },
    }),
    avancar(ms: number) {
      relogio += ms;
    },
    /** Dispara o temporizador ainda pendente e espera o pedido que ele faz. */
    async disparar() {
      const pendente = agendadas.filter((item) => !item.cancelada).at(-1);
      if (!pendente) throw new Error("Nenhum temporizador pendente");
      pendente.cancelada = true;
      relogio += pendente.emMs;
      pendente.chamar();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    pendentes: () => agendadas.filter((item) => !item.cancelada),
    opcoes: (
      extra: Pick<
        OpcoesDoRecreio,
        | "continuarAqui"
        | "recuperarAbertura"
        | "aguardarCheckpoint"
        | "aoAguardarCheckpoint"
        | "salvamentoRestrito"
      > = {},
    ) => ({
      baseUrl: "https://recreio.test/",
      jogo: "morada",
      obterIngresso: async () => "ingresso-1",
      fetch: buscar,
      agora: () => relogio,
      agendar: (chamar: () => void, emMs: number) => {
        const item = { chamar, emMs, cancelada: false };
        agendadas.push(item);
        return () => {
          item.cancelada = true;
        };
      },
      ...extra,
    }),
  };
}

describe("abertura da sessão", () => {
  it("salvamento negociado usa só a capacidade própria e recupera uma resposta perdida com lote idêntico", async () => {
    const a = ambiente();
    const capacidade = capacidadeDeSalvar();
    const resultado = { estado: "completed", resultados: [{ chave: "pontos", revisao: 1 }] };
    a.responder(
      { corpo: { ...a.aberta(), salvamento: capacidade } },
      new Error("ACK perdido"),
      { corpo: resultado },
      { corpo: { estado: "completed", expiraEm: capacidade.expiraEm } },
    );
    const contexto = await criarRecreio(a.opcoes({ salvamentoRestrito: true }));
    const saida = contexto.sessao.salvamento;
    if (!saida) throw new Error("Capacidade ausente");
    expect(a.chamadas[0]?.corpo).toEqual({ ingresso: "ingresso-1", suportaSalvamento: true });
    expect(
      await saida.finalizarDados([{ chave: "pontos", revisao: 0, dados: new Uint8Array([49]) }]),
    ).toEqual(resultado);
    const pedidos = a.chamadas.filter(
      (pedido) => pedido.method === "POST" && pedido.url.endsWith("/sessao/salvamento"),
    );
    expect(pedidos).toHaveLength(2);
    expect(pedidos[0]?.corpo).toEqual(pedidos[1]?.corpo);
    expect(pedidos[0]?.headers.authorization).toBe("Bearer somente-salvar");
    expect(a.pendentes()).toHaveLength(0);
    await expect(contexto.dados.ler("pontos")).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
    });
    const total = a.chamadas.length;
    await contexto.sessao.sair();
    expect(a.chamadas).toHaveLength(total);
    expect(await saida.estado()).toEqual({ estado: "completed", expiraEm: capacidade.expiraEm });
  });
  it("coalesce o lote final, conserva seus bytes e recusa conteúdo divergente", async () => {
    const a = ambiente();
    const opcoes = a.opcoes({ salvamentoRestrito: true });
    a.responder({ corpo: { ...a.aberta(), salvamento: capacidadeDeSalvar() } });
    let concluir = (_resposta: Response) => {};
    const resposta = new Promise<Response>((resolve) => {
      concluir = resolve;
    });
    const pedidos: { corpo: unknown; token: string | null }[] = [];
    const contexto = await criarRecreio({
      ...opcoes,
      fetch: (url, init) => {
        if (url.endsWith("/sessao/salvamento") && init?.method === "POST") {
          pedidos.push({
            corpo: JSON.parse(String(init.body)),
            token: new Headers(init.headers).get("authorization"),
          });
          return resposta;
        }
        return opcoes.fetch(url, init);
      },
    });
    const saida = contexto.sessao.salvamento;
    if (!saida) throw new Error("Capacidade ausente");
    const bytes = new Uint8Array([49]);
    const dados = [{ chave: "pontos", revisao: 0, dados: bytes }];
    const primeira = saida.finalizarDados(dados);
    const segunda = saida.finalizarDados(dados);
    bytes[0] = 50;
    await expect(saida.finalizarDados(dados)).rejects.toMatchObject({ codigo: "FATO_DUPLICADO" });
    expect(pedidos).toEqual([
      {
        corpo: { dados: [{ operacao: "gravar", chave: "pontos", revisao: 0, conteudo: "MQ==" }] },
        token: "Bearer somente-salvar",
      },
    ]);
    concluir(Response.json({ estado: "completed", resultados: [{ chave: "pontos", revisao: 1 }] }));
    const recebida = await primeira;
    expect(await segunda).toEqual(recebida);
    if (recebida.resultados[0]) recebida.resultados[0].revisao = 900;
    expect(
      (await saida.finalizarDados([{ chave: "pontos", revisao: 0, dados: new Uint8Array([49]) }]))
        .resultados[0]?.revisao,
    ).toBe(1);
    expect(pedidos).toHaveLength(1);
  });
  it("renovação atualiza a capacidade, mas cliente sem negociação conserva a interface anterior", async () => {
    const a = ambiente();
    a.responder(
      { corpo: { ...a.aberta(), salvamento: capacidadeDeSalvar("s1") } },
      {
        corpo: {
          ...a.sessao("sessao-2", INICIO + QUINZE_MIN * 2),
          salvamento: capacidadeDeSalvar("s2"),
        },
      },
      { corpo: { estado: "ready", expiraEm: capacidadeDeSalvar().expiraEm } },
    );
    const contexto = await criarRecreio(a.opcoes({ salvamentoRestrito: true }));
    await a.disparar();
    const saida = contexto.sessao.salvamento;
    if (!saida) throw new Error("Capacidade ausente");
    await saida.estado();
    expect(a.chamadas.at(-1)?.headers.authorization).toBe("Bearer s2");
    expect(contexto.sessao.token()).toBe("sessao-2");
    const antiga = ambiente();
    antiga.responder({ corpo: antiga.aberta() });
    expect((await criarRecreio(antiga.opcoes())).sessao.salvamento).toBeUndefined();
    expect(antiga.chamadas[0]?.corpo).toEqual({ ingresso: "ingresso-1" });
  });
  it("recusa definitiva não repete a persistência final e nunca declara a saída confirmada", async () => {
    const a = ambiente();
    a.responder(
      { corpo: { ...a.aberta(), salvamento: capacidadeDeSalvar() } },
      { status: 401, corpo: { codigo: "SESSAO_INVALIDA" } },
    );
    const contexto = await criarRecreio(a.opcoes({ salvamentoRestrito: true }));
    const saida = contexto.sessao.salvamento;
    if (!saida) throw new Error("Capacidade ausente");
    await expect(saida.finalizarDados([])).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
    expect(a.chamadas.filter((pedido) => pedido.url.endsWith("/sessao/salvamento"))).toHaveLength(
      1,
    );
    expect(a.pendentes()).toHaveLength(0);
    a.responder({ corpo: {} });
    await contexto.sessao.sair();
    expect(a.chamadas.at(-1)?.url).toBe("https://recreio.test/api/sdk/v1/sessao/sair");
  });
  it("checkpoint envia ACK explícito com o token atual e não repete confirmação sem resposta", async () => {
    const a = ambiente();
    a.responder(
      { corpo: a.aberta() },
      { corpo: { estado: "confirmed", pausada: true } },
      new Error("resposta perdida"),
    );
    const contexto = await criarRecreio(a.opcoes());
    expect(await contexto.sessao.checkpoint(MUNDO, true)).toEqual({
      estado: "confirmed",
      pausada: true,
    });
    expect(a.chamadas.at(-1)).toEqual({
      url: "https://recreio.test/api/sdk/v1/sessao/checkpoint",
      method: "POST",
      headers: { authorization: "Bearer sessao-1", "content-type": "application/json" },
      corpo: { id: MUNDO, confirmado: true },
    });
    const antes = a.chamadas.length;
    await expect(contexto.sessao.checkpoint(MUNDO, false)).rejects.toMatchObject({
      codigo: "INDISPONIVEL",
    });
    expect(a.chamadas).toHaveLength(antes + 1);
    expect(a.pendentes()).toHaveLength(0);
  });
  it("aguarda o ACK com o mesmo pedido e informa a espera antes de abrir", async () => {
    const a = ambiente();
    const avisar = vi.fn();
    a.responder(
      { status: 409, corpo: { codigo: "CHECKPOINT_PENDENTE", detalhe: { motivo: "requested" } } },
      { corpo: a.aberta() },
    );
    const promessa = criarRecreio(
      a.opcoes({
        continuarAqui: true,
        recuperarAbertura: true,
        aguardarCheckpoint: true,
        aoAguardarCheckpoint: avisar,
      }),
    );
    await vi.waitFor(() => expect(avisar).toHaveBeenCalledOnce());
    expect(a.chamadas).toHaveLength(1);
    await a.disparar();
    expect((await promessa).sessao.token()).toBe("sessao-1");
    expect(a.chamadas[0]?.corpo).toEqual(a.chamadas[1]?.corpo);
    expect(a.pendentes()).toHaveLength(1);
  });
  it("aguarda salvamento anterior na reconexão sem solicitar substituição de aparelho", async () => {
    const a = ambiente();
    const avisar = vi.fn();
    a.responder(
      { status: 409, corpo: { codigo: "CHECKPOINT_PENDENTE", motivo: "saving" } },
      { corpo: a.aberta() },
    );
    const promessa = criarRecreio(
      a.opcoes({ recuperarAbertura: true, aguardarCheckpoint: true, aoAguardarCheckpoint: avisar }),
    );
    await vi.waitFor(() => expect(avisar).toHaveBeenCalledOnce());
    await a.disparar();
    const contexto = await promessa;
    expect(a.chamadas[0]?.corpo).toEqual(a.chamadas[1]?.corpo);
    expect(a.chamadas[0]?.corpo).not.toHaveProperty("continuarAqui");
    a.responder({ corpo: {} });
    await contexto.sessao.sair();
  });
  it.each(["manual", "failed", "expired"])("não repete espera recusada por %s", async (motivo) => {
    const a = ambiente();
    a.responder({ status: 409, corpo: { codigo: "CHECKPOINT_PENDENTE", detalhe: { motivo } } });
    await expect(
      criarRecreio(
        a.opcoes({ continuarAqui: true, recuperarAbertura: true, aguardarCheckpoint: true }),
      ),
    ).rejects.toMatchObject({ codigo: "CHECKPOINT_PENDENTE" });
    expect(a.chamadas).toHaveLength(1);
    expect(a.pendentes()).toHaveLength(0);
  });
  it("renovação que já estava em voo não encerra o próprio checkpoint confirmado", async () => {
    const a = ambiente();
    let concluir = (_resposta: Response): void => {
      throw new Error("Renovação não preparada");
    };
    const pendente = new Promise<Response>((resolve) => {
      concluir = resolve;
    });
    const opcoes = a.opcoes();
    const controle = {
      agora: new Date(INICIO).toISOString(),
      expiraEm: new Date(INICIO + QUINZE_MIN).toISOString(),
      pausada: true,
      tempo: null,
      checkpoint: null,
    };
    a.responder(
      { corpo: a.aberta() },
      { corpo: { estado: "confirmed", pausada: true } },
      { corpo: controle },
    );
    const contexto = await criarRecreio({
      ...opcoes,
      fetch: (url, init) => (url.endsWith("/sessao/renovar") ? pendente : opcoes.fetch(url, init)),
    });
    const perdeu = vi.fn();
    contexto.sessao.aoMudarAcesso(perdeu);
    await a.disparar();
    await contexto.sessao.checkpoint(MUNDO, true);
    concluir(Response.json({ codigo: "SESSAO_ENCERRADA", motivo: "checkpoint" }, { status: 403 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(perdeu).not.toHaveBeenCalled();
    expect(a.pendentes()).toHaveLength(0);
    expect(await contexto.sessao.controle()).toMatchObject({ pausada: true });
  });
  it("pedido de checkpoint suspende a renovação até o controle liberar uma tentativa não confirmada", async () => {
    const a = ambiente();
    const controle = {
      agora: new Date(INICIO).toISOString(),
      expiraEm: new Date(INICIO + QUINZE_MIN).toISOString(),
      pausada: false,
      tempo: null,
      checkpoint: {
        id: MUNDO,
        estado: "requested",
        modo: "server",
        expiraEm: new Date(INICIO + 30_000).toISOString(),
      },
    };
    a.responder(
      { corpo: a.aberta() },
      { corpo: controle },
      { corpo: { ...controle, checkpoint: null } },
      { corpo: a.sessao("sessao-2", INICIO + QUINZE_MIN * 2) },
    );
    const contexto = await criarRecreio(a.opcoes());
    await contexto.sessao.controle();
    expect(a.pendentes()).toHaveLength(0);
    expect(contexto.sessao.token()).toBe("sessao-1");
    await contexto.sessao.controle();
    expect(a.pendentes()).toHaveLength(1);
    await a.disparar();
    expect(contexto.sessao.token()).toBe("sessao-2");
    expect(a.chamadas.filter((c) => c.url.endsWith("/sessao/renovar"))).toHaveLength(1);
  });
  it("recuperação repete só uma vez com o mesmo ingresso e prova aleatória; sem prova não repete", async () => {
    const a = ambiente();
    a.responder(new Error("resposta perdida"), { corpo: a.aberta() });
    const contexto = await criarRecreio(a.opcoes({ recuperarAbertura: true }));
    expect(contexto.sessao.token()).toBe("sessao-1");
    expect(a.chamadas).toHaveLength(2);
    expect(a.chamadas[0]?.corpo).toEqual(a.chamadas[1]?.corpo);
    expect(a.chamadas[0]?.corpo).toEqual({
      ingresso: "ingresso-1",
      chaveDeTroca: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(a.pendentes()).toHaveLength(1);
    const outra = ambiente();
    outra.responder(new Error("resposta perdida"));
    await expect(criarRecreio(outra.opcoes())).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    expect(outra.chamadas).toHaveLength(1);
    expect(outra.pendentes()).toHaveLength(0);
  });
  it("prova é nova em outra abertura; recusa e segunda falha não geram novas tentativas", async () => {
    const a = ambiente();
    a.responder(new Error("rede"), new Error("rede"));
    await expect(criarRecreio(a.opcoes({ recuperarAbertura: true }))).rejects.toMatchObject({
      codigo: "INDISPONIVEL",
    });
    expect(a.chamadas).toHaveLength(2);
    const outra = ambiente();
    outra.responder({ status: 409, corpo: { codigo: "JA_ABERTO" } });
    await expect(criarRecreio(outra.opcoes({ recuperarAbertura: true }))).rejects.toMatchObject({
      codigo: "JA_ABERTO",
    });
    expect(outra.chamadas).toHaveLength(1);
    expect(outra.chamadas[0]?.corpo).not.toEqual(a.chamadas[0]?.corpo);
    expect(a.pendentes()).toHaveLength(0);
    expect(outra.pendentes()).toHaveLength(0);
  });
  it("controle usa o token atual e não renova o prazo; resposta extra é recusada", async () => {
    const a = ambiente();
    const estado = {
      agora: new Date(INICIO).toISOString(),
      expiraEm: new Date(INICIO + QUINZE_MIN).toISOString(),
      pausada: false,
      tempo: null,
      checkpoint: null,
    };
    a.responder(
      { corpo: a.aberta() },
      { corpo: estado },
      { corpo: { ...estado, conta: "não pertence ao contrato" } },
    );
    const contexto = await criarRecreio(a.opcoes());
    const prazo = contexto.sessao.expiraEm;
    expect(await contexto.sessao.controle()).toEqual(estado);
    expect(a.chamadas.at(-1)).toEqual({
      url: "https://recreio.test/api/sdk/v1/sessao/controle",
      method: "GET",
      headers: { authorization: "Bearer sessao-1" },
      corpo: undefined,
    });
    expect(contexto.sessao.expiraEm).toBe(prazo);
    expect(a.pendentes()).toHaveLength(1);
    await expect(contexto.sessao.controle()).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  });
  it("usa o token renovado para ler bytes e não repete automaticamente uma escrita sem resposta", async () => {
    const a = ambiente();
    a.responder(
      { corpo: a.aberta() },
      { corpo: a.sessao("sessao-2", INICIO + QUINZE_MIN * 2) },
      { corpo: { versao: null } },
      new Error("conexão perdida"),
    );
    const contexto = await criarRecreio(a.opcoes());
    await a.disparar();
    expect(await contexto.dados.ler("pontos")).toBeNull();
    expect(a.chamadas.at(-1)?.headers.authorization).toBe("Bearer sessao-2");
    const antes = a.chamadas.length;
    await expect(
      contexto.dados.gravar("pontos", new Uint8Array([0, 255]), 0),
    ).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    expect(a.chamadas).toHaveLength(antes + 1);
    expect(a.chamadas.at(-1)?.corpo).toEqual({
      operacao: "gravar",
      chave: "pontos",
      revisao: 0,
      conteudo: "AP8=",
    });
  });
  it("não envia dados ou conquistas depois de encerrar a sessão", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta() }, { corpo: {} });
    const contexto = await criarRecreio(a.opcoes());
    await contexto.sessao.sair();
    const antes = a.chamadas.length;
    await expect(contexto.dados.ler("pontos")).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
    });
    await expect(contexto.dados.gravar("pontos", new Uint8Array())).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
    });
    await expect(contexto.conquista("primeiro-ponto", "recibo")).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
    });
    expect(a.chamadas).toHaveLength(antes);
  });
  it("oferece persistência por perfil e conquistas sem exigir um mundo", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta() });
    const contexto = await criarRecreio(a.opcoes());
    expect(contexto).toHaveProperty("dados.ler", expect.any(Function));
    expect(contexto).toHaveProperty("dados.gravar", expect.any(Function));
    expect(contexto).toHaveProperty("dados.versoes", expect.any(Function));
    expect(contexto).toHaveProperty("dados.resolver", expect.any(Function));
    expect(contexto).toHaveProperty("dados.descartar", expect.any(Function));
    expect(contexto).toHaveProperty("conquista", expect.any(Function));
  });

  it("troca o ingresso por uma sessão e entrega perfil, política e token", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta() });
    const recreio = await criarRecreio(a.opcoes());

    expect(a.chamadas).toHaveLength(1);
    expect(a.chamadas[0]).toMatchObject({
      url: "https://recreio.test/api/sdk/v1/sessao",
      method: "POST",
      corpo: { ingresso: "ingresso-1" },
    });
    // A troca é autenticada pelo ingresso: nenhum token vai junto.
    expect(a.chamadas[0]?.headers.authorization).toBeUndefined();
    expect(recreio.perfil).toEqual({ profileId: PERFIL, apelido: "Lia", avatar: "sol" });
    expect(recreio.politica.textoLivre).toBe(false);
    expect(recreio.sessao.token()).toBe("sessao-1");
    expect(recreio.sessao.expiraEm).toBe(new Date(INICIO + QUINZE_MIN).toISOString());
  });

  it("leva `continuarAqui` quando a página pede para continuar neste aparelho", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta() });
    await criarRecreio(a.opcoes({ continuarAqui: true }));
    expect(a.chamadas[0]?.corpo).toEqual({ ingresso: "ingresso-1", continuarAqui: true });
  });

  it("recusa do servidor vira ErroDoRecreio com o código e nada é agendado", async () => {
    const a = ambiente();
    a.responder({ status: 409, corpo: { codigo: "JA_ABERTO" } });
    await expect(criarRecreio(a.opcoes())).rejects.toMatchObject({
      name: "ErroDoRecreio",
      codigo: "JA_ABERTO",
    });
    expect(a.agendadas).toHaveLength(0);
  });

  it("resposta fora do contrato não vira sessão", async () => {
    const a = ambiente();
    a.responder({ corpo: { token: "x" } });
    await expect(criarRecreio(a.opcoes())).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  });
});

describe("renovação silenciosa", () => {
  it("renova quando passou a fração combinada da validade, com o token vigente", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta() });
    const recreio = await criarRecreio(a.opcoes());
    expect(a.pendentes().map((item) => item.emMs)).toEqual([fracao(QUINZE_MIN)]);

    const avisos: string[] = [];
    recreio.sessao.aoRenovar((token) => avisos.push(token));
    const novoPrazo = INICIO + fracao(QUINZE_MIN) + QUINZE_MIN;
    a.responder({ corpo: a.sessao("sessao-2", novoPrazo) });
    await a.disparar();

    expect(a.chamadas[1]).toMatchObject({
      url: "https://recreio.test/api/sdk/v1/sessao/renovar",
      method: "POST",
      headers: { authorization: "Bearer sessao-1" },
    });
    expect(recreio.sessao.token()).toBe("sessao-2");
    expect(recreio.sessao.expiraEm).toBe(new Date(novoPrazo).toISOString());
    expect(avisos).toEqual(["sessao-2"]);
    // A próxima renovação é contada a partir do prazo novo.
    expect(a.pendentes().map((item) => item.emMs)).toEqual([fracao(QUINZE_MIN)]);
  });

  it("sessão curta (acesso que termina antes) renova na mesma fração", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta("curta", INICIO + 90_000) });
    await criarRecreio(a.opcoes());
    expect(a.pendentes().map((item) => item.emMs)).toEqual([fracao(90_000)]);
    expect(fracao(90_000)).toBeGreaterThan(59_990);
    expect(fracao(90_000)).toBeLessThanOrEqual(60_000);
  });

  it("quem cancelou o aviso de renovação não é mais chamado", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta() });
    const recreio = await criarRecreio(a.opcoes());
    const avisos: string[] = [];
    const cancelar = recreio.sessao.aoRenovar((token) => avisos.push(token));
    cancelar();
    a.responder({ corpo: a.sessao("sessao-2", INICIO + 2 * QUINZE_MIN) });
    await a.disparar();
    expect(avisos).toEqual([]);
  });

  it("recusa avisa a perda de acesso uma vez, com o que o servidor disse, e para de renovar", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta() });
    const recreio = await criarRecreio(a.opcoes());
    const mudancas: MudancaDeAcesso[] = [];
    recreio.sessao.aoMudarAcesso((mudanca) => mudancas.push(mudanca));

    a.responder({
      status: 403,
      corpo: { codigo: "ACESSO_PERDIDO", estado: "REVOGADO", motivo: "concessao_revogada" },
    });
    await a.disparar();

    expect(mudancas).toEqual([
      {
        tipo: "perdido",
        codigo: "ACESSO_PERDIDO",
        estado: "REVOGADO",
        motivo: "concessao_revogada",
      },
    ]);
    expect(a.pendentes()).toEqual([]);
    expect(a.chamadas).toHaveLength(2);
    // O token antigo continua legível para o jogo salvar o que puder.
    expect(recreio.sessao.token()).toBe("sessao-1");
  });

  it("sessão que o servidor não reconhece mais também é perda de acesso", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta() });
    const recreio = await criarRecreio(a.opcoes());
    const mudancas: MudancaDeAcesso[] = [];
    recreio.sessao.aoMudarAcesso((mudanca) => mudancas.push(mudanca));
    a.responder({ status: 401, corpo: { codigo: "SESSAO_INVALIDA" } });
    await a.disparar();
    expect(mudancas).toEqual([{ tipo: "perdido", codigo: "SESSAO_INVALIDA" }]);
    expect(a.pendentes()).toEqual([]);
  });

  it("sem resposta do Recreio, tenta de novo e só desiste quando a sessão vence", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta("curta", INICIO + 60_000) });
    const recreio = await criarRecreio(a.opcoes());
    const mudancas: MudancaDeAcesso[] = [];
    recreio.sessao.aoMudarAcesso((mudanca) => mudancas.push(mudanca));

    // Perto de 40 s: rede fora. Restam uns 20 s; tenta de novo em 15 s.
    a.responder(new TypeError("fetch failed"));
    await a.disparar();
    expect(mudancas).toEqual([]);
    expect(a.pendentes().map((item) => item.emMs)).toEqual([REPETIR_RENOVACAO_APOS_MS]);

    // Perto de 55 s: erro do servidor sem código. Tenta de novo no fim do prazo.
    a.responder({ status: 502, texto: "<html>Bad Gateway</html>" });
    await a.disparar();
    expect(a.pendentes().map((item) => item.emMs)).toEqual([
      60_000 - fracao(60_000) - REPETIR_RENOVACAO_APOS_MS,
    ]);

    // 60 s: a sessão venceu sem renovar.
    a.responder(new TypeError("fetch failed"));
    await a.disparar();
    expect(mudancas).toEqual([{ tipo: "perdido", codigo: "INDISPONIVEL" }]);
    expect(a.pendentes()).toEqual([]);
  });

  it("depois de uma falha passageira, a renovação volta ao ritmo normal", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta() });
    const recreio = await criarRecreio(a.opcoes());
    a.responder(new TypeError("fetch failed"));
    await a.disparar();
    a.responder({ corpo: a.sessao("sessao-2", INICIO + 2 * QUINZE_MIN) });
    await a.disparar();
    expect(recreio.sessao.token()).toBe("sessao-2");
    expect(a.pendentes()).toHaveLength(1);
  });
});

describe("sair", () => {
  it("cancela o temporizador e encerra a sessão no servidor", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta() });
    const recreio = await criarRecreio(a.opcoes());
    a.responder({ corpo: {} });
    await recreio.sessao.sair();

    expect(a.pendentes()).toEqual([]);
    expect(a.chamadas[1]).toMatchObject({
      url: "https://recreio.test/api/sdk/v1/sessao/sair",
      method: "POST",
      headers: { authorization: "Bearer sessao-1" },
    });
    // Sair de novo não pede mais nada.
    await recreio.sessao.sair();
    expect(a.chamadas).toHaveLength(2);
  });

  it("uma renovação em voo que volta depois da saída é descartada", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta() });
    const recreio = await criarRecreio(a.opcoes());
    const avisos: string[] = [];
    const mudancas: MudancaDeAcesso[] = [];
    recreio.sessao.aoRenovar((token) => avisos.push(token));
    recreio.sessao.aoMudarAcesso((mudanca) => mudancas.push(mudanca));

    a.responder({ corpo: a.sessao("sessao-2", INICIO + 2 * QUINZE_MIN) }, { corpo: {} });
    const renovando = a.disparar();
    await recreio.sessao.sair();
    await renovando;

    expect(avisos).toEqual([]);
    expect(mudancas).toEqual([]);
    expect(a.pendentes()).toEqual([]);
  });

  it("sair de uma sessão que o servidor já não reconhece não é erro", async () => {
    for (const recusa of [
      { status: 401, corpo: { codigo: "SESSAO_INVALIDA" } },
      { status: 403, corpo: { codigo: "SESSAO_ENCERRADA", motivo: "expired" } },
    ]) {
      const a = ambiente();
      a.responder({ corpo: a.aberta() });
      const recreio = await criarRecreio(a.opcoes());
      a.responder(recusa);
      await expect(recreio.sessao.sair()).resolves.toBeUndefined();
      expect(a.pendentes()).toEqual([]);
    }
  });

  it("falha ao avisar o servidor chega a quem chamou, e nada mais é renovado", async () => {
    const a = ambiente();
    a.responder({ corpo: a.aberta() });
    const recreio = await criarRecreio(a.opcoes());
    a.responder(new TypeError("fetch failed"));
    await expect(recreio.sessao.sair()).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    expect(a.pendentes()).toEqual([]);
    a.responder({ corpo: {} });
    await recreio.sessao.sair();
    expect(a.chamadas).toHaveLength(3);
    await recreio.sessao.sair();
    expect(a.chamadas).toHaveLength(3);
  });
});

describe("mundos", () => {
  async function aberto() {
    const a = ambiente();
    a.responder({ corpo: a.aberta() });
    return { a, recreio: await criarRecreio(a.opcoes()) };
  }

  it("lista os mundos do jogo com o token da sessão", async () => {
    const { a, recreio } = await aberto();
    const resumo = {
      id: MUNDO,
      nome: "Casa da Lia",
      papel: "steward",
      estado: "hibernating",
      membros: 1,
      politicaDeConteudo: "todas_as_idades",
      abertoAgora: false,
      resumo: null,
      criadoEm: new Date(INICIO).toISOString(),
    };
    a.responder({ corpo: { mundos: [resumo] } });
    expect(await recreio.mundos.listar()).toEqual([resumo]);
    expect(a.chamadas[1]).toMatchObject({
      url: "https://recreio.test/api/sdk/v1/mundos?jogo=morada",
      method: "GET",
      headers: { authorization: "Bearer sessao-1" },
    });
  });

  it("cria, abre e convida nos endereços do contrato", async () => {
    const { a, recreio } = await aberto();
    a.responder(
      { corpo: { id: MUNDO, nome: "Casa da Lia" } },
      {
        corpo: {
          mundoId: MUNDO,
          membroId: MEMBRO,
          papel: "steward",
          onde: "servidor",
          endereco: "wss://morada.test/",
          schemaVersion: 1,
          revisao: 0,
        },
      },
      { corpo: { codigo: "ABCDE-FGHJK", expiraEm: new Date(INICIO + 86_400_000).toISOString() } },
    );
    expect(await recreio.mundos.criar({ nome: "Casa da Lia" })).toEqual({
      id: MUNDO,
      nome: "Casa da Lia",
    });
    expect((await recreio.mundos.abrir(MUNDO)).endereco).toBe("wss://morada.test/");
    expect((await recreio.mundos.convidar(MUNDO, { forma: "member" })).codigo).toBe("ABCDE-FGHJK");

    expect(a.chamadas.slice(1).map((chamada) => [chamada.method, chamada.url])).toEqual([
      ["POST", "https://recreio.test/api/sdk/v1/mundos"],
      ["POST", `https://recreio.test/api/sdk/v1/mundos/${MUNDO}/abrir`],
      ["POST", `https://recreio.test/api/sdk/v1/mundos/${MUNDO}/convites`],
    ]);
    expect(a.chamadas[1]?.corpo).toEqual({ nome: "Casa da Lia" });
    expect(a.chamadas[3]?.corpo).toEqual({ forma: "member" });
  });

  it("usa o token renovado nos pedidos seguintes", async () => {
    const { a, recreio } = await aberto();
    a.responder({ corpo: a.sessao("sessao-2", INICIO + 2 * QUINZE_MIN) });
    await a.disparar();
    a.responder({ corpo: { mundos: [] } });
    await recreio.mundos.listar();
    expect(a.chamadas.at(-1)?.headers.authorization).toBe("Bearer sessao-2");
  });

  it.each([
    [{ status: 409, corpo: { codigo: "LIMITE_DE_MUNDOS" } }, "LIMITE_DE_MUNDOS", {}],
    [{ status: 503, corpo: { codigo: "SEM_INSTANCIA" } }, "SEM_INSTANCIA", {}],
    [
      { status: 403, corpo: { codigo: "ACESSO_NEGADO", estado: "ENCERRADO", motivo: "sem_plano" } },
      "ACESSO_NEGADO",
      { estado: "ENCERRADO", motivo: "sem_plano" },
    ],
    [{ status: 404, corpo: { codigo: "CODIGO_QUE_NAO_EXISTE" } }, "INDISPONIVEL", {}],
    [{ status: 500, texto: "erro" }, "INDISPONIVEL", {}],
    [new TypeError("fetch failed"), "INDISPONIVEL", {}],
  ] as const)("recusa %j vira ErroDoRecreio %s", async (resposta, codigo, detalhe) => {
    const { a, recreio } = await aberto();
    a.responder(resposta);
    await expect(recreio.mundos.criar({ nome: "Casa" })).rejects.toMatchObject({
      name: "ErroDoRecreio",
      codigo,
      detalhe,
    });
  });
});

describe("pedidos sem resposta", () => {
  function adiar<T>() {
    let concluir: ((valor: T) => void) | undefined;
    const promessa = new Promise<T>((resolve) => {
      concluir = resolve;
    });
    return {
      promessa,
      concluir(valor: T) {
        if (!concluir) throw new Error("Pedido não iniciado");
        concluir(valor);
      },
    };
  }

  it("limita a emissão do ingresso e não inicia a troca quando ela não responde", async () => {
    vi.useFakeTimers();
    const a = ambiente(),
      pendente = adiar<string>();
    let signal: AbortSignal | undefined;
    const abertura = criarRecreio({
      ...a.opcoes(),
      obterIngresso: (sinal) => {
        signal = sinal;
        return pendente.promessa;
      },
    });
    const recusa = expect(abertura).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_DO_PEDIDO_MS);
    await recusa;
    pendente.concluir("ingresso tardio");
    await vi.advanceTimersByTimeAsync(0);
    expect(a.chamadas).toEqual([]);
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["listar", "criar", "abrir", "convidar", "sair"] as const)(
    "%s tem prazo e não repete automaticamente a operação",
    async (operacao) => {
      vi.useFakeTimers();
      const a = ambiente(),
        opcoes = a.opcoes(),
        pendente = adiar<Response>();
      let esperando = false,
        pedidos = 0;
      let signal: AbortSignal | null | undefined;
      a.responder({ corpo: a.aberta() });
      const recreio = await criarRecreio({
        ...opcoes,
        fetch: (url, init) => {
          if (!esperando) return opcoes.fetch(url, init);
          pedidos++;
          signal = init?.signal;
          return pendente.promessa;
        },
      });
      esperando = true;
      const operacoes = {
        listar: () => recreio.mundos.listar(),
        criar: () => recreio.mundos.criar({ nome: "Casa" }),
        abrir: () => recreio.mundos.abrir(MUNDO),
        convidar: () => recreio.mundos.convidar(MUNDO, { forma: "member" }),
        sair: () => recreio.sessao.sair(),
      };
      const recusa = Promise.all([
        expect(operacoes[operacao]()).rejects.toMatchObject({ codigo: "INDISPONIVEL" }),
        ...(operacao === "sair"
          ? [expect(recreio.sessao.sair()).rejects.toMatchObject({ codigo: "INDISPONIVEL" })]
          : []),
      ]);
      await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_DO_PEDIDO_MS);
      await recusa;
      expect(pedidos).toBe(1);
      expect(signal?.aborted).toBe(true);
      // Um adapter atrasado não muda o resultado já comunicado ao chamador.
      pendente.concluir(Response.json({ mundos: [] }));
      await vi.advanceTimersByTimeAsync(0);
      expect(pedidos).toBe(1);
    },
  );

  it("renovação pendurada perde o acesso ao vencer e ignora a resposta tardia", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(INICIO);
    const a = ambiente(),
      opcoes = a.opcoes(),
      pendente = adiar<Response>();
    let signal: AbortSignal | null | undefined;
    a.responder({ corpo: a.aberta("curta", INICIO + 1000) });
    const recreio = await criarRecreio({
      ...opcoes,
      agora: () => Date.now(),
      agendar: undefined,
      fetch: (url, init) => {
        if (!url.endsWith("/renovar")) return opcoes.fetch(url, init);
        signal = init?.signal;
        return pendente.promessa;
      },
    });
    const mudancas: MudancaDeAcesso[] = [];
    recreio.sessao.aoMudarAcesso((mudanca) => mudancas.push(mudanca));
    await vi.advanceTimersByTimeAsync(1000);
    expect(mudancas).toEqual([{ tipo: "perdido", codigo: "INDISPONIVEL" }]);
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    pendente.concluir(Response.json(a.sessao("tardia", INICIO + QUINZE_MIN)));
    await vi.advanceTimersByTimeAsync(0);
    expect(recreio.sessao.token()).toBe("curta");
    expect(mudancas).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("o que o SDK carrega", () => {
  it("não importa chave, Node, verificador nem o emissor", () => {
    const raiz = path.resolve(__dirname, "..");
    const visitados = new Set<string>();
    const fila = [path.join(raiz, "sdk/index.ts")];
    const externos = new Set<string>();
    while (fila.length > 0) {
      const arquivo = fila.pop();
      if (!arquivo || visitados.has(arquivo)) continue;
      visitados.add(arquivo);
      const codigo = readFileSync(arquivo, "utf8");
      for (const [, origem] of codigo.matchAll(/from\s+"([^"]+)"/g)) {
        if (!origem) continue;
        if (!origem.startsWith(".")) {
          externos.add(origem);
          continue;
        }
        const alvo = path.resolve(path.dirname(arquivo), origem);
        const candidatos = [`${alvo}.ts`, path.join(alvo, "index.ts")];
        const encontrado = candidatos.find((candidato) => {
          try {
            return readFileSync(candidato) !== undefined;
          } catch {
            return false;
          }
        });
        if (encontrado) fila.push(encontrado);
      }
    }
    const relativos = [...visitados].map((arquivo) =>
      path.relative(raiz, arquivo).replaceAll("\\", "/"),
    );
    expect(relativos).toContain("transporte/http.ts");
    expect(relativos.filter((arquivo) => /^(emissor|host|testing|tokens)\//.test(arquivo))).toEqual(
      [],
    );
    expect([...externos].sort()).toEqual(["zod"]);
    // `modulo.ts` é só tipos (o contrato com a página que hospeda o jogo) e fala de
    // DOM: por isso mora aqui, e não em `contrato/`, que servidores de jogo importam.
    expect(readdirSync(path.join(raiz, "sdk")).sort()).toEqual([
      "index.ts",
      "modulo.ts",
      "sdk.test.ts",
    ]);
    expect(relativos).toContain("sdk/modulo.ts");
  });
});
