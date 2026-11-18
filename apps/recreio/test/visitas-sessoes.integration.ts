import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSpaceVisitInvites as invites,
  recreioSpaceMembers as members,
  recreioSessionSavePermits as permits,
  recreioGameTickets as tickets,
  recreioWorldVisitSessions as visitSessions,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import { SessaoDeJogoIdSchema } from "@informach/recreio";
import { MARGEM_DE_SALVAMENTO_S } from "@informach/recreio/contrato";
import { afterEach, expect, it, vi } from "vitest";
import {
  emitirIngresso,
  renovarSessao,
  sairDaSessao,
  trocarIngresso,
} from "@/features/sessao-de-jogo/service";
import { aceitarAmizade, emitirCodigoDeAmigo, pedirAmizade } from "@/features/social/service";
import { limparRecibosDeVisita } from "@/features/visitas/retencao-repository";
import { emitirConviteDeVisita, responderConviteDeVisita } from "@/features/visitas/service";
import { env } from "@/lib/env";
import {
  aposentarInstancias,
  CHECAGEM,
  codigoDoBanco,
  eventosCom,
  novoJogador,
  RESTRICAO,
  UNICO,
} from "./apoio";
import {
  abrirPelaRota,
  claimsDe,
  entrarNoJogo,
  mundoDe,
  novaInstancia,
  OUTRO_JOGO,
} from "./jogo-apoio";
import { referenciaSocial } from "./social-apoio";

vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "jogo-de-teste",
      nome: "Sessão visitante interna",
      rota: "/jogar/jogo-de-teste",
      capacidades: { ...real.JOGOS[0].capacidades, visitas: true, checkpoint: "servidor" },
      classificacao: { faixa: "L", descritores: [], interacoes: [] },
    },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((j) => j.id === id) ?? null,
  };
});
const modoCheckpoint = env.RECREIO_CHECKPOINT_MODE;
afterEach(() => {
  env.RECREIO_VISITS_MODE = "off";
  env.RECREIO_SOCIAL_MODE = "on";
  env.RECREIO_CHECKPOINT_MODE = modoCheckpoint;
});

async function cenario() {
  env.RECREIO_VISITS_MODE = "on";
  env.RECREIO_SOCIAL_MODE = "on";
  env.RECREIO_CHECKPOINT_MODE = "on";
  await aposentarInstancias();
  const origem = await novoJogador(),
    destino = await novoJogador(),
    autor = referenciaSocial(origem),
    alvo = referenciaSocial(destino),
    codigo = await emitirCodigoDeAmigo(alvo),
    amizade = await pedirAmizade(autor, { codigo: codigo.codigo, pedidoId: crypto.randomUUID() });
  await aceitarAmizade(alvo, amizade.pedidoId);
  const mundoId = await mundoDe(origem, OUTRO_JOGO),
    host = await entrarNoJogo(origem, OUTRO_JOGO, { suportaVisitas: true }),
    instancia = await novaInstancia(OUTRO_JOGO, 10, { suportaVisitas: true });
  expect((await abrirPelaRota(host, mundoId)).status).toBe(200);
  const posse = await instancia.cliente.reivindicarPosse(mundoId),
    presenca = await instancia.cliente.atestarPresenca({
      mundoId,
      operacao: "entrar",
      cerca: posse.cerca,
      sid: host.sid,
      perfilId: origem.perfil.id,
      chaveDeEntrada: crypto.randomUUID(),
    }),
    convite = await emitirConviteDeVisita(autor, {
      mundoId,
      perfilId: destino.perfil.id,
      presencaId: presenca.presencaId,
      pedidoId: crypto.randomUUID(),
    }),
    aceita = await responderConviteDeVisita(alvo, {
      conviteId: convite.conviteId,
      acao: "aceitar",
    });
  if (!aceita.visita) throw new Error("Concessão ausente");
  const visitaId = aceita.visita.visitaId;
  // Janela curta da fixture: mede o corte sem esperar 24 horas ou alterar o relógio.
  await db
    .update(visits)
    .set({ expiresAt: new Date(Date.now() + 120_000) })
    .where(eq(visits.id, visitaId));
  const ingresso = await emitirIngresso(destino.ator, { jogo: OUTRO_JOGO }),
    pedido = {
      ingresso: ingresso.ingresso,
      visitaId,
      suportaVisitas: true,
      suportaSalvamento: true,
      chaveDeTroca: "a".repeat(43),
    };
  return {
    origem,
    destino,
    autor,
    alvo,
    mundoId,
    host,
    instancia,
    posse,
    presenca,
    convite,
    visitaId,
    pedido,
  };
}
async function abrir(c: Awaited<ReturnType<typeof cenario>>) {
  const aberta = await trocarIngresso(c.pedido),
    sid = SessaoDeJogoIdSchema.parse(claimsDe(aberta.token).sid),
    [finalidade] = await db.select().from(visitSessions).where(eq(visitSessions.sessionId, sid));
  if (!finalidade) throw new Error("Finalidade ausente");
  return { aberta, sid, finalidade };
}

