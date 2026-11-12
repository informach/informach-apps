import { describe, expect, it } from "vitest";
import { MundoIdSchema, PerfilIdSchema, SessaoDeJogoIdSchema } from "../dominio/ids";
import { BATIMENTO_MS, POSSE_TTL_MS } from "../dominio/posse";
import { cabecalhoParaJson, jsonParaCabecalho } from "../transporte/bytes";
import { criarClienteDoHost } from "./cliente";

const INSTANCIA = "3b0c6c1e-2f52-4a1d-9c0a-5e6f7a8b9c0d";
const MUNDO = MundoIdSchema.parse("0b6f8f0e-58a1-4a39-8f0b-1c2d3e4f5a6b");
const PERFIL = PerfilIdSchema.parse("6f1f0a52-7a3b-4d58-9a55-0e4a3c1f2b10");
const SID = SessaoDeJogoIdSchema.parse("7a1d9f3c-6b2e-4c8a-9d1f-2e3a4b5c6d7e");
const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres";
const SHA = "a".repeat(64);

type Chamada = {
  url: string;
  method: string;
  headers: Record<string, string>;
  corpo: unknown;
  bytes: Uint8Array | null;
};

function ambiente() {
  const chamadas: Chamada[] = [];
  const fila: (Response | Error)[] = [];
  const cliente = criarClienteDoHost({
    baseUrl: "https://recreio.test/",
    jogo: "morada",
    segredo: SEGREDO,
    fetch: async (url, init) => {
      const body = init?.body;
      chamadas.push({
        url,
        method: init?.method ?? "GET",
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        corpo: typeof body === "string" ? JSON.parse(body) : undefined,
        bytes: body instanceof Uint8Array ? body : null,
      });
      const proxima = fila.shift();
      if (!proxima) throw new Error(`Pedido sem resposta preparada: ${url}`);
      if (proxima instanceof Error) throw proxima;
      return proxima;
    },
  });
  return {
    cliente,
    chamadas,
    responder: (...respostas: (Response | Error)[]) => fila.push(...respostas),
    async registrado() {
      fila.push(
        Response.json({
          instanciaId: INSTANCIA,
          batimentoMs: BATIMENTO_MS,
          posseTtlMs: POSSE_TTL_MS,
        }),
      );
      await cliente.registrar({ urlPublica: "wss://morada.test", versao: "1", capacidade: 5 });
    },
  };
}

const recusa = (status: number, corpo: unknown) => Response.json(corpo, { status });

