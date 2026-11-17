import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioSpaceMembers as members,
  sessions,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { expect, it } from "vitest";
import { administrarMundo } from "@/features/mundos/administracao";
import { painelDeAdministracaoDoMundo } from "@/features/mundos/administracao-painel-repository";
import type { AutorDaResponsabilidade } from "@/features/mundos/gestao-repository";
import { mundosSobResponsabilidadeDoMenor } from "@/features/mundos/mundos-do-menor-repository";
import { painelDeMembros } from "@/features/mundos/remocao";
import { painelDaResponsabilidade, proporTransferencia } from "@/features/mundos/responsabilidade";
import { sairDoMundo } from "@/features/mundos/saida";
import { aceitarConvite, criarConvite } from "@/features/mundos/service";
import { revogar } from "../scripts/concessoes";
import { aposentarInstancias, eventosCom, type Jogador, novoJogador, sinal } from "./apoio";
import { abrirPelaRota, entrarNoJogo, mundoDe, novaInstancia } from "./jogo-apoio";
import { pedir } from "./rotas";
import { familiaSocial } from "./social-apoio";

async function mundoDoMenor(familia: Awaited<ReturnType<typeof familiaSocial>>) {
  const [mundo] = await db
    .insert(spaces)
    .values({
      gameId: "morada",
      stewardProfileId: familia.perfil.id,
      createdByProfileId: familia.perfil.id,
      name: "Casa do perfil protegido",
      contentPolicy: "padrao",
      status: "hibernating",
    })
    .returning();
  if (!mundo) throw new Error("Mundo da fixture ausente");
  await db
    .insert(members)
    .values({ spaceId: mundo.id, profileId: familia.perfil.id, role: "steward", state: "active" });
  return mundo;
}

it("responsável sem jogador consulta, arquiva e retoma o mundo do próprio menor", async () => {
  const familia = await familiaSocial(),
    mundo = await mundoDoMenor(familia);
  const gestor = { responsavel: familia.autor, perfilId: familia.perfil.id };
  expect(
    await mundosSobResponsabilidadeDoMenor(familia.autor, familia.perfil.id, null),
  ).toMatchObject({ itens: [{ id: mundo.id }] });
  expect(await painelDeAdministracaoDoMundo(gestor, mundo.id)).toMatchObject({
    podeAlterar: true,
    perfilGeridoId: familia.perfil.id,
  });
  expect(
    await administrarMundo(gestor, { mundoId: mundo.id, versaoDaGestao: 1, operacao: "arquivar" }),
  ).toEqual({ alterou: true, revisao: 2 });
  expect(
    await administrarMundo(gestor, { mundoId: mundo.id, versaoDaGestao: 2, operacao: "retomar" }),
  ).toEqual({ alterou: true, revisao: 3 });
  const eventos = (await eventosCom("spaceId", mundo.id)).filter(
    (e) => e.eventType === "recreio.space_management_changed",
  );
  expect(eventos).toHaveLength(2);
  expect(
    eventos.every(
      (e) =>
        e.actorId === familia.conta.id &&
        e.payload.actorKind === "responsavel" &&
        e.payload.profileId === familia.perfil.id,
    ),
  ).toBe(true);
});

it("outro responsável ou aparelho infantil não herdam a gestão do mundo", async () => {
  const familia = await familiaSocial(),
    outra = await familiaSocial(),
    mundo = await mundoDoMenor(familia);
  await expect(
    mundosSobResponsabilidadeDoMenor(outra.autor, familia.perfil.id, null),
  ).rejects.toMatchObject({ code: "PERFIL" });
  await expect(
    administrarMundo(
      { responsavel: outra.autor, perfilId: familia.perfil.id },
      { mundoId: mundo.id, versaoDaGestao: 1, operacao: "arquivar" },
    ),
  ).rejects.toMatchObject({ code: "PERFIL" });
  await expect(
    administrarMundo(
      {
        responsavel: {
          ...familia.autor,
          sessaoDeAparelhoId: familia.referencia.sessaoDeAparelhoId,
        },
        perfilId: familia.perfil.id,
      },
      { mundoId: mundo.id, versaoDaGestao: 1, operacao: "arquivar" },
    ),
  ).rejects.toMatchObject({ code: "AUTH" });
  expect((await mundoAtual(mundo.id))?.managementRevision).toBe(1);
});

it("participação do menor em mundo de outro adulto não transfere a gestão ao responsável", async () => {
  const familia = await familiaSocial(),
    c = await cenario();
  await db
    .insert(members)
    .values({ spaceId: c.mundoId, profileId: familia.perfil.id, role: "member", state: "active" });
  expect(
    (await mundosSobResponsabilidadeDoMenor(familia.autor, familia.perfil.id, null)).itens,
  ).toEqual([]);
  await expect(
    painelDeAdministracaoDoMundo(
      { responsavel: familia.autor, perfilId: familia.perfil.id },
      c.mundoId,
    ),
  ).rejects.toMatchObject({ code: "RESPONSAVEL" });
  expect((await mundoAtual(c.mundoId))?.stewardProfileId).toBe(c.a.perfil.id);
});

