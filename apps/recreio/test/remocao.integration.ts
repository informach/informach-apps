import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioSpaceInvites as invites,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaceStewardshipRequests as requests,
  sessions,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { expect, it } from "vitest";
import type { AutorDaResponsabilidade } from "@/features/mundos/gestao-repository";
import { painelDeMembros, removerParticipacao } from "@/features/mundos/remocao";
import {
  proporResponsabilidade,
  responderResponsabilidade,
} from "@/features/mundos/responsabilidade-repository";
import { sairDoMundo } from "@/features/mundos/saida";
import { aceitarConvite, criarConvite, detalheDoMundo } from "@/features/mundos/service";
import { abrirMundo } from "@/features/posse/service";
import { travarEncerramentos } from "@/features/sessao-de-jogo/repository";
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
  const membroLia = vinculos.find((m) => m.profileId === lia.perfil.id);
  const membroBruno = vinculos.find((m) => m.profileId === bruno.perfil.id);
  if (!membroLia || !membroBruno) throw new Error("Vínculo ausente.");
  return { lia, bruno, id, membroLia, membroBruno, a: await autor(lia), b: await autor(bruno) };
}
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

it("remove somente o vínculo, preserva mundo/autoria e audita o ator real uma vez", async () => {
  const c = await cenario();
  const [antes] = await db.select().from(spaces).where(eq(spaces.id, c.id));
  expect(await removerParticipacao(c.a, c.id, c.membroBruno.id)).toEqual({ removeu: true });
  expect((await db.select().from(spaces).where(eq(spaces.id, c.id)))[0]).toEqual(antes);
  expect(
    (await db.select().from(members).where(eq(members.id, c.membroBruno.id)))[0],
  ).toMatchObject({
    ...c.membroBruno,
    state: "former",
    leftAt: expect.any(Date),
  });
  expect(await detalheDoMundo(c.bruno.perfil.id, c.id)).toBeNull();
  await expect(
    abrirMundo({ perfilId: c.bruno.perfil.id, jogo: "morada" }, c.id),
  ).rejects.toMatchObject({ codigo: "NAO_MEMBRO" });
  const eventos = await eventosCom("memberId", c.membroBruno.id);
  expect(eventos.filter((e) => e.eventType === "recreio.space_member_removed")).toEqual([
    {
      eventType: "recreio.space_member_removed",
      actorId: c.lia.conta.id,
      payload: {
        app: "recreio",
        spaceId: c.id,
        memberId: c.membroBruno.id,
        profileId: c.bruno.perfil.id,
      },
    },
  ]);
  expect(await removerParticipacao(c.a, c.id, c.membroBruno.id)).toEqual({ removeu: false });
  expect(await eventosCom("memberId", c.membroBruno.id)).toEqual(eventos);
});

it("revoga a proposta pendente e encerra só as partidas do removido neste mundo", async () => {
  const c = await cenario();
  const preservadas = [await partida(c.lia, c.id)];
  const sid = await partida(c.bruno, c.id);
  const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await removerParticipacao(c.a, c.id, c.membroBruno.id);
  expect(
    (await db.select().from(requests).where(eq(requests.id, proposta.pedidoId)))[0]?.state,
  ).toBe("revoked");
  const [encerrada] = await db.select().from(games).where(eq(games.id, sid));
  expect(encerrada).toMatchObject({
    endReason: "permissions_changed",
    endedAt: expect.any(Date),
    endedSeq: expect.any(Number),
  });
  expect(encerrada?.endedSeq).toBeGreaterThan(0);
  expect(await eventosCom("sessionId", sid)).toEqual([
    {
      eventType: "recreio.game_session_ended",
      actorId: c.lia.conta.id,
      payload: {
        app: "recreio",
        sessionId: sid,
        profileId: c.bruno.perfil.id,
        gameId: "morada",
        reason: "permissions_changed",
        targetId: c.bruno.conta.id,
      },
    },
  ]);
  for (const id of preservadas)
    expect((await db.select().from(games).where(eq(games.id, id)))[0]?.endedAt).toBeNull();
});

it("remover de um mundo não encerra a partida do mesmo perfil em outro mundo", async () => {
  const c = await cenario();
  const outro = await mundoDe(c.bruno);
  const sid = await partida(c.bruno, outro);
  const [antes] = await db.select().from(games).where(eq(games.id, sid));
  await removerParticipacao(c.a, c.id, c.membroBruno.id);
  expect((await db.select().from(games).where(eq(games.id, sid)))[0]).toEqual(antes);
  expect(await detalheDoMundo(c.bruno.perfil.id, outro)).not.toBeNull();
});