describe("cliente HTTP das instâncias", () => {
  it("registra com o segredo e o jogo, e passa a mandar o id da instância", async () => {
    const a = ambiente();
    await a.registrado();
    expect(a.chamadas[0]).toMatchObject({
      url: "https://recreio.test/api/interno/v1/instancias",
      method: "POST",
      corpo: { jogo: "morada", urlPublica: "wss://morada.test", versao: "1", capacidade: 5 },
    });
    expect(a.chamadas[0]?.headers).toMatchObject({
      authorization: `Bearer ${SEGREDO}`,
      "x-recreio-jogo": "morada",
    });
    expect(a.chamadas[0]?.headers["x-recreio-instancia"]).toBeUndefined();

    a.responder(Response.json({ posses: [], sessoesEncerradas: [], cursor: "7", drenar: false }));
    const batida = await a.cliente.batimento({ mundos: [], cursor: null });
    expect(batida.cursor).toBe("7");
    expect(a.chamadas[1]).toMatchObject({
      url: `https://recreio.test/api/interno/v1/instancias/${INSTANCIA}/batimento`,
      corpo: { mundos: [], cursor: null },
    });
    expect(a.chamadas[1]?.headers["x-recreio-instancia"]).toBe(INSTANCIA);
  });

  it("antes de registrar, recusa sem sair para a rede", async () => {
    const a = ambiente();
    await expect(a.cliente.batimento({ mundos: [], cursor: null })).rejects.toMatchObject({
      codigo: "NAO_AUTENTICADO",
    });
    await expect(a.cliente.reivindicarPosse(MUNDO)).rejects.toMatchObject({
      codigo: "NAO_AUTENTICADO",
    });
    expect(a.chamadas).toEqual([]);
  });

  it("manda o diário em base64 e devolve os bytes na leitura", async () => {
    const a = ambiente();
    await a.registrado();
    const bytes = new Uint8Array([0, 255, 128, 10, 13]);
    a.responder(
      Response.json({ confirmadoAte: 1 }),
      Response.json({ entradas: [{ seq: 1, tick: 10, fatoId: "nasc:g1", bytes: "AP+ACg0=" }] }),
    );
    expect(
      await a.cliente.anexarAoDiario({
        mundoId: MUNDO,
        cerca: 3,
        entradas: [{ seq: 1, tick: 10, fatoId: "nasc:g1", bytes }],
      }),
    ).toEqual({ confirmadoAte: 1 });
    expect(a.chamadas[1]).toMatchObject({
      url: `https://recreio.test/api/interno/v1/mundos/${MUNDO}/diario`,
      method: "POST",
      corpo: { cerca: 3, entradas: [{ seq: 1, tick: 10, fatoId: "nasc:g1", bytes: "AP+ACg0=" }] },
    });

    const lidas = await a.cliente.lerDiario({ mundoId: MUNDO, cerca: 3, apos: 0 });
    expect(a.chamadas[2]).toMatchObject({
      url: `https://recreio.test/api/interno/v1/mundos/${MUNDO}/diario?cerca=3&apos=0`,
      method: "GET",
    });
    expect(lidas).toEqual([{ seq: 1, tick: 10, fatoId: "nasc:g1", bytes }]);
  });

  it("manda a fotografia crua, com os números na consulta e o resumo no cabeçalho", async () => {
    const a = ambiente();
    await a.registrado();
    const bytes = new Uint8Array([1, 2, 3, 250]);
    a.responder(Response.json({ revisao: 5 }));
    expect(
      await a.cliente.gravarFotografia({
        mundoId: MUNDO,
        cerca: 2,
        revisaoEsperada: 4,
        diarioSeq: 9,
        tick: 90,
        schemaVersion: 1,
        tipo: "hibernate",
        bytes,
        resumo: { titulo: "Família Ipê", subtitulo: "Dia 3, verão" },
      }),
    ).toEqual({ revisao: 5 });
    const chamada = a.chamadas[1];
    expect(chamada?.method).toBe("PUT");
    expect(chamada?.url).toBe(
      `https://recreio.test/api/interno/v1/mundos/${MUNDO}/fotografias?cerca=2&revisaoEsperada=4&diarioSeq=9&tick=90&schemaVersion=1&tipo=hibernate`,
    );
    expect(chamada?.headers["content-type"]).toBe("application/octet-stream");
    expect(cabecalhoParaJson(chamada?.headers["x-recreio-resumo"] ?? "")).toEqual({
      titulo: "Família Ipê",
      subtitulo: "Dia 3, verão",
    });
    expect(chamada?.bytes).toEqual(bytes);
  });

  it("lê a fotografia com os metadados do cabeçalho, e 204 é mundo sem fotografia", async () => {
    const a = ambiente();
    await a.registrado();
    const meta = {
      revisao: 5,
      diarioSeq: 9,
      tick: 90,
      schemaVersion: 1,
      tipo: "checkpoint",
      bytes: 3,
      sha256: SHA,
    };
    a.responder(
      new Response(new Uint8Array([7, 8, 9]), {
        headers: { "x-recreio-fotografia": jsonParaCabecalho(meta) },
      }),
      new Response(null, { status: 204 }),
    );
    expect(await a.cliente.lerFotografia({ mundoId: MUNDO, cerca: 2 })).toEqual({
      meta,
      bytes: new Uint8Array([7, 8, 9]),
    });
    expect(a.chamadas[1]?.url).toBe(
      `https://recreio.test/api/interno/v1/mundos/${MUNDO}/fotografia?cerca=2`,
    );
    expect(await a.cliente.lerFotografia({ mundoId: MUNDO, cerca: 2 })).toBeNull();
  });

  it("fotografia cortada no caminho ou sem metadados não é entregue", async () => {
    const a = ambiente();
    await a.registrado();
    const meta = {
      revisao: 1,
      diarioSeq: 0,
      tick: 0,
      schemaVersion: 1,
      tipo: "checkpoint",
      bytes: 10,
      sha256: SHA,
    };
    a.responder(
      new Response(new Uint8Array([7, 8, 9]), {
        headers: { "x-recreio-fotografia": jsonParaCabecalho(meta) },
      }),
      new Response(new Uint8Array([7, 8, 9])),
    );
    const pedido = { mundoId: MUNDO, cerca: 2 };
    await expect(a.cliente.lerFotografia(pedido)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    await expect(a.cliente.lerFotografia(pedido)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  });

  it("toda recusa vira ErroDoRecreio com o código e o detalhe do Recreio", async () => {
    const a = ambiente();
    await a.registrado();
    a.responder(
      recusa(409, { codigo: "POSSE_DE_OUTRA_INSTANCIA", detalhe: { endereco: "wss://b.test" } }),
      recusa(409, { codigo: "SEQUENCIA", detalhe: { esperado: 3 } }),
      recusa(409, { codigo: "POSSE_PERDIDA" }),
      recusa(403, { codigo: "NAO_MEMBRO" }),
    );
    await expect(a.cliente.reivindicarPosse(MUNDO)).rejects.toMatchObject({
      name: "ErroDoRecreio",
      codigo: "POSSE_DE_OUTRA_INSTANCIA",
      detalhe: { endereco: "wss://b.test" },
    });
    await expect(
      a.cliente.anexarAoDiario({ mundoId: MUNDO, cerca: 1, entradas: [] }),
    ).rejects.toMatchObject({ codigo: "SEQUENCIA", detalhe: { esperado: 3 } });
    await expect(
      a.cliente.liberarPosse({ mundoId: MUNDO, cerca: 1, motivo: "vazio" }),
    ).rejects.toMatchObject({ codigo: "POSSE_PERDIDA", detalhe: {} });
    await expect(
      a.cliente.verificarEntrada({ mundoId: MUNDO, cerca: 1, sid: SID, perfilId: PERFIL }),
    ).rejects.toMatchObject({ codigo: "NAO_MEMBRO" });
    expect(a.chamadas.at(-1)?.corpo).toEqual({ cerca: 1, sid: SID, perfilId: PERFIL });
  });

  it("rede fora, 5xx e resposta fora do contrato viram INDISPONIVEL", async () => {
    const a = ambiente();
    await a.registrado();
    a.responder(
      new TypeError("fetch failed"),
      new Response("<html>502</html>", { status: 502 }),
      recusa(500, { codigo: "INDISPONIVEL" }),
      recusa(404, { erro: "rota não encontrada" }),
      Response.json({ cerca: "um" }),
    );
    for (let i = 0; i < 5; i++) {
      await expect(a.cliente.reivindicarPosse(MUNDO)).rejects.toMatchObject({
        name: "ErroDoRecreio",
        codigo: "INDISPONIVEL",
      });
    }
  });

  it("drenar e liberar não esperam corpo", async () => {
    const a = ambiente();
    await a.registrado();
    a.responder(Response.json({}), Response.json({}));
    await expect(a.cliente.drenar()).resolves.toBeUndefined();
    await expect(
      a.cliente.liberarPosse({ mundoId: MUNDO, cerca: 4, motivo: "drenagem" }),
    ).resolves.toBeUndefined();
    expect(a.chamadas.slice(1).map((chamada) => [chamada.url, chamada.corpo])).toEqual([
      [`https://recreio.test/api/interno/v1/instancias/${INSTANCIA}/drenar`, {}],
      [
        `https://recreio.test/api/interno/v1/mundos/${MUNDO}/posse/liberar`,
        { cerca: 4, motivo: "drenagem" },
      ],
    ]);
  });
});

describe("JSON em cabeçalho", () => {
  it("vai e volta com acentos e recusa o que não é base64url de JSON", () => {
    const valor = { titulo: "Família Ipê", subtitulo: "Verão 🌞" };
    const cabecalho = jsonParaCabecalho(valor);
    expect(cabecalho).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cabecalhoParaJson(cabecalho)).toEqual(valor);
    expect(cabecalhoParaJson("não é base64")).toBeUndefined();
    expect(cabecalhoParaJson("e30")).toEqual({});
    expect(cabecalhoParaJson("YWJj")).toBeUndefined();
  });
});
