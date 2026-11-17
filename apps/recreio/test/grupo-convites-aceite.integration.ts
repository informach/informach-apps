import { AuditPersistenceError } from "@informach/auth";
import { db, eq, inArray, sql } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioDeviceSessions as devices,
  recreioEntitlements as entitlements,
  recreioGroups as groups,
  recreioGroupInvites as invites,
  recreioProfiles as profiles,
  sessions,
  users,
} from "@informach/db/schema";
import { criarRecreio } from "@informach/recreio/sdk";
import { describe, expect, it, vi } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { avaliarAcesso } from "@/features/acesso/service";
import { type AceiteDeGrupo, VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-regras";
import {
  aceitarConviteDeAdulto,
  convidarAdulto,
  revogarConviteDeAdulto,
} from "@/features/grupo/convites-service";
import { sairDoGrupo } from "@/features/grupo/participacao-service";
import { consultarGrupo } from "@/features/grupo/service";
import { listarMundos } from "@/features/mundos/service";
import { resolverAtor } from "@/features/sessao/service";
import { emitirIngresso, renovarSessao } from "@/features/sessao-de-jogo/service";
import { conceder } from "../scripts/concessoes";
import { eventosCom, loginReal, novaConta, novoJogador } from "./apoio";
import { mundoDe } from "./jogo-apoio";
import { despachar, ORIGEM } from "./rotas";

vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "grupo-aceite",
      nome: "Progresso próprio",
      rota: "/jogar/grupo-aceite",
      capacidades: {
        ...real.JOGOS[0].capacidades,
        mundos: null,
        posse: [],
        dadosDePerfil: true,
        conquistas: true,
      },
      conquistas: ["marca"],
    },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((j) => j.id === id) ?? null,
  };
});
const JOGO = "grupo-aceite";

async function nativo() {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Contexto ausente");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  return { conta, autor };
}
async function convite(a: Awaited<ReturnType<typeof nativo>>, email: string) {
  return convidarAdulto(a.autor, {
    email,
    identificacao: "Ana",
    declaroMaioridade: true,
    versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
  });
}
function pedido(conviteId: string, perfil: AceiteDeGrupo["perfil"], cobrir = true): AceiteDeGrupo {
  return {
    conviteId,
    perfil,
    cobrir,
    declaroMaioridade: true,
    versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
    entendoCobrancaPropria: true,
  };
}
async function preparar() {
  const a = await nativo();
  const b = await nativo();
  const concessao = await conceder({
    email: a.conta.email,
    tier: "family",
    dias: 30,
    motivo: "teste",
  });
  const c = await convite(a, b.conta.email);
  return {
    a,
    b,
    grupoId: concessao.grupoId,
    c,
    entrada: pedido(c.conviteId, { tipo: "novo", dados: { apelido: "Lua", avatar: "padrao" } }),
  };
}

