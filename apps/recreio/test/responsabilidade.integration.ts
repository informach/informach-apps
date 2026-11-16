import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaceStewardshipRequests as requests,
  sessions,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { expect, it } from "vitest";
import {
  type AutorDaResponsabilidade,
  proporResponsabilidade,
  responderResponsabilidade,
} from "@/features/mundos/responsabilidade-repository";
import { sairDoMundo } from "@/features/mundos/saida";
import { aceitarConvite, criarConvite } from "@/features/mundos/service";
import { travarEncerramentos } from "@/features/sessao-de-jogo/repository";
import { AppError } from "@/lib/errors";
import { eventosCom, type Jogador, novoJogador, sinal } from "./apoio";
import { mundoDe } from "./jogo-apoio";

async function autor(p: Jogador): Promise<AutorDaResponsabilidade> {
  const [login] = await db.select().from(sessions).where(eq(sessions.id, p.login.authSessionId));
  if (!login) throw new Error("Login ausente na bancada.");
  return {
    contaId: p.conta.id,
    perfilId: p.perfil.id,
    sessaoDeAparelhoId: p.ator.sessaoDeAparelhoId,
    login: { authSessionId: login.id, criadoEm: login.createdAt, expiraEm: login.expiresAt },
  };
}
async function cenario() {
  const lia = await novoJogador();
  const bruno = await novoJogador();
  const id = await mundoDe(lia);
  const convite = await criarConvite({ perfilId: lia.perfil.id, jogo: null }, id, {
    forma: "member",
  });
  await aceitarConvite({ perfilId: bruno.perfil.id }, { codigo: convite.codigo });
  const vinculos = await db.select().from(members).where(eq(members.spaceId, id));
  const membroLia = vinculos.find((membro) => membro.profileId === lia.perfil.id);
  const membroBruno = vinculos.find((membro) => membro.profileId === bruno.perfil.id);
  if (!membroLia || !membroBruno) throw new Error("Participação ausente na bancada.");
  return { lia, bruno, id, membroLia, membroBruno, a: await autor(lia), b: await autor(bruno) };
}

it("propor não transfere; aceitar troca os papéis sem reatribuir criação ou participação", async () => {
  const c = await cenario();
  const antes = await db.select().from(spaces).where(eq(spaces.id, c.id));
  const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  expect((await db.select().from(spaces).where(eq(spaces.id, c.id)))[0]).toEqual(antes[0]);
  const repetida = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  expect(repetida).toEqual(proposta);
  expect(await responderResponsabilidade(c.b, c.id, proposta.pedidoId, "accepted")).toEqual({
    pedidoId: proposta.pedidoId,
    estado: "accepted",
  });
  const [depois] = await db.select().from(spaces).where(eq(spaces.id, c.id));
  expect(depois?.stewardProfileId).toBe(c.bruno.perfil.id);
  expect(depois?.createdByProfileId).toBe(c.lia.perfil.id);
  const vinculos = await db.select().from(members).where(eq(members.spaceId, c.id));
  expect(vinculos.find((m) => m.id === c.membroLia.id)).toEqual({ ...c.membroLia, role: "member" });
  expect(vinculos.find((m) => m.id === c.membroBruno.id)).toEqual({
    ...c.membroBruno,
    role: "steward",
  });
  const eventos = await eventosCom("requestId", proposta.pedidoId);
  expect(eventos.map((evento) => evento.eventType)).toEqual([
    "recreio.space_stewardship_requested",
    "recreio.space_stewardship_accepted",
  ]);
  expect(await responderResponsabilidade(c.b, c.id, proposta.pedidoId, "accepted")).toEqual({
    pedidoId: proposta.pedidoId,
    estado: "accepted",
  });
  expect(await eventosCom("requestId", proposta.pedidoId)).toEqual(eventos);
});

