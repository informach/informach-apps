import { createHash } from "node:crypto";
import { asc, db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as gameSessions,
  recreioGameInstances as instances,
  recreioSpaceJournal as journal,
  recreioSpaceLeases as leases,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
  recreioGameTickets as tickets,
} from "@informach/db/schema";
import { type MundoId, PerfilIdSchema, POSSE_TTL_MS } from "@informach/recreio";
import {
  type EntradaDoDiario,
  MundoAbertoSchema,
  RespostaDoBatimentoSchema,
} from "@informach/recreio/contrato";
import { describe, expect, it, vi } from "vitest";
import { aceitarConvite, criarConvite } from "@/features/mundos/service";
import { env } from "@/lib/env";
import {
  aposentarInstancias,
  avancarRelogio,
  eventosCom,
  type Jogador,
  novoJogador,
} from "./apoio";
import {
  abrirPelaRota,
  cabecalhosDoHost,
  enderecoDo,
  entrarNoJogo,
  esperar,
  MORADA,
  mundoDe,
  novaInstancia,
  OUTRO_JOGO,
  possesAbertas,
  type SessaoDeTeste,
} from "./jogo-apoio";
import { despachar, ORIGEM, pedir } from "./rotas";

vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    { ...real.JOGOS[0], id: "jogo-de-teste", nome: "Jogo de teste", rota: "/jogar/jogo-de-teste" },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((jogo) => jogo.id === id) ?? null,
    ehGameId: (id: string) => jogos.some((jogo) => jogo.id === id),
  };
});

const texto = new TextEncoder();
const fato = (seq: number, id = `fato:${seq}`): EntradaDoDiario => ({
  seq,
  tick: seq * 10,
  fatoId: id,
  bytes: texto.encode(`conteudo ${seq}`),
});

/** Um mundo da Lia, com a sessão de jogo dela. */
async function cenario() {
  await aposentarInstancias();
  const lia = await novoJogador();
  const mundoId = await mundoDe(lia);
  const sessao = await entrarNoJogo(lia);
  return { lia, mundoId, sessao };
}

/** O mundo aberto e reivindicado por uma instância nova. */
async function executando() {
  const base = await cenario();
  const a = await novaInstancia();
  const aberto = await abrirPelaRota(base.sessao, base.mundoId);
  if (aberto.status !== 200) throw new Error(`Abrir falhou: ${JSON.stringify(aberto)}`);
  const posse = await a.cliente.reivindicarPosse(base.mundoId);
  return { ...base, a, cerca: posse.cerca };
}

async function membro(steward: Jogador, mundoId: MundoId, convidado: Jogador) {
  const convite = await criarConvite({ perfilId: steward.perfil.id, jogo: null }, mundoId, {
    forma: "member",
  });
  await aceitarConvite({ perfilId: convidado.perfil.id }, { codigo: convite.codigo });
}

async function mundoNoBanco(mundoId: MundoId) {
  const [linha] = await db.select().from(spaces).where(eq(spaces.id, mundoId));
  if (!linha) throw new Error("Mundo não encontrado no banco");
  return linha;
}

describe("registro da instância", () => {
  it("só aceita o segredo do jogo e o endereço configurado para ele", async () => {
    const registro = {
      jogo: MORADA,
      urlPublica: enderecoDo(MORADA),
      versao: "1",
      capacidade: 5,
    };
    const registrar = (headers: Record<string, string>, corpo: unknown = registro) =>
      pedir("POST", "/api/interno/v1/instancias", { headers, corpo });
    const semAutenticacao = { status: 401, corpo: { codigo: "NAO_AUTENTICADO" } };

    expect(await registrar({})).toEqual(semAutenticacao);
    expect(await registrar(cabecalhosDoHost(MORADA, undefined, "x".repeat(64)))).toEqual(
      semAutenticacao,
    );
    // O segredo de um jogo não registra instância de outro.
    expect(
      await registrar(cabecalhosDoHost(MORADA, undefined, env.RECREIO_HOST_SECRETS[OUTRO_JOGO])),
    ).toEqual(semAutenticacao);
    expect(await registrar(cabecalhosDoHost("xadrez", undefined, "x".repeat(64)))).toEqual(
      semAutenticacao,
    );
    // O cookie do portal não vale nada aqui: só o segredo.
    expect(await registrar({ cookie: "better-auth.session_token=abc", origin: ORIGEM })).toEqual(
      semAutenticacao,
    );

    const entradaInvalida = { status: 400, corpo: { codigo: "ENTRADA_INVALIDA" } };
    for (const errado of [
      { ...registro, urlPublica: "wss://outro-lugar.test" },
      { ...registro, urlPublica: `${enderecoDo(MORADA)}/caminho` },
      { ...registro, urlPublica: enderecoDo(OUTRO_JOGO) },
      { ...registro, jogo: OUTRO_JOGO },
      { ...registro, capacidade: 0 },
      { ...registro, extra: true },
    ]) {
      expect(await registrar(cabecalhosDoHost(MORADA), errado)).toEqual(entradaInvalida);
    }

    const feito = await registrar(cabecalhosDoHost(MORADA));
    expect(feito).toMatchObject({
      status: 200,
      corpo: { batimentoMs: 10_000, posseTtlMs: 30_000 },
    });
    const [linha] = await db
      .select()
      .from(instances)
      .where(eq(instances.id, String(feito.corpo.instanciaId)));
    expect(linha).toMatchObject({ gameId: MORADA, state: "active", capacity: 5, version: "1" });
  });
});

