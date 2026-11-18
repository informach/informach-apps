import { createHash } from "node:crypto";
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

function ambiente(opcoes: { diarioMaxBytes?: number } = {}) {
  const chamadas: Chamada[] = [];
  const fila: (Response | Error)[] = [];
  const cliente = criarClienteDoHost({
    baseUrl: "https://recreio.test/",
    jogo: "morada",
    segredo: SEGREDO,
    fotografiaMaxBytes: 4 * 1024 * 1024,
    diarioMaxBytes: opcoes.diarioMaxBytes ?? 8 * 1024 * 1024,
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
  const presenca = {
    presencaId: "4417ceab-f10e-4311-bbd7-84826a097b00",
    estado: "active" as const,
    expiraEm: "2026-11-18T01:00:30.000Z",
    janelaAte: "2026-11-19T01:00:00.000Z",
  };
  const renovar = {
    mundoId: MUNDO,
    cerca: 2,
    sid: SID,
    perfilId: PERFIL,
    presencaId: presenca.presencaId,
  };

  it("renovação em lote exige registro e não transforma prova perdida em sessão encerrada", async () => {
    const a = ambiente();
    await expect(a.cliente.renovarPresencas([renovar])).rejects.toMatchObject({
      codigo: "NAO_AUTENTICADO",
    });
    expect(a.chamadas).toHaveLength(0);
    await a.registrado();
    a.responder(
      Response.json({ presencas: [{ presencaId: presenca.presencaId, estado: "perdida" }] }),
    );
    expect(await a.cliente.renovarPresencas([renovar])).toEqual({
      presencas: [{ presencaId: presenca.presencaId, estado: "perdida" }],
    });
    expect(a.chamadas.at(-1)).toMatchObject({
      url: "https://recreio.test/api/interno/v1/presencas/renovar",
      method: "POST",
      corpo: { presencas: [renovar] },
    });
  });

  it.each([
    { presencas: [] },
    { presencas: [{ presencaId: "35a7463c-3860-49ef-85db-374bb93b5520", estado: "perdida" }] },
    {
      presencas: [
        { presencaId: presenca.presencaId, estado: "perdida" },
        { presencaId: presenca.presencaId, estado: "perdida" },
      ],
    },
  ])("renovação recusa resposta ausente, cruzada ou duplicada: %j", async (resposta) => {
    const a = ambiente();
    await a.registrado();
    a.responder(Response.json(resposta));
    await expect(a.cliente.renovarPresencas([renovar])).rejects.toMatchObject({
      codigo: "INDISPONIVEL",
    });
  });

  it("resposta de renovação perdida não gera retry automático", async () => {
    const a = ambiente();
    await a.registrado();
    a.responder(new TypeError("resposta perdida"));
    await expect(a.cliente.renovarPresencas([renovar])).rejects.toMatchObject({
      codigo: "INDISPONIVEL",
    });
    expect(a.chamadas).toHaveLength(2);
  });

  it("atestado exige registro e usa somente a instância do cliente", async () => {
    const a = ambiente(),
      pedido = {
        mundoId: MUNDO,
        operacao: "entrar" as const,
        cerca: 2,
        sid: SID,
        perfilId: PERFIL,
        chaveDeEntrada: "14de4b5a-bdf4-463a-bbd4-3cf344c84426",
      };
    await expect(a.cliente.atestarPresenca(pedido)).rejects.toMatchObject({
      codigo: "NAO_AUTENTICADO",
    });
    expect(a.chamadas).toHaveLength(0);
    await a.registrado();
    a.responder(Response.json(presenca), Response.json({ ...presenca, estado: "closed" }));
    expect(await a.cliente.atestarPresenca(pedido)).toEqual(presenca);
    expect(a.chamadas.at(-1)).toMatchObject({
      url: `https://recreio.test/api/interno/v1/mundos/${MUNDO}/presencas`,
      method: "POST",
      headers: {
        authorization: `Bearer ${SEGREDO}`,
        "x-recreio-instancia": INSTANCIA,
        "x-recreio-jogo": "morada",
      },
      corpo: {
        operacao: "entrar",
        cerca: 2,
        sid: SID,
        perfilId: PERFIL,
        chaveDeEntrada: pedido.chaveDeEntrada,
      },
    });
    expect(
      await a.cliente.atestarPresenca({
        mundoId: MUNDO,
        operacao: "sair",
        cerca: 2,
        presencaId: presenca.presencaId,
      }),
    ).toMatchObject({ estado: "closed" });
    expect(a.chamadas.at(-1)?.corpo).toEqual({
      operacao: "sair",
      cerca: 2,
      presencaId: presenca.presencaId,
    });
  });

  it("perder resposta de presença não provoca retry automático nem inventa confirmação", async () => {
    const a = ambiente();
    await a.registrado();
    a.responder(new TypeError("resposta perdida"));
    const pedido = {
      mundoId: MUNDO,
      operacao: "sair" as const,
      cerca: 2,
      presencaId: presenca.presencaId,
    };
    await expect(a.cliente.atestarPresenca(pedido)).rejects.toMatchObject({
      codigo: "INDISPONIVEL",
    });
    expect(a.chamadas).toHaveLength(2);
    a.responder(Response.json({ ...presenca, estado: "closed" }));
    expect(await a.cliente.atestarPresenca(pedido)).toMatchObject({ estado: "closed" });
    expect(a.chamadas).toHaveLength(3);
  });

  it.each([Response.json({ presencaId: "id-invalido" }), recusa(409, { codigo: "POSSE_PERDIDA" })])(
    "atestado recusa corpo inválido ou posse perdida",
    async (resposta) => {
      const a = ambiente();
      await a.registrado();
      a.responder(resposta);
      await expect(
        a.cliente.atestarPresenca({
          mundoId: MUNDO,
          operacao: "sair",
          cerca: 2,
          presencaId: presenca.presencaId,
        }),
      ).rejects.toMatchObject({
        codigo: resposta.status === 409 ? "POSSE_PERDIDA" : "INDISPONIVEL",
      });
    },
  );

  const entrada = (seq: number) => ({ seq, tick: seq, fatoId: `f:${seq}`, bytes: "AA==" });

  it("percorre páginas pela última sequência e conserva os bytes de todas", async () => {
    const a = ambiente();
    await a.registrado();
    a.responder(
      Response.json({ entradas: [entrada(1), entrada(2)], proximoApos: 2 }),
      Response.json({ entradas: [entrada(3)], proximoApos: null }),
    );
    expect(
      (await a.cliente.lerDiario({ mundoId: MUNDO, cerca: 3, apos: 0 })).map((e) => e.seq),
    ).toEqual([1, 2, 3]);
    expect(a.chamadas.at(-1)?.url).toContain("apos=2");
  });

  it.each([
    { entradas: [entrada(2)], proximoApos: null },
    { entradas: [entrada(1)], proximoApos: 0 },
    { entradas: [], proximoApos: 1 },
  ])("recusa buraco ou cursor que não avança: %j", async (pagina) => {
    const a = ambiente();
    await a.registrado();
    a.responder(Response.json(pagina));
    await expect(a.cliente.lerDiario({ mundoId: MUNDO, cerca: 3, apos: 0 })).rejects.toMatchObject({
      codigo: "SEQUENCIA",
    });
  });

  it("o teto da recuperação inclui a soma de todas as páginas", async () => {
    const a = ambiente({ diarioMaxBytes: 1 });
    await a.registrado();
    a.responder(
      Response.json({ entradas: [entrada(1)], proximoApos: 1 }),
      Response.json({ entradas: [entrada(2)], proximoApos: null }),
    );
    await expect(a.cliente.lerDiario({ mundoId: MUNDO, cerca: 3, apos: 0 })).rejects.toMatchObject({
      codigo: "INDISPONIVEL",
    });
  });

  it("interrompe corpo de diário excessivo antes de interpretar o JSON", async () => {
    const a = ambiente();
    await a.registrado();
    let cancelado = false;
    a.responder(
      new Response(
        new ReadableStream({
          start(controlador) {
            controlador.enqueue(new Uint8Array(600_000));
          },
          cancel() {
            cancelado = true;
          },
        }),
      ),
    );
    await expect(a.cliente.lerDiario({ mundoId: MUNDO, cerca: 3, apos: 0 })).rejects.toMatchObject({
      codigo: "INDISPONIVEL",
    });
    expect(cancelado).toBe(true);
  });
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
      sha256: createHash("sha256")
        .update(new Uint8Array([7, 8, 9]))
        .digest("hex"),
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

  it("recusa fotografia alterada de mesmo tamanho antes de entregar ao jogo", async () => {
    const a = ambiente();
    await a.registrado();
    const original = new Uint8Array([7, 8, 9]);
    const alterada = new Uint8Array([7, 0, 9]);
    const meta = {
      revisao: 1,
      diarioSeq: 0,
      tick: 0,
      schemaVersion: 1,
      tipo: "checkpoint",
      bytes: original.length,
      sha256: createHash("sha256").update(original).digest("hex"),
    };
    a.responder(
      new Response(alterada, { headers: { "x-recreio-fotografia": jsonParaCabecalho(meta) } }),
      new Response(original, { headers: { "x-recreio-fotografia": jsonParaCabecalho(meta) } }),
    );
    const pedido = { mundoId: MUNDO, cerca: 2 };
    await expect(a.cliente.lerFotografia(pedido)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    expect((await a.cliente.lerFotografia(pedido))?.bytes).toEqual(original);
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

  it.each(["metadados", "corpo"] as const)(
    "cancela uma fotografia quando %s excedem o tamanho admitido",
    async (motivo) => {
      const a = ambiente();
      await a.registrado();
      let cancelou = false;
      const corpo = new ReadableStream<Uint8Array>({
        start(controlador) {
          controlador.enqueue(new Uint8Array([1, 2, 3]));
        },
        cancel() {
          cancelou = true;
        },
      });
      a.responder(
        new Response(corpo, {
          headers: {
            "x-recreio-fotografia": jsonParaCabecalho({
              revisao: 1,
              diarioSeq: 0,
              tick: 0,
              schemaVersion: 1,
              tipo: "checkpoint",
              bytes: motivo === "metadados" ? 4 * 1024 * 1024 + 1 : 2,
              sha256: SHA,
            }),
          },
        }),
      );
      await expect(a.cliente.lerFotografia({ mundoId: MUNDO, cerca: 1 })).rejects.toMatchObject({
        codigo: "INDISPONIVEL",
      });
      expect(cancelou).toBe(true);
    },
  );

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

describe("entrada temporária de visitante", () => {
  const visitaId = "f9579968-a053-494b-b9db-908c407ba86e",
    pedido = { mundoId: MUNDO, sid: SID, perfilId: PERFIL, cerca: 4, visitaId },
    permitida = {
      visitaId,
      sessaoDeVisitaId: "bff99a1f-9c9d-477c-aa83-a264caa7fab3",
      permissaoAte: "2026-11-18T06:00:30.000Z",
      agora: "2026-11-18T06:00:00.000Z",
      apelido: "Visitante",
      avatar: "sol",
      politica: { multiplayer: true, textoLivre: false, versao: 1 },
    };
  it("exige instância registrada antes de enviar o pedido", async () => {
    const a = ambiente();
    await expect(a.cliente.verificarEntradaDeVisita(pedido)).rejects.toMatchObject({
      codigo: "NAO_AUTENTICADO",
    });
    expect(a.chamadas).toHaveLength(0);
  });
  it("envia escopo e valida o recibo separado do protocolo de membro", async () => {
    const a = ambiente();
    await a.registrado();
    a.responder(Response.json(permitida));
    expect(await a.cliente.verificarEntradaDeVisita(pedido)).toEqual(permitida);
    expect(a.chamadas[1]).toMatchObject({
      url: `https://recreio.test/api/interno/v1/mundos/${MUNDO}/visitas/entrada`,
      method: "POST",
      corpo: { visitaId, sid: SID, perfilId: PERFIL, cerca: 4 },
      headers: { "x-recreio-instancia": INSTANCIA, authorization: `Bearer ${SEGREDO}` },
    });
  });
  it.each(["membro", "outra_visita", "prazo_longo", "rede"] as const)(
    "recusa %s sem repetir a admissão automaticamente",
    async (tipo) => {
      const a = ambiente();
      await a.registrado();
      a.responder(
        tipo === "rede"
          ? new TypeError("fetch failed")
          : Response.json({
              ...permitida,
              ...(tipo === "membro"
                ? { membroId: SID, papel: "member" }
                : tipo === "outra_visita"
                  ? { visitaId: SID }
                  : { permissaoAte: "2026-11-18T06:01:00.000Z" }),
            }),
      );
      await expect(a.cliente.verificarEntradaDeVisita(pedido)).rejects.toMatchObject({
        codigo: "INDISPONIVEL",
      });
      expect(a.chamadas).toHaveLength(2);
    },
  );
});

describe("renovação em lote de visitantes", () => {
  const visita = {
    mundoId: MUNDO,
    sid: SID,
    perfilId: PERFIL,
    cerca: 4,
    visitaId: "f9579968-a053-494b-b9db-908c407ba86e",
    sessaoDeVisitaId: "bff99a1f-9c9d-477c-aa83-a264caa7fab3",
  };
  it("envia prova inteira e confere a identidade de cada resposta", async () => {
    const a = ambiente();
    await a.registrado();
    const resposta = {
      visitas: [
        {
          sessaoDeVisitaId: visita.sessaoDeVisitaId,
          estado: "ok",
          permissaoAte: "2026-11-18T06:00:30.000Z",
          agora: "2026-11-18T06:00:00.000Z",
        },
      ],
    };
    a.responder(Response.json(resposta));
    expect(await a.cliente.renovarVisitas([visita])).toEqual(resposta);
    expect(a.chamadas[1]).toMatchObject({
      url: "https://recreio.test/api/interno/v1/visitas/renovar",
      corpo: { visitas: [visita] },
    });
  });
  it.each(["identidade", "quantidade", "rede"] as const)(
    "recusa %s divergente sem repetir o lote",
    async (tipo) => {
      const a = ambiente();
      await a.registrado();
      a.responder(
        tipo === "rede"
          ? new TypeError("fetch failed")
          : Response.json({
              visitas: tipo === "quantidade" ? [] : [{ sessaoDeVisitaId: SID, estado: "perdida" }],
            }),
      );
      await expect(a.cliente.renovarVisitas([visita])).rejects.toMatchObject({
        codigo: "INDISPONIVEL",
      });
      expect(a.chamadas).toHaveLength(2);
    },
  );
});

describe("encerramento da sessão visitante", () => {
  const pedido = {
    mundoId: MUNDO,
    sid: SID,
    perfilId: PERFIL,
    cerca: 4,
    visitaId: "f9579968-a053-494b-b9db-908c407ba86e",
    sessaoDeVisitaId: "bff99a1f-9c9d-477c-aa83-a264caa7fab3",
    motivo: "sair" as const,
  };
  it("conserva a prova e lê fatos de encerramento sem anunciar salvamento", async () => {
    const a = ambiente();
    await a.registrado();
    const encerrada = {
      sessaoDeVisitaId: pedido.sessaoDeVisitaId,
      estado: "closed",
      sidEncerrado: true,
      visitaEncerrada: true,
    };
    a.responder(Response.json(encerrada));
    expect(await a.cliente.encerrarSessaoDeVisita(pedido)).toEqual(encerrada);
    const { mundoId: _mundo, ...corpo } = pedido;
    expect(a.chamadas[1]).toMatchObject({
      url: `https://recreio.test/api/interno/v1/mundos/${MUNDO}/visitas/encerrar`,
      corpo,
    });
  });
  it.each(["outra_sessao", "ack_inventado", "sid_aberto", "rede"] as const)(
    "recusa %s sem repetir o encerramento",
    async (tipo) => {
      const a = ambiente();
      await a.registrado();
      a.responder(
        tipo === "rede"
          ? new TypeError("fetch failed")
          : Response.json({
              sessaoDeVisitaId: tipo === "outra_sessao" ? SID : pedido.sessaoDeVisitaId,
              estado: "closed",
              sidEncerrado: tipo !== "sid_aberto",
              visitaEncerrada: true,
              ...(tipo === "ack_inventado" ? { salvo: true } : {}),
            }),
      );
      await expect(a.cliente.encerrarSessaoDeVisita(pedido)).rejects.toMatchObject({
        codigo: "INDISPONIVEL",
      });
      expect(a.chamadas).toHaveLength(2);
    },
  );
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