describe("aceite privado e atômico de adultos", () => {
  it("titular sem jogador recebe adulto próprio e resposta perdida repete o mesmo recibo", async () => {
    const r = await preparar();
    const [primeiro, segundo] = await Promise.all([
      aceitarConviteDeAdulto(r.b.autor, r.entrada),
      aceitarConviteDeAdulto(r.b.autor, r.entrada),
    ]);
    expect(segundo).toEqual(primeiro);
    expect(await db.select().from(profiles).where(eq(profiles.userId, r.b.conta.id))).toHaveLength(
      1,
    );
    expect(await db.select().from(profiles).where(eq(profiles.userId, r.a.conta.id))).toHaveLength(
      0,
    );
    expect(await avaliarAcesso({ profileId: primeiro.perfilId })).toMatchObject({
      podeJogar: true,
    });
    const [recibo] = await db.select().from(invites).where(eq(invites.id, r.c.conviteId));
    expect(recibo).toMatchObject({
      state: "accepted",
      recipientEmail: null,
      recipientUserId: null,
      senderLabel: null,
      acceptedUserId: r.b.conta.id,
      acceptedProfileId: primeiro.perfilId,
      recipientDeclarationVersion: VERSAO_DA_DECLARACAO_ADULTA,
    });
    expect(
      (await eventosCom("inviteId", r.c.conviteId)).filter(
        (e) => e.eventType === "recreio.group_invite_accepted",
      ),
    ).toHaveLength(1);
    expect(JSON.stringify(await eventosCom("inviteId", r.c.conviteId))).not.toContain(
      r.b.conta.email,
    );
    await expect(consultarGrupo(r.b.autor, r.grupoId)).rejects.toMatchObject({ code: "GRUPO" });
    await sairDoGrupo(r.b.autor, { grupoId: r.grupoId, versao: 1 });
    expect(await aceitarConviteDeAdulto(r.b.autor, r.entrada)).toEqual(primeiro);
    expect(
      (await db.select().from(profiles).where(eq(profiles.id, primeiro.perfilId)))[0],
    ).toMatchObject({ groupId: null, coverageEnabled: false, policyVersion: 2 });
    await expect(
      aceitarConviteDeAdulto(r.b.autor, { ...r.entrada, cobrir: false }),
    ).rejects.toMatchObject({ code: "CONVITE" });
  });

  it("perfil existente mantém identidade e contrato próprio; não atravessa um terceiro grupo", async () => {
    const r = await preparar();
    const b = await novoJogador();
    const [sessao] = await db.select().from(sessions).where(eq(sessions.id, b.login.authSessionId));
    if (!sessao) throw new Error("Login ausente");
    const autor: AutorNativoRecente = {
      ...b.ator,
      login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
    };
    const [proprio] = await db.select().from(groups).where(eq(groups.ownerUserId, b.conta.id));
    if (!proprio) throw new Error("Grupo ausente");
    const financeiro = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.groupId, proprio.id));
    const abrir = () =>
      criarRecreio({
        baseUrl: ORIGEM,
        jogo: JOGO,
        fetch: despachar,
        obterIngresso: async () => (await emitirIngresso(b.ator, { jogo: JOGO })).ingresso,
        agendar: () => () => {},
      });
    const antigo = await abrir();
    await antigo.dados.gravar("marco", new TextEncoder().encode("progresso anterior"));
    await antigo.conquista("marca", "uma-vez");
    const conquistasAntes = await db
      .select()
      .from(achievements)
      .where(eq(achievements.profileId, b.perfil.id));
    await antigo.sessao.sair();
    const mundoId = await mundoDe(b);
    const ativo = await abrir();
    const c = await convite(r.a, b.conta.email);
    const entrada = pedido(c.conviteId, { tipo: "existente", versao: 1 });
    expect(await aceitarConviteDeAdulto(autor, entrada)).toEqual({
      aceito: true,
      perfilId: b.perfil.id,
    });
    expect((await db.select().from(profiles).where(eq(profiles.id, b.perfil.id)))[0]).toMatchObject(
      { userId: b.conta.id, nickname: b.perfil.apelido, groupId: r.grupoId, policyVersion: 2 },
    );
    expect(
      await db.select().from(entitlements).where(eq(entitlements.groupId, proprio.id)),
    ).toEqual(financeiro);
    await expect(renovarSessao(ativo.sessao.token())).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
      detalhe: { motivo: "permissions_changed" },
    });
    const retomado = await abrir();
    expect(new TextDecoder().decode((await retomado.dados.ler("marco"))?.dados)).toBe(
      "progresso anterior",
    );
    expect(
      await db.select().from(achievements).where(eq(achievements.profileId, b.perfil.id)),
    ).toEqual(conquistasAntes);
    expect(
      await listarMundos({
        perfilId: b.perfil.id,
        sessaoDeAparelhoId: b.ator.sessaoDeAparelhoId,
        jogo: "morada",
      }),
    ).toContainEqual(expect.objectContaining({ id: mundoId }));
    const terceiro = await nativo();
    const c2 = await convite(terceiro, b.conta.email);
    await expect(
      aceitarConviteDeAdulto(autor, pedido(c2.conviteId, { tipo: "existente", versao: 2 }, false)),
    ).rejects.toMatchObject({ code: "SAIA_DO_GRUPO" });
    await retomado.sessao.sair();
    await ativo.sessao.sair();
  });

  it("conta estrangeira ou novo dono do e-mail não aceita", async () => {
    const r = await preparar();
    const estranho = await nativo();
    await expect(aceitarConviteDeAdulto(estranho.autor, r.entrada)).rejects.toMatchObject({
      code: "CONVITE",
    });
    await db
      .update(users)
      .set({ email: `${crypto.randomUUID()}@example.test` })
      .where(eq(users.id, r.b.conta.id));
    await db.update(users).set({ email: r.b.conta.email }).where(eq(users.id, estranho.conta.id));
    await expect(aceitarConviteDeAdulto(estranho.autor, r.entrada)).rejects.toMatchObject({
      code: "CONVITE",
    });
    await expect(aceitarConviteDeAdulto(r.b.autor, r.entrada)).rejects.toMatchObject({
      code: "CONVITE",
    });
    expect(
      await db
        .select()
        .from(profiles)
        .where(inArray(profiles.userId, [r.b.conta.id, estranho.conta.id])),
    ).toHaveLength(0);
  });

  it("declarações, login recente e contexto nativo são obrigatórios", async () => {
    const r = await preparar();
    for (const invalida of [
      { declaroMaioridade: false },
      { entendoCobrancaPropria: false },
      { versaoDaDeclaracao: "antiga" },
    ])
      await expect(
        aceitarConviteDeAdulto(r.b.autor, { ...r.entrada, ...invalida }),
      ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      aceitarConviteDeAdulto(
        {
          ...r.b.autor,
          login: { ...r.b.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
        },
        r.entrada,
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    await db
      .update(devices)
      .set({ minorContextGeneration: crypto.randomUUID() })
      .where(eq(devices.id, r.b.autor.sessaoDeAparelhoId));
    await expect(aceitarConviteDeAdulto(r.b.autor, r.entrada)).rejects.toMatchObject({
      code: "AUTH",
    });
    expect((await db.select().from(invites).where(eq(invites.id, r.c.conviteId)))[0]?.state).toBe(
      "pending",
    );
  });

  it("convite revogado, emissor suspenso e convite vencido não criam jogador", async () => {
    const r = await preparar();
    await db.update(users).set({ banned: true }).where(eq(users.id, r.a.conta.id));
    await expect(aceitarConviteDeAdulto(r.b.autor, r.entrada)).rejects.toMatchObject({
      code: "CONVITE",
    });
    await db.update(users).set({ banned: false }).where(eq(users.id, r.a.conta.id));
    await revogarConviteDeAdulto(r.a.autor, r.c.conviteId);
    await expect(aceitarConviteDeAdulto(r.b.autor, r.entrada)).rejects.toMatchObject({
      code: "CONVITE",
    });
    const c = await convite(r.a, r.b.conta.email);
    await db
      .update(invites)
      .set({ createdAt: new Date(Date.now() - 10_000), expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(invites.id, c.conviteId));
    await expect(
      aceitarConviteDeAdulto(r.b.autor, { ...r.entrada, conviteId: c.conviteId }),
    ).rejects.toMatchObject({ code: "CONVITE" });
    expect(await db.select().from(profiles).where(eq(profiles.userId, r.b.conta.id))).toHaveLength(
      0,
    );
  });

  it("dois convites simultâneos não dão dois grupos ao mesmo jogador", async () => {
    const r = await preparar();
    const segundo = await nativo();
    const c = await convite(segundo, r.b.conta.email);
    const resultados = await Promise.allSettled([
      aceitarConviteDeAdulto(r.b.autor, { ...r.entrada, cobrir: false }),
      aceitarConviteDeAdulto(r.b.autor, { ...r.entrada, conviteId: c.conviteId, cobrir: false }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(profiles).where(eq(profiles.userId, r.b.conta.id))).toHaveLength(
      1,
    );
    expect(
      (
        await db
          .select()
          .from(invites)
          .where(inArray(invites.id, [r.c.conviteId, c.conviteId]))
      ).filter((i) => i.state === "accepted"),
    ).toHaveLength(1);
  });

  it("duas aceitações disputam uma única vaga; cadastro sem cobertura é explícito", async () => {
    const r = await preparar();
    await db
      .update(entitlements)
      .set({ tier: "individual" })
      .where(eq(entitlements.groupId, r.grupoId));
    const outro = await nativo();
    const c = await convite(r.a, outro.conta.email);
    const resultados = await Promise.allSettled([
      aceitarConviteDeAdulto(r.b.autor, r.entrada),
      aceitarConviteDeAdulto(outro.autor, { ...r.entrada, conviteId: c.conviteId }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const recusada = resultados.find((r) => r.status === "rejected");
    expect(recusada).toMatchObject({ reason: { code: "SEM_COBERTURA" } });
    const perdedor =
      resultados[0]?.status === "rejected"
        ? { autor: r.b.autor, entrada: r.entrada }
        : { autor: outro.autor, entrada: { ...r.entrada, conviteId: c.conviteId } };
    const aceito = await aceitarConviteDeAdulto(perdedor.autor, {
      ...perdedor.entrada,
      cobrir: false,
    });
    expect(await avaliarAcesso({ profileId: aceito.perfilId })).toMatchObject({
      podeJogar: false,
      motivo: "perfil_sem_cobertura",
    });
  });

  it("quatro cadastros recusam um quinto mesmo sem cobertura solicitada", async () => {
    const r = await preparar();
    const quatro = await Promise.all(
      Array.from({ length: 4 }, () => novoJogador({ comAcesso: false })),
    );
    for (const jogador of quatro)
      await db
        .update(profiles)
        .set({ groupId: r.grupoId, coverageEnabled: true })
        .where(eq(profiles.id, jogador.perfil.id));
    await expect(
      aceitarConviteDeAdulto(r.b.autor, { ...r.entrada, cobrir: false }),
    ).rejects.toMatchObject({ code: "LIMITE_DE_PERFIS" });
    expect(await db.select().from(profiles).where(eq(profiles.userId, r.b.conta.id))).toHaveLength(
      0,
    );
    expect((await db.select().from(invites).where(eq(invites.id, r.c.conviteId)))[0]?.state).toBe(
      "pending",
    );
  });

  it.each(["auditoria", "prazo", "cobertura"] as const)(
    "%s durante auditoria reverte perfil e recibo",
    async (tipo) => {
      const r = await preparar();
      if (tipo === "prazo")
        await db
          .update(invites)
          .set({ expiresAt: new Date(Date.now() + 1_000) })
          .where(eq(invites.id, r.c.conviteId));
      await db.execute(
        tipo === "auditoria"
          ? sql`create function audit.falhar_aceite_grupo_teste() returns trigger language plpgsql as $$ begin
          if new.event_type='recreio.group_invite_accepted' then raise exception 'audit unavailable'; end if; return new; end $$`
          : tipo === "cobertura"
            ? sql`create function audit.falhar_aceite_grupo_teste() returns trigger language plpgsql as $$ begin
            if new.event_type='recreio.group_invite_accepted' then
              update recreio.entitlements set ends_at=clock_timestamp()+interval '1 second' where group_id=(new.payload->>'groupId')::uuid;
              perform pg_sleep(1.1);
            end if; return new; end $$`
            : sql`create function audit.falhar_aceite_grupo_teste() returns trigger language plpgsql as $$ begin
            if new.event_type='recreio.group_invite_accepted' then perform pg_sleep(1.1); end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger falhar_aceite_grupo_teste before insert on audit.events for each row execute function audit.falhar_aceite_grupo_teste()`,
      );
      try {
        const tentativa = aceitarConviteDeAdulto(r.b.autor, r.entrada);
        if (tipo === "auditoria")
          await expect(tentativa).rejects.toBeInstanceOf(AuditPersistenceError);
        else
          await expect(tentativa).rejects.toMatchObject({
            code: tipo === "prazo" ? "CONVITE" : "SEM_COBERTURA",
          });
        expect(
          await db.select().from(profiles).where(eq(profiles.userId, r.b.conta.id)),
        ).toHaveLength(0);
        expect(
          (await db.select().from(invites).where(eq(invites.id, r.c.conviteId)))[0],
        ).toMatchObject({ state: "pending", recipientEmail: r.b.conta.email, requestHash: null });
        expect(
          (await eventosCom("inviteId", r.c.conviteId)).filter(
            (e) => e.eventType === "recreio.group_invite_accepted",
          ),
        ).toHaveLength(0);
      } finally {
        await db.execute(sql`drop trigger falhar_aceite_grupo_teste on audit.events`);
        await db.execute(sql`drop function audit.falhar_aceite_grupo_teste()`);
      }
    },
  );
});