async function autor(p: Jogador): Promise<AutorDaResponsabilidade> {
  const [login] = await db.select().from(sessions).where(eq(sessions.id, p.login.authSessionId));
  if (!login) throw new Error("Login do ensaio ausente");
  return {
    contaId: p.conta.id,
    perfilId: p.perfil.id,
    sessaoDeAparelhoId: p.ator.sessaoDeAparelhoId,
    login: { authSessionId: login.id, criadoEm: login.createdAt, expiraEm: login.expiresAt },
  };
}
async function cenario() {
  const a = await novoJogador(),
    b = await novoJogador();
  const mundoId = await mundoDe(a);
  const convite = await criarConvite(
    { perfilId: a.perfil.id, sessaoDeAparelhoId: a.ator.sessaoDeAparelhoId, jogo: null },
    mundoId,
    { forma: "member" },
  );
  await aceitarConvite(
    { perfilId: b.perfil.id, sessaoDeAparelhoId: b.ator.sessaoDeAparelhoId },
    { codigo: convite.codigo },
  );
  const [membro] = await db.select().from(members).where(eq(members.profileId, b.perfil.id));
  if (!membro) throw new Error("Participação ausente");
  return { a, b, mundoId, membro, autor: await autor(a), outroAutor: await autor(b) };
}
const mundoAtual = async (id: string) =>
  (await db.select().from(spaces).where(eq(spaces.id, id)))[0];