describe("abrir um mundo", () => {
  it("vinte pedidos ao mesmo tempo dão uma posse só e a mesma resposta", async () => {
    const { mundoId, sessao } = await cenario();
    await novaInstancia();
    await novaInstancia();
    const respostas = await Promise.all(
      Array.from({ length: 20 }, () => abrirPelaRota(sessao, mundoId)),
    );
    expect(respostas.map((resposta) => resposta.status)).toEqual(Array(20).fill(200));
    const primeira = MundoAbertoSchema.parse(respostas[0]?.corpo);
    for (const resposta of respostas) expect(resposta.corpo).toEqual(respostas[0]?.corpo);
    expect(primeira).toMatchObject({
      mundoId,
      papel: "steward",
      onde: "servidor",
      endereco: enderecoDo(MORADA),
      schemaVersion: 1,
      revisao: 0,
    });
    // A cerca é da instância: o navegador não a recebe.
    expect(respostas[0]?.corpo).not.toHaveProperty("cerca");

    const abertas = await possesAbertas(mundoId);
    expect(abertas).toMatchObject([{ fence: 1, state: "assigned" }]);
    expect(await db.select().from(leases).where(eq(leases.spaceId, mundoId))).toHaveLength(1);
    expect((await mundoNoBanco(mundoId)).leaseEpoch).toBe(1);
  });

  it("escolhe a instância com menos mundos e respeita a capacidade", async () => {
    await aposentarInstancias();
    const lia = await novoJogador();
    const sessao = await entrarNoJogo(lia);
    const mundos = [await mundoDe(lia, MORADA, "Um"), await mundoDe(lia, MORADA, "Dois")];
    const terceiro = await mundoDe(lia, MORADA, "Três");
    const a = await novaInstancia(MORADA, 1);
    const b = await novaInstancia(MORADA, 1);

    for (const mundoId of mundos) expect((await abrirPelaRota(sessao, mundoId)).status).toBe(200);
    const donas = await Promise.all(mundos.map((mundoId) => possesAbertas(mundoId)));
    expect(donas.map((posses) => posses[0]?.instanceId).sort()).toEqual(
      [a.instanciaId, b.instanciaId].sort(),
    );
    // As duas estão cheias: o terceiro mundo não tem onde abrir, e nada fica pela metade.
    expect(await abrirPelaRota(sessao, terceiro)).toEqual({
      status: 503,
      corpo: { codigo: "SEM_INSTANCIA" },
    });
    expect(await possesAbertas(terceiro)).toEqual([]);
    expect((await mundoNoBanco(terceiro)).leaseEpoch).toBe(0);
  });

  it("mundo arquivado não abre", async () => {
    const { mundoId, sessao } = await cenario();
    await novaInstancia();
    await db.update(spaces).set({ status: "archived" }).where(eq(spaces.id, mundoId));
    expect(await abrirPelaRota(sessao, mundoId)).toEqual({
      status: 409,
      corpo: { codigo: "MUNDO_INDISPONIVEL" },
    });
  });

  it("retoma a posse vencida sem esperar a manutenção, com cerca maior e registro", async () => {
    const { mundoId, sessao, a, cerca } = await executando();
    await a.cliente.anexarAoDiario({ mundoId, cerca, entradas: [fato(1)] });
    const b = await novaInstancia();
    await avancarRelogio(POSSE_TTL_MS - 500);
    await b.cliente.batimento({ mundos: [], cursor: null });
    await avancarRelogio(500);

    const aberto = await abrirPelaRota(sessao, mundoId);
    expect(aberto.status).toBe(200);
    const [nova] = await possesAbertas(mundoId);
    expect(nova).toMatchObject({ fence: cerca + 1, instanceId: b.instanciaId, state: "assigned" });
    const antigas = await db
      .select()
      .from(leases)
      .where(eq(leases.spaceId, mundoId))
      .orderBy(asc(leases.fence));
    expect(antigas[0]).toMatchObject({ fence: cerca, state: "released", endReason: "expired" });
    expect(antigas[0]?.releasedAt).not.toBeNull();

    const [retomada] = (await eventosCom("spaceId", mundoId)).filter(
      (evento) => evento.eventType === "recreio.space_lease_taken_over",
    );
    expect(retomada).toMatchObject({
      actorId: null,
      payload: {
        previousFence: cerca,
        previousInstanceId: a.instanciaId,
        fence: cerca + 1,
        instanceId: b.instanciaId,
      },
    });

    // A antiga tenta escrever: recusada, nada muda, e a recusa fica registrada.
    await expect(
      a.cliente.anexarAoDiario({ mundoId, cerca, entradas: [fato(2)] }),
    ).rejects.toMatchObject({ codigo: "POSSE_PERDIDA" });
    expect((await mundoNoBanco(mundoId)).journalSeq).toBe(1);
    const recusas = await esperar(async () =>
      (await eventosCom("spaceId", mundoId)).filter(
        (evento) => evento.eventType === "recreio.space_write_refused",
      ),
    );
    expect(recusas[0]).toMatchObject({
      actorId: null,
      payload: { instanceId: a.instanciaId, fence: cerca, operation: "journal", gameId: MORADA },
    });
  });

  it("renovação e retomada na mesma hora: exatamente uma acontece", async () => {
    const { mundoId, sessao, a, cerca } = await executando();
    await novaInstancia();
    const resultados: string[] = [];
    let cercaAtual = cerca;
    let dona: string = a.instanciaId;
    for (let rodada = 0; rodada < 12; rodada++) {
      // A posse vence já, daqui a instantes ou com folga; o batimento da dona e
      // a abertura saem juntos. Com folga a renovação ganha; vencida, a retomada.
      const falta = [0, 3, 12, 2000][rodada % 4] ?? 0;
      await db.execute(
        sql`update recreio.space_leases set expires_at = clock_timestamp() + ${`${falta} milliseconds`}::interval where space_id = ${mundoId} and released_at is null`,
      );
      const [batida, aberto] = await Promise.all([
        pedir("POST", `/api/interno/v1/instancias/${dona}/batimento`, {
          headers: cabecalhosDoHost(MORADA, dona),
          corpo: {
            mundos: [{ mundoId, cerca: cercaAtual, jogadores: 1, tick: rodada }],
            cursor: null,
          },
        }),
        abrirPelaRota(sessao, mundoId),
      ]);
      expect(aberto.status).toBe(200);
      const abertas = await possesAbertas(mundoId);
      expect(abertas).toHaveLength(1);
      const posse = abertas[0];
      if (!posse?.instanceId) throw new Error("Esperava uma posse aberta com instância");
      const renovou = RespostaDoBatimentoSchema.parse(batida.corpo).posses[0]?.estado === "ok";
      // Renovou: a posse é a mesma. Não renovou: é outra, com a cerca seguinte.
      expect(posse.fence).toBe(renovou ? cercaAtual : cercaAtual + 1);
      resultados.push(renovou ? "renovou" : "retomou");
      if (renovou) continue;
      // Quem recebeu a posse nova a reivindica, e a rodada seguinte corre contra ela.
      dona = posse.instanceId;
      const reivindicada = await pedir(
        "POST",
        `/api/interno/v1/mundos/${mundoId}/posse/reivindicar`,
        { headers: cabecalhosDoHost(MORADA, dona) },
      );
      expect(reivindicada).toMatchObject({ status: 200, corpo: { cerca: cercaAtual + 1 } });
      cercaAtual += 1;
    }
    expect(resultados).toHaveLength(12);
    expect(resultados).toContain("renovou");
    expect(resultados).toContain("retomou");
    // Cada cerca foi dada a uma posse só.
    const todas = await db
      .select({ fence: leases.fence })
      .from(leases)
      .where(eq(leases.spaceId, mundoId));
    expect(new Set(todas.map((linha) => linha.fence)).size).toBe(todas.length);
    expect(todas).toHaveLength(1 + resultados.filter((item) => item === "retomou").length);
  });
});

