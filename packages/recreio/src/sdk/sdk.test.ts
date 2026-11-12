import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { MudancaDeAcesso } from "../contrato/sdk";
import { FRACAO_PARA_RENOVAR } from "../contrato/tokens";
import { criarRecreio, REPETIR_RENOVACAO_APOS_MS } from "./index";

const INICIO = Date.UTC(2026, 10, 11, 12, 0, 0);
const QUINZE_MIN = 15 * 60_000;
const PERFIL = "6f1f0a52-7a3b-4d58-9a55-0e4a3c1f2b10";
const MUNDO = "0b6f8f0e-58a1-4a39-8f0b-1c2d3e4f5a6b";
const MEMBRO = "9d2c7b1a-3e4f-4a5b-8c6d-7e8f9a0b1c2d";

/** Quando o SDK renova uma sessão que ainda vale `ms`. */
const fracao = (ms: number) => Math.floor(ms * FRACAO_PARA_RENOVAR);

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
    opcoes: (extra: { continuarAqui?: boolean } = {}) => ({
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
    expect(readdirSync(path.join(raiz, "sdk")).sort()).toEqual(["index.ts", "sdk.test.ts"]);
  });
});