it("intenção real fixa a finalidade e o corte do token/salvamento sem admitir no mundo", async () => {
  const c = await cenario(),
    s = await abrir(c),
    [sessao] = await db.select().from(games).where(eq(games.id, s.sid)),
    [permissao] = await db.select().from(permits).where(eq(permits.sessionId, s.sid)),
    [visita] = await db.select().from(visits).where(eq(visits.id, c.visitaId));
  expect(s.aberta).toMatchObject({ visitas: true, visitaId: c.visitaId });
  expect(s.finalidade).toMatchObject({
    state: "prepared",
    spaceId: c.mundoId,
    profileId: c.destino.perfil.id,
    admittedAt: null,
    permissionUntil: null,
  });
  expect(sessao?.spaceId).toBeNull();
  expect(new Date(s.aberta.expiraEm).getTime()).toBeLessThanOrEqual(
    visita?.expiresAt.getTime() ?? 0,
  );
  expect(permissao?.cutoffAt.toISOString()).toBe(s.aberta.expiraEm);
  expect(permissao?.expiresAt.getTime()).toBe(
    new Date(s.aberta.expiraEm).getTime() + MARGEM_DE_SALVAMENTO_S * 1000,
  );
  expect(await db.select().from(members).where(eq(members.spaceId, c.mundoId))).toHaveLength(1);
});

it("recuperação só repete a mesma finalidade; omissão ou troca não reaproveitam o ingresso", async () => {
  const c = await cenario(),
    s = await abrir(c),
    repetida = await trocarIngresso(c.pedido);
  expect(claimsDe(repetida.token).sid).toBe(s.sid);
  expect(repetida.visitaId).toBe(c.visitaId);
  const { visitaId: _visita, ...semVisita } = c.pedido;
  await expect(trocarIngresso(semVisita)).rejects.toMatchObject({ codigo: "INGRESSO_INVALIDO" });
  await expect(
    trocarIngresso({ ...c.pedido, visitaId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ codigo: "INGRESSO_INVALIDO" });
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.visitId, c.visitaId)),
  ).toHaveLength(1);
  expect(
    (await eventosCom("sessionId", s.sid)).filter(
      (e) => e.eventType === "recreio.game_session_started",
    ),
  ).toHaveLength(1);
});

it("sessão legada não ganha finalidade de visita numa recuperação posterior", async () => {
  const c = await cenario(),
    { visitaId: _visita, ...pedido } = c.pedido,
    aberta = await trocarIngresso(pedido);
  await expect(trocarIngresso(c.pedido)).rejects.toMatchObject({ codigo: "INGRESSO_INVALIDO" });
  expect(aberta.visitaId).toBeUndefined();
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.visitId, c.visitaId)),
  ).toHaveLength(0);
});

it("visitante não usa protocolo de membro mesmo se a participação for criada depois", async () => {
  const c = await cenario(),
    s = await abrir(c);
  // Fixture de mudança de papel, sem alegar homologação do fluxo de adesão.
  await db.insert(members).values({
    spaceId: c.mundoId,
    profileId: c.destino.perfil.id,
    role: "member",
    state: "active",
  });
  expect((await abrirPelaRota({ token: s.aberta.token, sid: s.sid }, c.mundoId)).status).toBe(403);
  await expect(
    c.instancia.cliente.verificarEntrada({
      mundoId: c.mundoId,
      cerca: c.posse.cerca,
      sid: s.sid,
      perfilId: c.destino.perfil.id,
    }),
  ).rejects.toMatchObject({ codigo: "NAO_MEMBRO" });
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.spaceId).toBeNull();
});

it.each(["negociacao", "perfil", "modo", "host"] as const)(
  "abertura recusa %s sem consumir o ingresso nem criar finalidade",
  async (tipo) => {
    const c = await cenario();
    if (tipo === "modo") env.RECREIO_VISITS_MODE = "off";
    if (tipo === "host") await sairDaSessao(c.host.token);
    const outroIngresso =
        tipo === "perfil" ? await emitirIngresso(c.origem.ator, { jogo: OUTRO_JOGO }) : null,
      pedido = {
        ...c.pedido,
        ...(tipo === "negociacao" ? { suportaVisitas: undefined } : {}),
        ...(outroIngresso ? { ingresso: outroIngresso.ingresso } : {}),
      };
    await expect(trocarIngresso(pedido)).rejects.toMatchObject({
      codigo: expect.stringMatching(/INGRESSO_INVALIDO|ACESSO_NEGADO|ACESSO_PERDIDO/),
    });
    const jti = claimsDe(pedido.ingresso).jti;
    if (typeof jti !== "string") throw new Error("JTI ausente");
    expect((await db.select().from(tickets).where(eq(tickets.jti, jti)))[0]?.consumedAt).toBeNull();
    expect(
      await db.select().from(visitSessions).where(eq(visitSessions.visitId, c.visitaId)),
    ).toHaveLength(0);
  },
);