describe("o que uma instância alcança", () => {
  it("o segredo de outro jogo não alcança o mundo, e a recusa é a de um mundo que não existe", async () => {
    const { mundoId, cerca } = await executando();
    const intrusa = await novaInstancia(OUTRO_JOGO);
    const fantasma = crypto.randomUUID();
    const cabecalhos = cabecalhosDoHost(OUTRO_JOGO, intrusa.instanciaId);
    const consulta = `cerca=${cerca}&revisaoEsperada=0&diarioSeq=0&tick=0&schemaVersion=1&tipo=checkpoint`;

    const chamadas = (id: string) => [
      pedir("POST", `/api/interno/v1/mundos/${id}/posse/reivindicar`, { headers: cabecalhos }),
      pedir("GET", `/api/interno/v1/mundos/${id}/fotografia?cerca=${cerca}`, {
        headers: cabecalhos,
      }),
      pedir("GET", `/api/interno/v1/mundos/${id}/diario?cerca=${cerca}&apos=0`, {
        headers: cabecalhos,
      }),
      pedir("POST", `/api/interno/v1/mundos/${id}/diario`, {
        headers: cabecalhos,
        corpo: { cerca, entradas: [{ seq: 1, tick: 1, fatoId: "x", bytes: "AA==" }] },
      }),
      pedir("POST", `/api/interno/v1/mundos/${id}/entradas`, {
        headers: cabecalhos,
        corpo: { cerca, sid: crypto.randomUUID(), perfilId: crypto.randomUUID() },
      }),
      pedir("PUT", `/api/interno/v1/mundos/${id}/fotografias?${consulta}`, {
        headers: { ...cabecalhos, "content-type": "application/octet-stream" },
      }),
      pedir("POST", `/api/interno/v1/mundos/${id}/posse/liberar`, {
        headers: cabecalhos,
        corpo: { cerca, motivo: "erro" },
      }),
    ];
    const doMundo = await Promise.all(chamadas(mundoId));
    const doFantasma = await Promise.all(chamadas(fantasma));
    for (const resposta of doMundo)
      expect(resposta).toEqual({ status: 404, corpo: { codigo: "NAO_ENCONTRADO" } });
    expect(doMundo).toEqual(doFantasma);

    // O batimento da intrusa com a cerca certa não renova nada.
    const batida = await intrusa.cliente.batimento({
      mundos: [{ mundoId, cerca, jogadores: 9, tick: 1 }],
      cursor: null,
    });
    expect(batida.posses).toEqual([{ mundoId, estado: "perdida", expiraEm: 0 }]);
    expect(await mundoNoBanco(mundoId)).toMatchObject({ journalSeq: 0, revision: 0 });
    expect(await possesAbertas(mundoId)).toMatchObject([{ fence: cerca, state: "held" }]);
  });

  it("o id da instância tem de ser do jogo do segredo", async () => {
    const { mundoId, a, cerca } = await executando();
    const outra = await novaInstancia(OUTRO_JOGO);
    const semAutenticacao = { status: 401, corpo: { codigo: "NAO_AUTENTICADO" } };
    // Segredo do outro jogo dizendo ser a instância do Morada.
    expect(
      await pedir("POST", `/api/interno/v1/mundos/${mundoId}/posse/liberar`, {
        headers: cabecalhosDoHost(OUTRO_JOGO, a.instanciaId),
        corpo: { cerca, motivo: "erro" },
      }),
    ).toEqual(semAutenticacao);
    expect(
      await pedir("POST", `/api/interno/v1/instancias/${a.instanciaId}/batimento`, {
        headers: cabecalhosDoHost(OUTRO_JOGO),
        corpo: { mundos: [], cursor: null },
      }),
    ).toEqual(semAutenticacao);
    expect(
      await pedir("POST", `/api/interno/v1/instancias/${a.instanciaId}/drenar`, {
        headers: cabecalhosDoHost(OUTRO_JOGO, outra.instanciaId),
        corpo: {},
      }),
    ).toEqual(semAutenticacao);
    // Sem instância, com instância inventada ou com id sem forma de id.
    for (const instanciaId of [undefined, crypto.randomUUID(), "nao-e-um-id"]) {
      expect(
        await pedir("POST", `/api/interno/v1/mundos/${mundoId}/posse/reivindicar`, {
          headers: cabecalhosDoHost(MORADA, instanciaId),
        }),
      ).toEqual(semAutenticacao);
    }
    const [linha] = await db.select().from(instances).where(eq(instances.id, a.instanciaId));
    expect(linha?.state).toBe("active");
    expect(await possesAbertas(mundoId)).toHaveLength(1);
  });

  it("outra instância do mesmo jogo, sem a posse, não lê nem escreve", async () => {
    const { mundoId, cerca } = await executando();
    const b = await novaInstancia();
    const pedido = { mundoId, cerca };
    const perdida = { codigo: "POSSE_PERDIDA" };
    await expect(b.cliente.lerFotografia(pedido)).rejects.toMatchObject(perdida);
    await expect(b.cliente.lerDiario({ ...pedido, apos: 0 })).rejects.toMatchObject(perdida);
    await expect(
      b.cliente.anexarAoDiario({ ...pedido, entradas: [fato(1)] }),
    ).rejects.toMatchObject(perdida);
    await expect(
      b.cliente.gravarFotografia({
        ...pedido,
        revisaoEsperada: 0,
        diarioSeq: 0,
        tick: 0,
        schemaVersion: 1,
        tipo: "checkpoint",
        bytes: texto.encode("x"),
      }),
    ).rejects.toMatchObject(perdida);
    await expect(b.cliente.liberarPosse({ ...pedido, motivo: "erro" })).rejects.toMatchObject(
      perdida,
    );
    expect(await mundoNoBanco(mundoId)).toMatchObject({ journalSeq: 0, revision: 0 });
  });

  it("a entrada de um jogador confere a sessão, o perfil e o jogo, sem aceitar id trocado", async () => {
    const { lia, mundoId, sessao, a, cerca } = await executando();
    const bruno = await novoJogador({ apelido: "Bruno" });
    const sessaoDoBruno = await entrarNoJogo(bruno);
    const entrar = (sid: string, perfilId: string) =>
      pedir("POST", `/api/interno/v1/mundos/${mundoId}/entradas`, {
        headers: cabecalhosDoHost(MORADA, a.instanciaId),
        corpo: { cerca, sid, perfilId },
      });
    const encerrada = { status: 403, corpo: { codigo: "SESSAO_ENCERRADA" } };

    const dona = await entrar(sessao.sid, lia.perfil.id);
    expect(dona).toMatchObject({
      status: 200,
      corpo: {
        papel: "steward",
        participacao: null,
        apelido: "Lia",
        politica: { multiplayer: true, textoLivre: false, versao: 1 },
      },
    });
    // A resposta leva o que mostrar do perfil, nunca a conta.
    expect(JSON.stringify(dona.corpo)).not.toContain(lia.conta.id);
    const [linha] = await db
      .select({ spaceId: gameSessions.spaceId })
      .from(gameSessions)
      .where(eq(gameSessions.id, sessao.sid));
    expect(linha?.spaceId).toBe(mundoId);

    // Sessão válida de quem não é membro.
    expect(await entrar(sessaoDoBruno.sid, bruno.perfil.id)).toEqual({
      status: 403,
      corpo: { codigo: "NAO_MEMBRO" },
    });
    // Sessão de um, perfil de outro, nos dois sentidos.
    expect(await entrar(sessao.sid, bruno.perfil.id)).toEqual(encerrada);
    expect(await entrar(sessaoDoBruno.sid, lia.perfil.id)).toEqual(encerrada);
    // O id da conta no lugar do id do perfil.
    expect(await entrar(sessao.sid, lia.conta.id)).toEqual(encerrada);
    // Sessão que não existe.
    expect(await entrar(crypto.randomUUID(), lia.perfil.id)).toEqual(encerrada);
    // Id que não é id.
    expect((await entrar("x", lia.perfil.id)).status).toBe(400);
  });

  it("sessão de jogo de outro jogo não entra no mundo", async () => {
    const { lia, mundoId, sessao, a, cerca } = await executando();
    await pedir("POST", "/api/sdk/v1/sessao/sair", { token: sessao.token });
    const noOutroJogo = await entrarNoJogo(lia, OUTRO_JOGO);
    expect(
      await pedir("POST", `/api/interno/v1/mundos/${mundoId}/entradas`, {
        headers: cabecalhosDoHost(MORADA, a.instanciaId),
        corpo: { cerca, sid: noOutroJogo.sid, perfilId: lia.perfil.id },
      }),
    ).toEqual({ status: 403, corpo: { codigo: "SESSAO_ENCERRADA" } });
  });
});