it.each(["suspended", "minor", "sem_perfil", "away", "no_access"] as const)(
  "remove o alvo %s preservando seu membro histórico",
  async (estado) => {
    const c = await cenario();
    if (estado === "suspended")
      await db
        .update(profiles)
        .set({ status: "suspended" })
        .where(eq(profiles.id, c.bruno.perfil.id));
    if (estado === "minor")
      await db.update(profiles).set({ kind: "minor" }).where(eq(profiles.id, c.bruno.perfil.id));
    if (estado === "sem_perfil")
      await db.delete(profiles).where(eq(profiles.id, c.bruno.perfil.id));
    if (estado === "away" || estado === "no_access")
      await db.update(members).set({ state: estado }).where(eq(members.id, c.membroBruno.id));
    expect(await removerParticipacao(c.a, c.id, c.membroBruno.id)).toEqual({ removeu: true });
    expect(
      (await db.select().from(members).where(eq(members.id, c.membroBruno.id)))[0]?.state,
    ).toBe("former");
  },
);

it.each(["membro", "alheio", "si_proprio", "outro_mundo", "ex_responsavel"] as const)(
  "recusa autoridade/escopo %s",
  async (caso) => {
    const c = await cenario();
    let a = c.a;
    let mundo = c.id;
    let alvo = c.membroBruno.id;
    if (caso === "membro") {
      a = c.b;
      alvo = c.membroLia.id;
    }
    if (caso === "alheio") a = await autor(await novoJogador());
    if (caso === "si_proprio") alvo = c.membroLia.id;
    if (caso === "outro_mundo") mundo = await mundoDe(c.lia);
    if (caso === "ex_responsavel") {
      const oferta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
      await responderResponsabilidade(c.b, c.id, oferta.pedidoId, "accepted");
    }
    await expect(removerParticipacao(a, mundo, alvo)).rejects.toMatchObject({
      code: caso === "membro" || caso === "ex_responsavel" ? "RESPONSAVEL" : "MUNDO",
    });
    expect(
      (await db.select().from(members).where(eq(members.id, c.membroBruno.id)))[0]?.state,
    ).toBe("active");
  },
);

it.each(["revogado", "vencido", "outro_login", "login_antigo", "menor", "suspenso"] as const)(
  "recusa contexto próprio %s",
  async (caso) => {
    const c = await cenario();
    let a = c.a;
    if (caso === "revogado")
      await db
        .update(devices)
        .set({ revokedAt: new Date() })
        .where(eq(devices.id, c.a.sessaoDeAparelhoId));
    if (caso === "vencido")
      await db
        .update(devices)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(devices.id, c.a.sessaoDeAparelhoId));
    if (caso === "outro_login") a = { ...a, login: { ...a.login, authSessionId: randomUUID() } };
    if (caso === "login_antigo")
      a = { ...a, login: { ...a.login, criadoEm: new Date(Date.now() - 11 * 60_000) } };
    if (caso === "menor")
      await db.update(profiles).set({ kind: "minor" }).where(eq(profiles.id, c.lia.perfil.id));
    if (caso === "suspenso")
      await db
        .update(profiles)
        .set({ status: "suspended" })
        .where(eq(profiles.id, c.lia.perfil.id));
    await expect(removerParticipacao(a, c.id, c.membroBruno.id)).rejects.toMatchObject({
      code: caso === "login_antigo" ? "LOGIN_RECENTE" : "AUTH",
    });
    expect(
      (await db.select().from(members).where(eq(members.id, c.membroBruno.id)))[0]?.state,
    ).toBe("active");
  },
);

it("falha real da auditoria reverte vínculo, proposta e partida", async () => {
  const c = await cenario();
  const sid = await partida(c.bruno, c.id);
  const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await db.execute(sql`create function audit.recusar_remocao_em_teste() returns trigger language plpgsql as $$
    begin if new.event_type='recreio.space_member_removed' then raise exception 'indisponível (teste)'; end if; return new; end $$`);
  await db.execute(
    sql`create trigger recusar_remocao_em_teste before insert on audit.events for each row execute function audit.recusar_remocao_em_teste()`,
  );
  try {
    await expect(removerParticipacao(c.a, c.id, c.membroBruno.id)).rejects.toBeInstanceOf(
      AuditPersistenceError,
    );
    expect(
      (await db.select().from(members).where(eq(members.id, c.membroBruno.id)))[0]?.state,
    ).toBe("active");
    expect(
      (await db.select().from(requests).where(eq(requests.id, proposta.pedidoId)))[0]?.state,
    ).toBe("pending");
    expect((await db.select().from(games).where(eq(games.id, sid)))[0]?.endedAt).toBeNull();
  } finally {
    await db.execute(sql`drop trigger recusar_remocao_em_teste on audit.events`);
    await db.execute(sql`drop function audit.recusar_remocao_em_teste()`);
  }
  expect(await removerParticipacao(c.a, c.id, c.membroBruno.id)).toEqual({ removeu: true });
});