it("renovação conserva o corte original da visita e da margem", async () => {
  const c = await cenario(),
    s = await abrir(c),
    renovada = await renovarSessao(s.aberta.token),
    [v] = await db.select().from(visits).where(eq(visits.id, c.visitaId)),
    [p] = await db.select().from(permits).where(eq(permits.sessionId, s.sid));
  expect(new Date(renovada.expiraEm).getTime()).toBeLessThanOrEqual(v?.expiresAt.getTime() ?? 0);
  expect(p?.cutoffAt.toISOString()).toBe(renovada.expiraEm);
  expect(p?.expiresAt.getTime()).toBe(
    new Date(renovada.expiraEm).getTime() + MARGEM_DE_SALVAMENTO_S * 1000,
  );
});

it("revogação recusa renovação e encerra o SID real pelo cursor, preservando o anfitrião", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await responderConviteDeVisita(c.autor, { conviteId: c.convite.conviteId, acao: "revogar" });
  await expect(renovarSessao(s.aberta.token)).rejects.toMatchObject({ codigo: "ACESSO_PERDIDO" });
  const [encerrada] = await db.select().from(games).where(eq(games.id, s.sid));
  expect(encerrada?.endedAt).toBeInstanceOf(Date);
  expect(encerrada?.endedSeq).not.toBeNull();
  expect((await db.select().from(games).where(eq(games.id, c.host.sid)))[0]?.endedAt).toBeNull();
});

it("falha de auditoria reverte SID, intenção, permissão e consumo do ingresso", async () => {
  const c = await cenario();
  await db.execute(
    sql`create function audit.visita_sid_falha() returns trigger language plpgsql as $$ begin if new.event_type='recreio.game_session_started' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger visita_sid_falha before insert on audit.events for each row execute function audit.visita_sid_falha()`,
  );
  try {
    await expect(trocarIngresso(c.pedido)).rejects.toBeInstanceOf(AuditPersistenceError);
  } finally {
    await db.execute(sql`drop trigger visita_sid_falha on audit.events`);
    await db.execute(sql`drop function audit.visita_sid_falha()`);
  }
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.visitId, c.visitaId)),
  ).toHaveLength(0);
  expect(
    await db.select().from(games).where(eq(games.profileId, c.destino.perfil.id)),
  ).toHaveLength(0);
  expect(
    await db.select().from(permits).where(eq(permits.profileId, c.destino.perfil.id)),
  ).toHaveLength(0);
  const aberta = await trocarIngresso(c.pedido);
  expect(aberta.visitaId).toBe(c.visitaId);
});

it("presença vencida durante auditoria reverte abertura, finalidade e consumo", async () => {
  const c = await cenario();
  await db.execute(
    sql`update recreio.world_host_presences set expires_at=clock_timestamp()+interval '1 second' where id=${c.presenca.presencaId}::uuid`,
  );
  await db.execute(
    sql`create function audit.visita_sid_demora() returns trigger language plpgsql as $$ begin if new.event_type='recreio.game_session_started' then perform pg_sleep(1.3); end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger visita_sid_demora before insert on audit.events for each row execute function audit.visita_sid_demora()`,
  );
  try {
    await expect(trocarIngresso(c.pedido)).rejects.toMatchObject({ codigo: "ACESSO_NEGADO" });
  } finally {
    await db.execute(sql`drop trigger visita_sid_demora on audit.events`);
    await db.execute(sql`drop function audit.visita_sid_demora()`);
  }
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.visitId, c.visitaId)),
  ).toHaveLength(0);
  expect(
    await db.select().from(games).where(eq(games.profileId, c.destino.perfil.id)),
  ).toHaveLength(0);
});