it.each(["propor", "aceitar"] as const)(
  "%s exige criação recente do login, mesmo com validade longa",
  async (acao) => {
    const c = await cenario();
    const alvo = acao === "propor" ? c.a : c.b;
    const antigo = {
      ...alvo,
      login: { ...alvo.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
    };
    const operacao =
      acao === "propor"
        ? proporResponsabilidade(antigo, c.id, c.membroBruno.id)
        : responderResponsabilidade(
            antigo,
            c.id,
            (await proporResponsabilidade(c.a, c.id, c.membroBruno.id)).pedidoId,
            "accepted",
          );
    await expect(operacao).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    expect((await db.select().from(spaces).where(eq(spaces.id, c.id)))[0]?.stewardProfileId).toBe(
      c.lia.perfil.id,
    );
  },
);

it.each(["declined", "revoked"] as const)(
  "%s é terminal, auditado e permite outra proposta",
  async (resposta) => {
    const c = await cenario();
    const primeira = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
    await responderResponsabilidade(
      resposta === "revoked" ? c.a : c.b,
      c.id,
      primeira.pedidoId,
      resposta,
    );
    const segunda = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
    expect(segunda.pedidoId).not.toBe(primeira.pedidoId);
    expect(
      (await db.select().from(requests).where(eq(requests.id, primeira.pedidoId)))[0]?.state,
    ).toBe(resposta);
  },
);

it("ninguém aceita a própria oferta ou a oferta de outro destinatário", async () => {
  const c = await cenario();
  const outra = await novoJogador();
  const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await expect(
    responderResponsabilidade(c.a, c.id, proposta.pedidoId, "accepted"),
  ).rejects.toBeInstanceOf(AppError);
  await expect(
    responderResponsabilidade(await autor(outra), c.id, proposta.pedidoId, "accepted"),
  ).rejects.toBeInstanceOf(AppError);
  await expect(proporResponsabilidade(c.b, c.id, c.membroLia.id)).rejects.toMatchObject({
    code: "RESPONSAVEL",
  });
});

it("a saída do destinatário revoga a proposta na mesma transação", async () => {
  const c = await cenario();
  const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await sairDoMundo(c.b, c.id);
  const [pedido] = await db.select().from(requests).where(eq(requests.id, proposta.pedidoId));
  expect(pedido?.state).toBe("revoked");
  await expect(
    responderResponsabilidade(c.b, c.id, proposta.pedidoId, "accepted"),
  ).resolves.toEqual({ pedidoId: proposta.pedidoId, estado: "revoked" });
  const [membro] = await db
    .select()
    .from(members)
    .where(and(eq(members.spaceId, c.id), eq(members.profileId, c.bruno.perfil.id)));
  expect(membro?.state).toBe("former");
});

it("a expiração é registrada sem aceitar a transferência nem reaplicá-la na repetição", async () => {
  const c = await cenario();
  const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await db
    .update(requests)
    .set({
      createdAt: new Date(Date.now() - 2 * 86_400_000),
      expiresAt: new Date(Date.now() - 86_400_000),
    })
    .where(eq(requests.id, proposta.pedidoId));
  expect(await responderResponsabilidade(c.b, c.id, proposta.pedidoId, "accepted")).toEqual({
    pedidoId: proposta.pedidoId,
    estado: "expired",
  });
  expect((await db.select().from(spaces).where(eq(spaces.id, c.id)))[0]?.stewardProfileId).toBe(
    c.lia.perfil.id,
  );
  const eventos = await eventosCom("requestId", proposta.pedidoId);
  expect(eventos.map((evento) => evento.eventType)).toEqual([
    "recreio.space_stewardship_requested",
    "recreio.space_stewardship_expired",
  ]);
  await responderResponsabilidade(c.b, c.id, proposta.pedidoId, "accepted");
  expect(await eventosCom("requestId", proposta.pedidoId)).toEqual(eventos);
});

async function partida(p: Jogador, mundoId: string) {
  const id = randomUUID();
  await db.insert(games).values({
    id,
    profileId: p.perfil.id,
    deviceSessionId: p.ator.sessaoDeAparelhoId,
    gameId: "morada",
    spaceId: mundoId,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return id;
}

it("o aceite encerra as duas partidas do mundo com motivo próprio e cursor", async () => {
  const c = await cenario();
  const partidas = [
    { id: await partida(c.lia, c.id), jogador: c.lia },
    { id: await partida(c.bruno, c.id), jogador: c.bruno },
  ];
  const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await responderResponsabilidade(c.b, c.id, proposta.pedidoId, "accepted");
  for (const { id, jogador } of partidas) {
    const [sessao] = await db.select().from(games).where(eq(games.id, id));
    expect(sessao?.endReason).toBe("permissions_changed");
    expect(sessao?.endedAt).toBeInstanceOf(Date);
    expect(sessao?.endedSeq).toBeGreaterThan(0);
    expect(await eventosCom("sessionId", id)).toEqual([
      {
        eventType: "recreio.game_session_ended",
        actorId: c.bruno.conta.id,
        payload: {
          app: "recreio",
          sessionId: id,
          profileId: jogador.perfil.id,
          gameId: "morada",
          reason: "permissions_changed",
          targetId: jogador.conta.id,
        },
      },
    ]);
  }
});

it("o aceite conserva outro perfil no mundo e uma partida dos envolvidos em outro mundo", async () => {
  const c = await cenario();
  const terceiro = await novoJogador();
  const convite = await criarConvite({ perfilId: c.lia.perfil.id, jogo: null }, c.id, {
    forma: "member",
  });
  await aceitarConvite({ perfilId: terceiro.perfil.id }, { codigo: convite.codigo });
  const outro = await mundoDe(c.lia);
  const preservadas = [await partida(c.lia, outro), await partida(terceiro, c.id)];
  const encerrada = await partida(c.bruno, c.id);
  const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await responderResponsabilidade(c.b, c.id, proposta.pedidoId, "accepted");
  for (const id of preservadas) {
    expect((await db.select().from(games).where(eq(games.id, id)))[0]).toMatchObject({
      endedAt: null,
      endedSeq: null,
    });
  }
  expect((await db.select().from(games).where(eq(games.id, encerrada)))[0]?.endReason).toBe(
    "permissions_changed",
  );
});

it("falha real da auditoria reverte papéis, pedido e encerramentos e permite nova tentativa", async () => {
  const c = await cenario();
  const id = await partida(c.bruno, c.id);
  const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await db.execute(sql`create function audit.recusar_responsabilidade_em_teste() returns trigger language plpgsql as $$
    begin if new.event_type='recreio.space_stewardship_accepted' then raise exception 'indisponível (teste)'; end if; return new; end $$`);
  await db.execute(sql`create trigger recusar_responsabilidade_em_teste before insert on audit.events
    for each row execute function audit.recusar_responsabilidade_em_teste()`);
  try {
    await expect(
      responderResponsabilidade(c.b, c.id, proposta.pedidoId, "accepted"),
    ).rejects.toBeInstanceOf(AuditPersistenceError);
    expect((await db.select().from(spaces).where(eq(spaces.id, c.id)))[0]?.stewardProfileId).toBe(
      c.lia.perfil.id,
    );
    expect(
      (await db.select().from(requests).where(eq(requests.id, proposta.pedidoId)))[0],
    ).toMatchObject({ state: "pending", completedAt: null });
    expect((await db.select().from(games).where(eq(games.id, id)))[0]).toMatchObject({
      endedAt: null,
      endedSeq: null,
    });
  } finally {
    await db.execute(sql`drop trigger recusar_responsabilidade_em_teste on audit.events`);
    await db.execute(sql`drop function audit.recusar_responsabilidade_em_teste()`);
  }
  expect((await responderResponsabilidade(c.b, c.id, proposta.pedidoId, "accepted")).estado).toBe(
    "accepted",
  );
});

it.each(["revogado", "vencido", "outro_login"] as const)(
  "o aparelho %s não propõe nem muda o mundo",
  async (caso) => {
    const c = await cenario();
    if (caso === "revogado")
      await db
        .update(devices)
        .set({ revokedAt: new Date() })
        .where(eq(devices.id, c.a.sessaoDeAparelhoId));
    if (caso === "vencido")
      await db
        .update(devices)
        .set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(devices.id, c.a.sessaoDeAparelhoId));
    const a =
      caso === "outro_login"
        ? { ...c.a, login: { ...c.a.login, authSessionId: randomUUID() } }
        : c.a;
    await expect(proporResponsabilidade(a, c.id, c.membroBruno.id)).rejects.toMatchObject({
      code: "AUTH",
    });
    expect(await db.select().from(requests).where(eq(requests.spaceId, c.id))).toEqual([]);
  },
);

it("repetições concorrentes da oferta conservam um único pedido e evento", async () => {
  const c = await cenario();
  const resultados = await Promise.all([
    proporResponsabilidade(c.a, c.id, c.membroBruno.id),
    proporResponsabilidade(c.a, c.id, c.membroBruno.id),
  ]);
  expect(resultados[0]).toEqual(resultados[1]);
  expect(await db.select().from(requests).where(eq(requests.spaceId, c.id))).toHaveLength(1);
  expect(await eventosCom("requestId", resultados[0].pedidoId)).toHaveLength(1);
});

it("aceite e cancelamento concorrentes produzem uma única decisão terminal", async () => {
  const c = await cenario();
  const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  const resultados = await Promise.all([
    responderResponsabilidade(c.b, c.id, proposta.pedidoId, "accepted"),
    responderResponsabilidade(c.a, c.id, proposta.pedidoId, "revoked"),
  ]);
  expect(resultados[0]).toEqual(resultados[1]);
  const [pedido] = await db.select().from(requests).where(eq(requests.id, proposta.pedidoId));
  expect(["accepted", "revoked"]).toContain(pedido?.state);
  const [mundo] = await db.select().from(spaces).where(eq(spaces.id, c.id));
  expect(mundo?.stewardProfileId).toBe(
    pedido?.state === "accepted" ? c.bruno.perfil.id : c.lia.perfil.id,
  );
  expect(await eventosCom("requestId", proposta.pedidoId)).toHaveLength(2);
});

it("um aceite antigo não reaplica a autoridade depois de uma transferência posterior", async () => {
  const c = await cenario();
  const primeira = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await responderResponsabilidade(c.b, c.id, primeira.pedidoId, "accepted");
  const segunda = await proporResponsabilidade(c.b, c.id, c.membroLia.id);
  await responderResponsabilidade(c.a, c.id, segunda.pedidoId, "accepted");
  await responderResponsabilidade(c.b, c.id, primeira.pedidoId, "accepted");
  expect((await db.select().from(spaces).where(eq(spaces.id, c.id)))[0]?.stewardProfileId).toBe(
    c.lia.perfil.id,
  );
  expect(await eventosCom("requestId", primeira.pedidoId)).toHaveLength(2);
});

it.each(["minor", "suspended"] as const)(
  "o destinatário que se tornou %s não pode aceitar",
  async (estado) => {
    const c = await cenario();
    const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
    await db
      .update(profiles)
      .set(estado === "minor" ? { kind: "minor" } : { status: "suspended" })
      .where(eq(profiles.id, c.bruno.perfil.id));
    await expect(
      responderResponsabilidade(c.b, c.id, proposta.pedidoId, "accepted"),
    ).rejects.toMatchObject({ code: "AUTH" });
    expect(
      (await db.select().from(requests).where(eq(requests.id, proposta.pedidoId)))[0]?.state,
    ).toBe("pending");
  },
);

async function segurarCursor() {
  const pronto = sinal<number>();
  const fim = sinal<void>();
  const transacao = db.transaction(async (tx) => {
    await tx.execute(sql`set local transaction_timeout='15s'`);
    await travarEncerramentos(tx);
    const [linha] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    if (!linha) throw new Error("Conexão ausente na bancada.");
    pronto.concluir(linha.pid);
    await fim.promessa;
  });
  void transacao.catch(pronto.recusar);
  return {
    pid: await pronto.promessa,
    async liberar() {
      fim.concluir(undefined);
      await transacao;
    },
  };
}

it.each(["login", "aparelho", "pedido"] as const)(
  "relê o prazo de %s depois de esperar o cursor de encerramentos",
  async (caso) => {
    const c = await cenario();
    const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
    const sid = await partida(c.bruno, c.id);
    const trava = await segurarCursor();
    let resultado: Promise<unknown> | undefined;
    try {
      if (caso === "login")
        await db
          .update(sessions)
          .set({ createdAt: sql`clock_timestamp()-interval '10 minutes'+interval '800ms'` })
          .where(eq(sessions.id, c.b.login.authSessionId));
      if (caso === "aparelho")
        await db
          .update(devices)
          .set({ expiresAt: sql`clock_timestamp()+interval '800ms'` })
          .where(eq(devices.id, c.b.sessaoDeAparelhoId));
      if (caso === "pedido")
        await db
          .update(requests)
          .set({ expiresAt: sql`clock_timestamp()+interval '800ms'` })
          .where(eq(requests.id, proposta.pedidoId));
      resultado = responderResponsabilidade(
        await autor(c.bruno),
        c.id,
        proposta.pedidoId,
        "accepted",
      ).then(
        (valor) => ({ ok: true, valor }),
        (erro: unknown) => ({ ok: false, erro }),
      );
      await expect
        .poll(
          async () => {
            const [linha] = await db.execute<{ esperando: boolean }>(
              sql`select exists(select 1 from pg_stat_activity where ${trava.pid}=any(pg_blocking_pids(pid))) as esperando`,
            );
            return linha?.esperando;
          },
          { interval: 20 },
        )
        .toBe(true);
      await expect
        .poll(
          async () => {
            const condicao =
              caso === "login"
                ? sql`select created_at+interval '10 minutes'<=clock_timestamp() as venceu from core.sessions where id=${c.b.login.authSessionId}`
                : caso === "aparelho"
                  ? sql`select expires_at<=clock_timestamp() as venceu from recreio.device_sessions where id=${c.b.sessaoDeAparelhoId}`
                  : sql`select expires_at<=clock_timestamp() as venceu from recreio.space_stewardship_requests where id=${proposta.pedidoId}`;
            const [linha] = await db.execute<{ venceu: boolean }>(condicao);
            return linha?.venceu;
          },
          { interval: 20 },
        )
        .toBe(true);
      await trava.liberar();
      expect(await resultado).toMatchObject(
        caso === "pedido"
          ? { ok: true, valor: { estado: "expired" } }
          : { ok: false, erro: { code: caso === "login" ? "LOGIN_RECENTE" : "AUTH" } },
      );
      expect((await db.select().from(spaces).where(eq(spaces.id, c.id)))[0]?.stewardProfileId).toBe(
        c.lia.perfil.id,
      );
      expect((await db.select().from(games).where(eq(games.id, sid)))[0]?.endedAt).toBeNull();
    } finally {
      await trava.liberar();
      await resultado;
    }
  },
);