it("aceitar e remover simultaneamente conservam um responsável e a história", async () => {
  const c = await cenario();
  const proposta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  const resultados = await Promise.allSettled([
    removerParticipacao(c.a, c.id, c.membroBruno.id),
    responderResponsabilidade(c.b, c.id, proposta.pedidoId, "accepted"),
  ]);
  expect(resultados[1]?.status).toBe("fulfilled");
  const [mundo] = await db.select().from(spaces).where(eq(spaces.id, c.id));
  const [bruno] = await db.select().from(members).where(eq(members.id, c.membroBruno.id));
  expect(mundo?.createdByProfileId).toBe(c.lia.perfil.id);
  if (bruno?.state === "former") {
    expect(resultados[0]).toMatchObject({ status: "fulfilled", value: { removeu: true } });
    expect(resultados[1]).toMatchObject({ status: "fulfilled", value: { estado: "revoked" } });
  } else {
    expect(resultados[0]).toMatchObject({ status: "rejected", reason: { code: "RESPONSAVEL" } });
    expect(resultados[1]).toMatchObject({ status: "fulfilled", value: { estado: "accepted" } });
  }
  expect(
    bruno?.state === "former"
      ? mundo?.stewardProfileId === c.lia.perfil.id
      : mundo?.stewardProfileId === c.bruno.perfil.id,
  ).toBe(true);
});

it("saída e remoção simultâneas encerram o vínculo sem apagar o mundo", async () => {
  const c = await cenario();
  const resultados = await Promise.allSettled([
    removerParticipacao(c.a, c.id, c.membroBruno.id),
    sairDoMundo(c.b, c.id),
  ]);
  expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);
  expect((await db.select().from(members).where(eq(members.id, c.membroBruno.id)))[0]?.state).toBe(
    "former",
  );
  expect((await db.select().from(spaces).where(eq(spaces.id, c.id)))[0]?.stewardProfileId).toBe(
    c.lia.perfil.id,
  );
});

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

it.each(["login", "aparelho"] as const)(
  "a remoção relê o prazo de %s após esperar o cursor",
  async (caso) => {
    const c = await cenario();
    const sid = await partida(c.bruno, c.id);
    const trava = await segurarCursor();
    let resultado: Promise<unknown> | undefined;
    try {
      if (caso === "login")
        await db
          .update(sessions)
          .set({ createdAt: sql`clock_timestamp()-interval '10 minutes'+interval '800ms'` })
          .where(eq(sessions.id, c.a.login.authSessionId));
      else
        await db
          .update(devices)
          .set({ expiresAt: sql`clock_timestamp()+interval '800ms'` })
          .where(eq(devices.id, c.a.sessaoDeAparelhoId));
      resultado = removerParticipacao(await autor(c.lia), c.id, c.membroBruno.id).then(
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
                ? sql`select created_at+interval '10 minutes'<=clock_timestamp() as venceu from core.sessions where id=${c.a.login.authSessionId}`
                : sql`select expires_at<=clock_timestamp() as venceu from recreio.device_sessions where id=${c.a.sessaoDeAparelhoId}`;
            const [linha] = await db.execute<{ venceu: boolean }>(condicao);
            return linha?.venceu;
          },
          { interval: 20 },
        )
        .toBe(true);
      await trava.liberar();
      expect(await resultado).toMatchObject({
        ok: false,
        erro: { code: caso === "login" ? "LOGIN_RECENTE" : "AUTH" },
      });
      expect(
        (await db.select().from(members).where(eq(members.id, c.membroBruno.id)))[0]?.state,
      ).toBe("active");
      expect((await db.select().from(games).where(eq(games.id, sid)))[0]?.endedAt).toBeNull();
    } finally {
      await trava.liberar();
      await resultado;
    }
  },
);