type Vinculo = typeof visitSessions.$inferInsert;
it.each([
  "ativo_sem_prova",
  "ativo_longo",
  "ativo_sem_prazo",
  "preparado_admitido",
  "fechado_sem_data",
  "fechado_sem_motivo",
  "admissao_parcial",
  "data_anterior",
] as const)("restrição persistida recusa %s, inclusive NULL", async (tipo) => {
  const c = await cenario(),
    s = await abrir(c),
    agora = s.finalidade.createdAt,
    mudanca: Partial<Vinculo> =
      tipo === "ativo_sem_prova"
        ? { state: "active" }
        : tipo === "ativo_longo"
          ? {
              state: "active",
              admittedAt: agora,
              permissionUntil: new Date(agora.getTime() + 46_000),
            }
          : tipo === "ativo_sem_prazo"
            ? { state: "active", admittedAt: agora }
            : tipo === "preparado_admitido"
              ? { admittedAt: agora, permissionUntil: new Date(agora.getTime() + 30_000) }
              : tipo === "fechado_sem_data"
                ? { state: "closed", closeReason: "left" }
                : tipo === "fechado_sem_motivo"
                  ? { state: "closed", closedAt: agora }
                  : tipo === "admissao_parcial"
                    ? { permissionUntil: new Date(agora.getTime() + 30_000) }
                    : { updatedAt: new Date(agora.getTime() - 1) };
  expect(
    await codigoDoBanco(
      db.update(visitSessions).set(mudanca).where(eq(visitSessions.id, s.finalidade.id)),
    ),
  ).toBe(CHECAGEM);
});

it("FKs não permitem emprestar SID/perfil/mundo; uma sessão não tem duas finalidades", async () => {
  const c = await cenario(),
    s = await abrir(c),
    base: Vinculo = {
      sessionId: s.sid,
      visitId: c.visitaId,
      spaceId: c.mundoId,
      profileId: c.destino.perfil.id,
      createdAt: s.finalidade.createdAt,
      updatedAt: s.finalidade.updatedAt,
    };
  expect(await codigoDoBanco(db.insert(visitSessions).values(base))).toBe(UNICO);
  expect(RESTRICAO).toContain(
    await codigoDoBanco(
      db
        .update(visitSessions)
        .set({ sessionId: c.host.sid })
        .where(eq(visitSessions.id, s.finalidade.id)),
    ),
  );
  expect(RESTRICAO).toContain(
    await codigoDoBanco(
      db
        .update(visitSessions)
        .set({ spaceId: crypto.randomUUID() })
        .where(eq(visitSessions.id, s.finalidade.id)),
    ),
  );
  expect(RESTRICAO).toContain(await codigoDoBanco(db.delete(games).where(eq(games.id, s.sid))));
  expect(RESTRICAO).toContain(
    await codigoDoBanco(db.delete(visits).where(eq(visits.id, c.visitaId))),
  );
});

async function envelhecer(c: Awaited<ReturnType<typeof cenario>>) {
  await db.execute(
    sql`with instante as materialized (select clock_timestamp() as agora) update recreio.world_visits v set state='expired',accepted_at=accepted_at-interval '32 days',updated_at=i.agora,expires_at=expires_at-interval '32 days',ended_at=i.agora,end_reason='expired' from instante i where v.id=${c.visitaId}::uuid`,
  );
  await db.execute(
    sql`update recreio.space_visit_invites set created_at=created_at-interval '32 days',expires_at=expires_at-interval '32 days',finished_at=finished_at-interval '32 days',retain_until=retain_until-interval '32 days' where id=${c.convite.conviteId}::uuid`,
  );
}
it("retenção mantém SID aberto e apaga ponte antes da concessão, sem apagar sessão", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await envelhecer(c);
  await limparRecibosDeVisita();
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)),
  ).toHaveLength(1);
  await sairDaSessao(s.aberta.token);
  const resultado = await limparRecibosDeVisita();
  expect(resultado.sessoesDeVisitaApagadas).toBeGreaterThanOrEqual(1);
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)),
  ).toHaveLength(0);
  expect(await db.select().from(visits).where(eq(visits.id, c.visitaId))).toHaveLength(0);
  expect(await db.select().from(invites).where(eq(invites.id, c.convite.conviteId))).toHaveLength(
    0,
  );
  expect((await db.select().from(games).where(eq(games.id, s.sid)))[0]?.endedAt).toBeInstanceOf(
    Date,
  );
});

it("auditoria de expurgo recusada preserva ponte e concessão juntas", async () => {
  const c = await cenario(),
    s = await abrir(c);
  await sairDaSessao(s.aberta.token);
  await envelhecer(c);
  await db.execute(
    sql`create function audit.visita_ponte_expurgo() returns trigger language plpgsql as $$ begin if new.event_type='recreio.visit_receipts_purged' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger visita_ponte_expurgo before insert on audit.events for each row execute function audit.visita_ponte_expurgo()`,
  );
  try {
    await expect(limparRecibosDeVisita()).rejects.toBeInstanceOf(AuditPersistenceError);
  } finally {
    await db.execute(sql`drop trigger visita_ponte_expurgo on audit.events`);
    await db.execute(sql`drop function audit.visita_ponte_expurgo()`);
  }
  expect(
    await db.select().from(visitSessions).where(eq(visitSessions.id, s.finalidade.id)),
  ).toHaveLength(1);
  expect(await db.select().from(visits).where(eq(visits.id, c.visitaId))).toHaveLength(1);
  await limparRecibosDeVisita();
});