it("leitura e gestão nativa não dependem de cobertura nem expõem uma participação alheia", async () => {
  const c = await cenario(),
    alheio = await novoJogador({ comAcesso: false });
  await revogar({ email: c.a.conta.email, motivo: "teste_integracao" });
  await expect(painelDeAdministracaoDoMundo(c.autor, c.mundoId)).resolves.toMatchObject({
    podeAlterar: true,
    revisao: 1,
  });
  await expect(painelDeAdministracaoDoMundo(await autor(alheio), c.mundoId)).rejects.toMatchObject({
    code: "MUNDO",
  });
  await expect(painelDeAdministracaoDoMundo(c.outroAutor, c.mundoId)).rejects.toMatchObject({
    code: "RESPONSAVEL",
  });
  expect(
    await administrarMundo(c.autor, {
      mundoId: c.mundoId,
      versaoDaGestao: 1,
      operacao: "convites",
      membrosConvidam: "no",
    }),
  ).toEqual({ alterou: true, revisao: 2 });
  const antigo = {
    ...c.autor,
    login: { ...c.autor.login, criadoEm: new Date(Date.now() - 11 * 60000) },
  };
  await expect(painelDeAdministracaoDoMundo(antigo, c.mundoId)).resolves.toMatchObject({
    revisao: 2,
  });
  await expect(
    administrarMundo(antigo, { mundoId: c.mundoId, versaoDaGestao: 2, operacao: "arquivar" }),
  ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
});

it.each(["membros", "responsabilidade", "saida", "transferencia"] as const)(
  "%s espera o mundo sem conservar a trava invertida do perfil",
  async (tipo) => {
    const c = await cenario(),
      pronto = sinal<number>(),
      soltar = sinal<void>();
    const segurando = db.transaction(async (tx) => {
      await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, c.mundoId)).for("update");
      const [linha] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      if (!linha) throw new Error("PID da transação ausente");
      pronto.concluir(linha.pid);
      await soltar.promessa;
    });
    const pid = await pronto.promessa;
    const perfilId = tipo === "saida" ? c.b.perfil.id : c.a.perfil.id;
    const operacao =
      tipo === "membros"
        ? painelDeMembros(c.autor, c.mundoId, null)
        : tipo === "responsabilidade"
          ? painelDaResponsabilidade(c.autor, c.mundoId)
          : tipo === "saida"
            ? sairDoMundo(c.outroAutor, c.mundoId)
            : proporTransferencia(c.autor, c.mundoId, c.membro.id);
    const resultado = operacao.then(
      (valor) => ({ ok: true, valor }),
      (erro) => ({ ok: false, erro }),
    );
    try {
      // Observa o bloqueio real; não presume que a consulta chegou após um sleep.
      await expect
        .poll(
          async () => {
            const [estado] = await db.execute<{ aguardando: boolean }>(sql`select exists (
          select 1 from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))
        ) as aguardando`);
            return estado?.aguardando;
          },
          { timeout: 700, interval: 10 },
        )
        .toBe(true);
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select id from recreio.profiles where id=${perfilId} for update nowait`,
        );
      });
    } finally {
      soltar.concluir();
      await segurando;
    }
    expect(await resultado).toMatchObject({ ok: true });
  },
);

it("nomeação e retirada de coadmin não transferem o mundo e encerram somente a partida afetada", async () => {
  const c = await cenario();
  const sessao = await entrarNoJogo(c.b);
  await db.update(games).set({ spaceId: c.mundoId }).where(eq(games.id, sessao.sid));
  const pedido = {
    mundoId: c.mundoId,
    versaoDaGestao: 1,
    operacao: "coadministracao",
    membroId: c.membro.id,
    papel: "coadmin",
  };
  expect(await administrarMundo(c.autor, pedido)).toEqual({ alterou: true, revisao: 2 });
  expect((await db.select().from(members).where(eq(members.id, c.membro.id)))[0]?.role).toBe(
    "coadmin",
  );
  expect((await mundoAtual(c.mundoId))?.stewardProfileId).toBe(c.a.perfil.id);
  expect((await db.select().from(games).where(eq(games.id, sessao.sid)))[0]).toMatchObject({
    endReason: "permissions_changed",
    endedSeq: expect.any(Number),
  });
  await expect(administrarMundo(c.autor, pedido)).rejects.toMatchObject({ code: "CONFLITO" });
  await expect(
    administrarMundo(c.outroAutor, { mundoId: c.mundoId, versaoDaGestao: 2, operacao: "arquivar" }),
  ).rejects.toMatchObject({ code: "RESPONSAVEL" });
  expect(
    await administrarMundo(c.autor, { ...pedido, versaoDaGestao: 2, papel: "member" }),
  ).toEqual({ alterou: true, revisao: 3 });
  expect((await mundoAtual(c.mundoId))?.leaseEpoch).toBe(0);
  const eventos = (await eventosCom("spaceId", c.mundoId)).filter(
    (e) => e.eventType === "recreio.space_management_changed",
  );
  expect(eventos).toHaveLength(2);
  expect(eventos.every((e) => e.actorId === c.a.conta.id)).toBe(true);
});

it("duas alterações da mesma revisão só admitem uma, sem sobrescrever a decisão concorrente", async () => {
  const c = await cenario();
  const base = { mundoId: c.mundoId, versaoDaGestao: 1, operacao: "convites" };
  const resultados = await Promise.allSettled([
    administrarMundo(c.autor, { ...base, membrosConvidam: "no" }),
    administrarMundo(c.autor, { ...base, membrosConvidam: "yes" }),
  ]);
  expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(resultados.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "CONFLITO" },
  });
  expect((await mundoAtual(c.mundoId))?.managementRevision).toBe(2);
  expect(
    (await eventosCom("spaceId", c.mundoId)).filter(
      (e) => e.eventType === "recreio.space_management_changed",
    ),
  ).toHaveLength(1);
});

it("arquivar exige saída e liberação reais; retomar conserva fotografia, membros e cerca crescente", async () => {
  await aposentarInstancias();
  const c = await cenario(),
    sessao = await entrarNoJogo(c.a),
    host = await novaInstancia();
  expect((await abrirPelaRota(sessao, c.mundoId)).status).toBe(200);
  const posse = await host.cliente.reivindicarPosse(c.mundoId);
  const pedido = { mundoId: c.mundoId, versaoDaGestao: 1, operacao: "arquivar" };
  await expect(administrarMundo(c.autor, pedido)).rejects.toMatchObject({ code: "MUNDO_OCUPADO" });
  expect((await db.select().from(games).where(eq(games.id, sessao.sid)))[0]?.endedAt).toBeNull();
  await host.cliente.gravarFotografia({
    mundoId: c.mundoId,
    cerca: posse.cerca,
    revisaoEsperada: 0,
    diarioSeq: 0,
    tick: 10,
    schemaVersion: 1,
    tipo: "hibernate",
    bytes: new Uint8Array([1, 2, 3, 4]),
  });
  expect((await pedir("POST", "/api/sdk/v1/sessao/sair", { token: sessao.token })).status).toBe(
    200,
  );
  await expect(administrarMundo(c.autor, pedido)).rejects.toMatchObject({ code: "MUNDO_OCUPADO" });
  await host.cliente.liberarPosse({ mundoId: c.mundoId, cerca: posse.cerca, motivo: "vazio" });
  const fotosAntes = await db.select().from(snapshots).where(eq(snapshots.spaceId, c.mundoId));
  const membrosAntes = await db
    .select()
    .from(members)
    .where(eq(members.spaceId, c.mundoId))
    .orderBy(members.id);
  expect(await administrarMundo(c.autor, pedido)).toEqual({ alterou: true, revisao: 2 });
  expect(await mundoAtual(c.mundoId)).toMatchObject({
    status: "archived",
    archivedAt: expect.any(Date),
    revision: 1,
    leaseEpoch: posse.cerca,
  });
  expect(await db.select().from(snapshots).where(eq(snapshots.spaceId, c.mundoId))).toEqual(
    fotosAntes,
  );
  expect(
    await db.select().from(members).where(eq(members.spaceId, c.mundoId)).orderBy(members.id),
  ).toEqual(membrosAntes);
  expect(
    await administrarMundo(c.autor, { mundoId: c.mundoId, versaoDaGestao: 2, operacao: "retomar" }),
  ).toEqual({ alterou: true, revisao: 3 });
  expect(await mundoAtual(c.mundoId)).toMatchObject({
    status: "hibernating",
    archivedAt: null,
    revision: 1,
    leaseEpoch: posse.cerca,
  });
  const novaSessao = await entrarNoJogo(c.a);
  expect((await abrirPelaRota(novaSessao, c.mundoId)).status).toBe(200);
  const novaPosse = await host.cliente.reivindicarPosse(c.mundoId);
  expect(novaPosse.cerca).toBeGreaterThan(posse.cerca);
  expect(novaPosse.fotografia?.sha256).toBe(fotosAntes[0]?.sha256);
});

it("menor não recebe coadmin e contexto pareado não herda a autoridade do responsável", async () => {
  const c = await cenario(),
    menor = await familiaSocial();
  const [vinculo] = await db
    .insert(members)
    .values({ spaceId: c.mundoId, profileId: menor.perfil.id, role: "member", state: "active" })
    .returning();
  if (!vinculo) throw new Error("Vínculo da fixture ausente");
  await expect(
    administrarMundo(c.autor, {
      mundoId: c.mundoId,
      versaoDaGestao: 1,
      operacao: "coadministracao",
      membroId: vinculo.id,
      papel: "coadmin",
    }),
  ).rejects.toMatchObject({ code: "PARTICIPACAO" });
  const falsoAdulto = { ...c.autor, sessaoDeAparelhoId: menor.referencia.sessaoDeAparelhoId };
  await expect(
    administrarMundo(falsoAdulto, {
      mundoId: c.mundoId,
      versaoDaGestao: 1,
      operacao: "convites",
      membrosConvidam: "no",
    }),
  ).rejects.toMatchObject({ code: "AUTH" });
  expect((await mundoAtual(c.mundoId))?.managementRevision).toBe(1);
});

it.each(["revogado", "login_encerrado", "login_antigo"] as const)(
  "gestão revalida contexto nativo %s",
  async (caso) => {
    const c = await cenario();
    let atual = c.autor;
    if (caso === "revogado")
      await db
        .update(devices)
        .set({ revokedAt: new Date() })
        .where(eq(devices.id, atual.sessaoDeAparelhoId));
    if (caso === "login_encerrado")
      await db.delete(sessions).where(eq(sessions.id, atual.login.authSessionId));
    if (caso === "login_antigo")
      atual = { ...atual, login: { ...atual.login, criadoEm: new Date(Date.now() - 11 * 60000) } };
    await expect(
      administrarMundo(atual, { mundoId: c.mundoId, versaoDaGestao: 1, operacao: "arquivar" }),
    ).rejects.toMatchObject({ code: caso === "login_antigo" ? "LOGIN_RECENTE" : "AUTH" });
    expect((await mundoAtual(c.mundoId))?.status).toBe("hibernating");
  },
);

it("falha da auditoria desfaz papel, revisão e encerramento da sessão", async () => {
  const c = await cenario(),
    sessao = await entrarNoJogo(c.b);
  await db.update(games).set({ spaceId: c.mundoId }).where(eq(games.id, sessao.sid));
  await db.execute(
    sql`create function audit.recusar_gestao_mundo_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.space_management_changed' then raise exception 'audit unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger recusar_gestao_mundo_teste before insert on audit.events for each row execute function audit.recusar_gestao_mundo_teste()`,
  );
  try {
    await expect(
      administrarMundo(c.autor, {
        mundoId: c.mundoId,
        versaoDaGestao: 1,
        operacao: "coadministracao",
        membroId: c.membro.id,
        papel: "coadmin",
      }),
    ).rejects.toBeInstanceOf(AuditPersistenceError);
    expect((await mundoAtual(c.mundoId))?.managementRevision).toBe(1);
    expect((await db.select().from(members).where(eq(members.id, c.membro.id)))[0]?.role).toBe(
      "member",
    );
    expect((await db.select().from(games).where(eq(games.id, sessao.sid)))[0]?.endedAt).toBeNull();
  } finally {
    await db.execute(sql`drop trigger recusar_gestao_mundo_teste on audit.events`);
    await db.execute(sql`drop function audit.recusar_gestao_mundo_teste()`);
  }
});