describe("o que o navegador alcança", () => {
  it("sessão de quem não é membro, de outro jogo ou com id inventado recebe a mesma recusa", async () => {
    const { lia, mundoId, sessao: sessaoDaLia } = await executando();
    const estranho = await novoJogador();
    const naoMembro = { status: 403, corpo: { codigo: "NAO_MEMBRO" } };
    const sessaoDoEstranho = await entrarNoJogo(estranho);

    const abrir = (sessao: SessaoDeTeste, id: string) => abrirPelaRota(sessao, id);
    expect(await abrir(sessaoDoEstranho, mundoId)).toEqual(naoMembro);
    expect(await abrir(sessaoDoEstranho, crypto.randomUUID())).toEqual(naoMembro);
    expect(await abrir(sessaoDoEstranho, "nao-e-um-id")).toEqual(naoMembro);
    // O id da conta ou do perfil de alguém no lugar do id do mundo.
    expect(await abrir(sessaoDoEstranho, lia.conta.id)).toEqual(naoMembro);
    expect(await abrir(sessaoDoEstranho, lia.perfil.id)).toEqual(naoMembro);

    // A dona do mundo, jogando outro jogo, não o abre por aquela sessão.
    await pedir("POST", "/api/sdk/v1/sessao/sair", { token: sessaoDaLia.token });
    const noOutroJogo = await entrarNoJogo(lia, OUTRO_JOGO);
    await novaInstancia(OUTRO_JOGO);
    expect(await abrir(noOutroJogo, mundoId)).toEqual(naoMembro);
    expect(
      await pedir("POST", `/api/sdk/v1/mundos/${mundoId}/convites`, {
        token: noOutroJogo.token,
        corpo: { forma: "member" },
      }),
    ).toEqual(naoMembro);
    expect(
      (await pedir("GET", `/api/sdk/v1/mundos?jogo=${OUTRO_JOGO}`, { token: noOutroJogo.token }))
        .corpo,
    ).toEqual({ mundos: [] });

    // Nada disso mexeu na posse.
    expect(await possesAbertas(mundoId)).toMatchObject([{ state: "held" }]);
  });

  it("membro que perdeu o acesso ou ficou sem acesso no mundo não o abre", async () => {
    const { lia, mundoId } = await executando();
    const bruno = await novoJogador();
    await membro(lia, mundoId, bruno);
    const sessao = await entrarNoJogo(bruno);
    expect((await abrirPelaRota(sessao, mundoId)).status).toBe(200);

    await db.execute(
      sql`update recreio.space_members set state = 'no_access' where space_id = ${mundoId} and profile_id = ${bruno.perfil.id}`,
    );
    expect(await abrirPelaRota(sessao, mundoId)).toEqual({
      status: 403,
      corpo: { codigo: "NAO_MEMBRO" },
    });
    // O id da conta do Bruno não é o perfil dele: o serviço não o acha como membro.
    const { abrirMundo } = await import("@/features/posse/service");
    await expect(
      abrirMundo({ perfilId: PerfilIdSchema.parse(bruno.conta.id), jogo: MORADA }, mundoId),
    ).rejects.toMatchObject({ codigo: "SEM_PERFIL" });
  });
});