it("o painel é exclusivo do responsável e não expõe conteúdo, identidade de conta ou participação", async () => {
  const c = await cenario();
  const painel = await painelDeMembros(c.a, c.id, undefined);
  expect(painel).toEqual({
    mundo: { id: c.id, nome: "Casa de teste" },
    itens: [{ id: c.membroBruno.id, apelido: c.bruno.perfil.apelido, estado: "active" }],
    proximo: null,
  });
  await expect(painelDeMembros(c.b, c.id, undefined)).rejects.toMatchObject({
    code: "RESPONSAVEL",
  });
  await expect(
    painelDeMembros(await autor(await novoJogador()), c.id, undefined),
  ).rejects.toMatchObject({ code: "MUNDO" });
  await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(eq(devices.id, c.a.sessaoDeAparelhoId));
  await expect(painelDeMembros(c.a, c.id, undefined)).rejects.toMatchObject({ code: "AUTH" });
});

it("o painel conserva alvos suspensos/sem perfil e exclui os já encerrados", async () => {
  const c = await cenario();
  await db.update(profiles).set({ status: "suspended" }).where(eq(profiles.id, c.bruno.perfil.id));
  expect((await painelDeMembros(c.a, c.id, undefined)).itens).toHaveLength(1);
  await db.delete(profiles).where(eq(profiles.id, c.bruno.perfil.id));
  expect((await painelDeMembros(c.a, c.id, undefined)).itens).toEqual([
    { id: c.membroBruno.id, apelido: null, estado: "active" },
  ]);
  await removerParticipacao(c.a, c.id, c.membroBruno.id);
  expect((await painelDeMembros(c.a, c.id, undefined)).itens).toEqual([]);
});

it("pagina metadados por UUID sem repetir, misturar mundos ou listar o próprio responsável", async () => {
  const c = await cenario();
  // Histórico sintético acima do limite atual de convite; não habilita admissão de menores.
  const sinteticos = await db
    .insert(profiles)
    .values(
      Array.from({ length: 24 }, (_, i) => ({
        nickname: `Histórico ${i}`,
        kind: "minor" as const,
      })),
    )
    .returning({ id: profiles.id });
  await db.insert(members).values(
    sinteticos.map((p) => ({
      spaceId: c.id,
      profileId: p.id,
      role: "member" as const,
      state: "away" as const,
      invitedByMemberId: c.membroLia.id,
    })),
  );
  const primeira = await painelDeMembros(c.a, c.id, undefined);
  expect(primeira.itens).toHaveLength(20);
  expect(primeira.proximo).toBe(primeira.itens.at(-1)?.id);
  const segunda = await painelDeMembros(c.a, c.id, primeira.proximo);
  expect(segunda.itens).toHaveLength(5);
  expect(segunda.proximo).toBeNull();
  const ids = [...primeira.itens, ...segunda.itens].map((p) => p.id);
  expect(new Set(ids).size).toBe(25);
  expect(ids).not.toContain(c.membroLia.id);
  expect(ids).toEqual([...ids].sort());
});

it.each(["remocao", "saida"] as const)(
  "convite anterior a %s não readmite; um posterior conserva a identidade",
  async (operacao) => {
    const c = await cenario();
    const velho = await criarConvite({ perfilId: c.lia.perfil.id, jogo: null }, c.id, {
      forma: "member",
    });
    if (operacao === "remocao") await removerParticipacao(c.a, c.id, c.membroBruno.id);
    else await sairDoMundo(c.b, c.id);
    await expect(
      aceitarConvite({ perfilId: c.bruno.perfil.id }, { codigo: velho.codigo }),
    ).rejects.toMatchObject({ codigo: "CONVITE_INVALIDO" });
    const novo = await criarConvite({ perfilId: c.lia.perfil.id, jogo: null }, c.id, {
      forma: "member",
    });
    await aceitarConvite({ perfilId: c.bruno.perfil.id }, { codigo: novo.codigo });
    expect(
      (await db.select().from(members).where(eq(members.id, c.membroBruno.id)))[0],
    ).toMatchObject({ state: "active", profileId: c.bruno.perfil.id });
  },
);

it("a transferência revoga os convites pendentes do antigo responsável sem reativá-los se o papel voltar", async () => {
  const c = await cenario();
  const terceira = await novoJogador();
  const velho = await criarConvite({ perfilId: c.lia.perfil.id, jogo: null }, c.id, {
    forma: "member",
  });
  const primeira = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await responderResponsabilidade(c.b, c.id, primeira.pedidoId, "accepted");
  const segunda = await proporResponsabilidade(c.b, c.id, c.membroLia.id);
  await responderResponsabilidade(c.a, c.id, segunda.pedidoId, "accepted");
  await expect(
    aceitarConvite({ perfilId: terceira.perfil.id }, { codigo: velho.codigo }),
  ).rejects.toMatchObject({ codigo: "CONVITE_INVALIDO" });
  const novo = await criarConvite({ perfilId: c.lia.perfil.id, jogo: null }, c.id, {
    forma: "member",
  });
  await aceitarConvite({ perfilId: terceira.perfil.id }, { codigo: novo.codigo });
});