describe("diário e fotografias no banco", () => {
  it("depois de oito checkpoints ficam cinco fotografias e o diário desde a mais antiga", async () => {
    const { mundoId, a, cerca } = await executando();
    const conteudos: Uint8Array[] = [];
    for (let n = 1; n <= 8; n++) {
      await a.cliente.anexarAoDiario({ mundoId, cerca, entradas: [fato(n)] });
      const bytes = texto.encode(`estado ${n}`);
      conteudos.push(bytes);
      await a.cliente.gravarFotografia({
        mundoId,
        cerca,
        revisaoEsperada: n - 1,
        diarioSeq: n,
        tick: n * 10,
        schemaVersion: 2,
        tipo: n === 8 ? "hibernate" : "checkpoint",
        bytes,
        ...(n === 8 ? { resumo: { titulo: "Família Ipê", subtitulo: "Dia 8" } } : {}),
      });
    }
    const fotos = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.spaceId, mundoId))
      .orderBy(asc(snapshots.revision));
    expect(fotos.map((foto) => foto.revision)).toEqual([4, 5, 6, 7, 8]);
    for (const foto of fotos) {
      const esperado = conteudos[foto.revision - 1];
      if (!esperado) throw new Error("Conteúdo de teste ausente");
      expect(foto).toMatchObject({
        storage: "pg",
        objectKey: null,
        fence: cerca,
        journalSeq: foto.revision,
        byteSize: esperado.length,
        schemaVersion: 2,
        // O resumo de conteúdo é calculado no Recreio.
        sha256: createHash("sha256").update(esperado).digest("hex"),
      });
      expect(new Uint8Array(foto.data ?? Buffer.alloc(0))).toEqual(esperado);
    }
    expect(fotos.at(-1)?.kind).toBe("hibernate");
    const diario = await db
      .select({ seq: journal.seq, fence: journal.fence, byteSize: journal.byteSize })
      .from(journal)
      .where(eq(journal.spaceId, mundoId))
      .orderBy(asc(journal.seq));
    expect(diario.map((entrada) => entrada.seq)).toEqual([5, 6, 7, 8]);
    expect(await mundoNoBanco(mundoId)).toMatchObject({
      revision: 8,
      journalSeq: 8,
      schemaVersion: 2,
      summary: { titulo: "Família Ipê", subtitulo: "Dia 8" },
    });

    // Uma entrada já compactada só pode ser repetição: reenviar não faz nada.
    await expect(
      a.cliente.anexarAoDiario({ mundoId, cerca, entradas: [fato(2), fato(3)] }),
    ).resolves.toEqual({ confirmadoAte: 8 });
    // Uma fotografia fixada fica fora da retenção e segura o diário dela para frente.
    await db
      .update(snapshots)
      .set({ kind: "pinned" })
      .where(eq(snapshots.id, fotos[0]?.id ?? ""));
    for (let n = 9; n <= 14; n++) {
      await a.cliente.anexarAoDiario({ mundoId, cerca, entradas: [fato(n)] });
      await a.cliente.gravarFotografia({
        mundoId,
        cerca,
        revisaoEsperada: n - 1,
        diarioSeq: n,
        tick: n * 10,
        schemaVersion: 2,
        tipo: "checkpoint",
        bytes: texto.encode(`estado ${n}`),
      });
    }
    const depois = await db
      .select({ revision: snapshots.revision, kind: snapshots.kind })
      .from(snapshots)
      .where(eq(snapshots.spaceId, mundoId))
      .orderBy(asc(snapshots.revision));
    expect(depois.map((foto) => foto.revision)).toEqual([4, 10, 11, 12, 13, 14]);
    expect(depois[0]?.kind).toBe("pinned");
  });

  it("resumo fora do contrato e números ausentes recusam a fotografia sem gravar", async () => {
    const { mundoId, a, cerca } = await executando();
    const cabecalhos = {
      ...cabecalhosDoHost(MORADA, a.instanciaId),
      "content-type": "application/octet-stream",
    };
    const consulta = `cerca=${cerca}&revisaoEsperada=0&diarioSeq=0&tick=0&schemaVersion=1`;
    const enviar = (query: string, extra: Record<string, string> = {}) =>
      despachar(`${ORIGEM}/api/interno/v1/mundos/${mundoId}/fotografias?${query}`, {
        method: "PUT",
        headers: { ...cabecalhos, ...extra },
        body: texto.encode("estado"),
      });
    for (const resposta of [
      await enviar(consulta),
      await enviar(`${consulta}&tipo=pinned`),
      await enviar(`${consulta}&tipo=checkpoint`, { "x-recreio-resumo": "nao-e-json" }),
      await enviar(`${consulta}&tipo=checkpoint`, {
        "x-recreio-resumo": Buffer.from(JSON.stringify({ titulo: "x".repeat(61) })).toString(
          "base64url",
        ),
      }),
    ]) {
      expect(resposta.status).toBe(400);
      expect(await resposta.json()).toEqual({ codigo: "ENTRADA_INVALIDA" });
    }
    expect((await mundoNoBanco(mundoId)).revision).toBe(0);
    const boa = await enviar(`${consulta}&tipo=checkpoint`);
    expect(boa.status).toBe(200);
    expect(await boa.json()).toEqual({ revisao: 1 });
  });

  it("o batimento conta jogadores por segundo e o pico de cada posse", async () => {
    const { mundoId, a, cerca } = await executando();
    await avancarRelogio(10_000);
    await a.cliente.batimento({
      mundos: [{ mundoId, cerca, jogadores: 3, tick: 1 }],
      cursor: null,
    });
    await avancarRelogio(5_000);
    const batida = await a.cliente.batimento({
      mundos: [{ mundoId, cerca, jogadores: 1, tick: 2 }],
      cursor: null,
    });
    expect(batida.posses[0]?.estado).toBe("ok");
    expect(batida.posses[0]?.expiraEm).toBeGreaterThan(Date.now() + POSSE_TTL_MS - 5_000);
    const [posse] = await possesAbertas(mundoId);
    // 3 jogadores por 10 s, depois 1 jogador por 5 s.
    expect(posse?.playerSeconds).toBeGreaterThanOrEqual(35);
    expect(posse?.playerSeconds).toBeLessThan(45);
    expect(posse?.peakPlayers).toBe(3);
  });

  it("o primeiro batimento só traz sessões encerradas depois que a instância se registrou", async () => {
    await aposentarInstancias();
    const antes = await novoJogador();
    const sessaoAntiga = await entrarNoJogo(antes);
    await pedir("POST", "/api/sdk/v1/sessao/sair", { token: sessaoAntiga.token });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const instancia = await novaInstancia();
    const depois = await novoJogador();
    const sessaoNova = await entrarNoJogo(depois);
    await pedir("POST", "/api/sdk/v1/sessao/sair", { token: sessaoNova.token });

    const primeiro = await instancia.cliente.batimento({ mundos: [], cursor: null });
    expect(primeiro.sessoesEncerradas).toEqual([{ sid: sessaoNova.sid, motivo: "left" }]);
    const segundo = await instancia.cliente.batimento({ mundos: [], cursor: primeiro.cursor });
    expect(segundo).toMatchObject({ sessoesEncerradas: [], cursor: primeiro.cursor });
    expect(
      await pedir("POST", `/api/interno/v1/instancias/${instancia.instanciaId}/batimento`, {
        headers: cabecalhosDoHost(MORADA, instancia.instanciaId),
        corpo: { mundos: [], cursor: "abc" },
      }),
    ).toEqual({ status: 400, corpo: { codigo: "ENTRADA_INVALIDA" } });
  });
});

describe("manutenção", () => {
  const rodar = (segredo = env.CRON_SECRET) =>
    pedir("POST", "/api/jobs/manutencao", {
      headers: segredo ? { authorization: `Bearer ${segredo}` } : {},
    });

  it("só roda com o segredo do agendador", async () => {
    const semSegredo = await despachar(`${ORIGEM}/api/jobs/manutencao`, { method: "POST" });
    expect(semSegredo.status).toBe(401);
    const errado = await despachar(`${ORIGEM}/api/jobs/manutencao`, {
      method: "POST",
      headers: { authorization: `Bearer ${"x".repeat(64)}` },
    });
    expect(errado.status).toBe(401);
  });

  it("recolhe o que venceu, responde só contagens e repetir não muda nada", async () => {
    // Deixa o banco sem pendências de outros testes antes de medir: tudo o que
    // eles deixaram aberto vence e é recolhido aqui.
    await avancarRelogio(2 * POSSE_TTL_MS + 1000);
    await rodar();
    const { lia, mundoId, sessao, a, cerca } = await executando();

    // Uma posse vencida, uma instância calada, um ingresso antigo e uma sessão sem renovar.
    await avancarRelogio(2 * POSSE_TTL_MS + 1000);
    const jti = crypto.randomUUID();
    await db.insert(tickets).values({
      jti,
      profileId: lia.perfil.id,
      deviceSessionId: lia.ator.sessaoDeAparelhoId,
      gameId: MORADA,
      issuedAt: new Date(Date.now() - 2 * 86_400_000),
      expiresAt: new Date(Date.now() - 2 * 86_400_000 + 60_000),
    });
    await db
      .update(gameSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(gameSessions.id, sessao.sid));

    const primeira = await rodar();
    expect(primeira).toEqual({
      status: 200,
      corpo: {
        possesVencidas: 1,
        instanciasSumidas: 1,
        ingressosApagados: 1,
        sessoesExpiradas: 1,
      },
    });

    const [posse] = await db.select().from(leases).where(eq(leases.spaceId, mundoId));
    expect(posse).toMatchObject({ fence: cerca, state: "released", endReason: "expired" });
    expect((await mundoNoBanco(mundoId)).status).toBe("hibernating");
    const [instancia] = await db.select().from(instances).where(eq(instances.id, a.instanciaId));
    expect(instancia?.state).toBe("gone");
    expect(await db.select().from(tickets).where(eq(tickets.jti, jti))).toEqual([]);
    const [encerrada] = await db.select().from(gameSessions).where(eq(gameSessions.id, sessao.sid));
    expect(encerrada).toMatchObject({ endReason: "expired" });
    expect(encerrada?.endedSeq).toBeGreaterThan(0);
    // O ingresso recente da sessão não foi apagado: só sai depois de um dia.
    expect(
      (await db.select().from(tickets).where(eq(tickets.profileId, lia.perfil.id))).length,
    ).toBeGreaterThan(0);

    expect(await rodar()).toEqual({
      status: 200,
      corpo: {
        possesVencidas: 0,
        instanciasSumidas: 0,
        ingressosApagados: 0,
        sessoesExpiradas: 0,
      },
    });
    expect(
      (await db.select().from(gameSessions).where(eq(gameSessions.id, sessao.sid)))[0],
    ).toEqual(encerrada);

    // Uma instância dada como sumida que volta a bater está viva de novo.
    await a.cliente.batimento({ mundos: [], cursor: null });
    expect(
      (await db.select().from(instances).where(eq(instances.id, a.instanciaId)))[0]?.state,
    ).toBe("active");
  });
});