it("o aceite relê a autoridade atual do emissor mesmo em um convite legado ainda marcado como enviado", async () => {
  const c = await cenario();
  const terceira = await novoJogador();
  const velho = await criarConvite({ perfilId: c.lia.perfil.id, jogo: null }, c.id, {
    forma: "member",
  });
  const oferta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await responderResponsabilidade(c.b, c.id, oferta.pedidoId, "accepted");
  // Simula estado anterior ao novo escritor, sem depender de sua revogação.
  await db.execute(
    sql`update recreio.space_invites set state='sent' where space_id=${c.id} and invited_by_member_id=${c.membroLia.id} and state<>'accepted'`,
  );
  await expect(
    aceitarConvite({ perfilId: terceira.perfil.id }, { codigo: velho.codigo }),
  ).rejects.toMatchObject({ codigo: "CONVITE_INVALIDO" });
});

it("revogar convites por transferência conserva aceites históricos e convites de outro mundo", async () => {
  const c = await cenario();
  const outro = await mundoDe(c.lia);
  await criarConvite({ perfilId: c.lia.perfil.id, jogo: null }, c.id, { forma: "member" });
  await criarConvite({ perfilId: c.lia.perfil.id, jogo: null }, outro, { forma: "member" });
  const antes = await db.select().from(invites).where(eq(invites.spaceId, c.id));
  const aceito = antes.find((x) => x.state === "accepted");
  if (!aceito) throw new Error("Convite aceito ausente.");
  const oferta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await responderResponsabilidade(c.b, c.id, oferta.pedidoId, "accepted");
  expect((await db.select().from(invites).where(eq(invites.id, aceito.id)))[0]).toEqual(aceito);
  expect((await db.select().from(invites).where(eq(invites.spaceId, outro)))[0]?.state).toBe(
    "sent",
  );
  expect(
    (await db.select().from(invites).where(eq(invites.spaceId, c.id))).filter(
      (x) => x.state === "revoked",
    ),
  ).toHaveLength(1);
});

it("falha ao auditar a revogação dos convites reverte o aceite inteiro", async () => {
  const c = await cenario();
  await criarConvite({ perfilId: c.lia.perfil.id, jogo: null }, c.id, { forma: "member" });
  const oferta = await proporResponsabilidade(c.a, c.id, c.membroBruno.id);
  await db.execute(sql`create function audit.recusar_revogacao_convites_teste() returns trigger language plpgsql as $$
    begin if new.event_type='recreio.space_invites_revoked' then raise exception 'indisponível (teste)'; end if; return new; end $$`);
  await db.execute(
    sql`create trigger recusar_revogacao_convites_teste before insert on audit.events for each row execute function audit.recusar_revogacao_convites_teste()`,
  );
  try {
    await expect(
      responderResponsabilidade(c.b, c.id, oferta.pedidoId, "accepted"),
    ).rejects.toBeInstanceOf(AuditPersistenceError);
    expect((await db.select().from(spaces).where(eq(spaces.id, c.id)))[0]?.stewardProfileId).toBe(
      c.lia.perfil.id,
    );
    expect(
      (await db.select().from(requests).where(eq(requests.id, oferta.pedidoId)))[0]?.state,
    ).toBe("pending");
    expect(
      (await db.select().from(invites).where(eq(invites.spaceId, c.id))).filter(
        (x) => x.state === "sent",
      ),
    ).toHaveLength(1);
  } finally {
    await db.execute(sql`drop trigger recusar_revogacao_convites_teste on audit.events`);
    await db.execute(sql`drop function audit.recusar_revogacao_convites_teste()`);
  }
});

it("não inventa data de saída para readmitir um vínculo histórico sem prova", async () => {
  const c = await cenario();
  await db
    .update(members)
    .set({ state: "former", leftAt: null })
    .where(eq(members.id, c.membroBruno.id));
  const convite = await criarConvite({ perfilId: c.lia.perfil.id, jogo: null }, c.id, {
    forma: "member",
  });
  await expect(
    aceitarConvite({ perfilId: c.bruno.perfil.id }, { codigo: convite.codigo }),
  ).rejects.toMatchObject({ codigo: "CONVITE_INVALIDO" });
  expect(
    (await db.select().from(members).where(eq(members.id, c.membroBruno.id)))[0]?.leftAt,
  ).toBeNull();
});
