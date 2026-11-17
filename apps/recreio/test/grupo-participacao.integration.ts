import { AuditPersistenceError } from "@informach/auth";
import { db, eq, inArray, sql } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioDeviceSessions as devices,
  recreioEntitlements as entitlements,
  recreioGroups as groups,
  recreioProfileDataKeys as keys,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  sessions,
  recreioSpaces as spaces,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { ConviteCriadoSchema } from "@informach/recreio/contrato";
import { criarRecreio } from "@informach/recreio/sdk";
import { describe, expect, it, vi } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { avaliarAcesso } from "@/features/acesso/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import {
  consultarMinhaParticipacao,
  retirarAdultoDoGrupo,
  sairDoGrupo,
  usarCoberturaPropria,
} from "@/features/grupo/participacao-service";
import { consultarGrupo } from "@/features/grupo/service";
import { aceitarConvite, criarConvite, listarMundos } from "@/features/mundos/service";
import { emitirIngresso, renovarSessao } from "@/features/sessao-de-jogo/service";
import { conceder, revogar } from "../scripts/concessoes";
import { eventosCom, type Jogador, novoJogador } from "./apoio";
import { mundoDe } from "./jogo-apoio";
import { despachar, ORIGEM } from "./rotas";

vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "grupo-preservacao",
      nome: "Progresso preservado",
      rota: "/jogar/grupo-preservacao",
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
const JOGO = "grupo-preservacao";
const quem = (p: Jogador) => ({
  perfilId: p.perfil.id,
  sessaoDeAparelhoId: p.ator.sessaoDeAparelhoId,
});
async function autor(p: Jogador): Promise<AutorNativoRecente> {
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, p.login.authSessionId));
  if (!sessao) throw new Error("Login ausente");
  return {
    ...p.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
}
async function preparar() {
  const a = await novoJogador({ comAcesso: false });
  const b = await novoJogador();
  const [grupoProprioB] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.ownerUserId, b.conta.id));
  if (!grupoProprioB) throw new Error("Grupo ausente");
  const concessao = await conceder({
    email: a.conta.email,
    tier: "family",
    dias: 30,
    motivo: "teste",
  });
  // Representa um vínculo comercial consentido. Aceite é provado em seu próprio incremento.
  await db.update(profiles).set({ groupId: concessao.grupoId }).where(eq(profiles.id, b.perfil.id));
  return {
    a,
    b,
    grupoId: concessao.grupoId,
    grupoProprioB: grupoProprioB.id,
    autorA: await autor(a),
    autorB: await autor(b),
  };
}
async function memoria(perfilId: string, mundoId: string) {
  return {
    chaves: await db.select().from(keys).where(eq(keys.profileId, perfilId)).orderBy(keys.id),
    versoes: await db
      .select()
      .from(versions)
      .where(eq(versions.profileId, perfilId))
      .orderBy(versions.id),
    conquistas: await db
      .select()
      .from(achievements)
      .where(eq(achievements.profileId, perfilId))
      .orderBy(achievements.id),
    mundo: await db.select().from(spaces).where(eq(spaces.id, mundoId)),
    membros: await db
      .select()
      .from(members)
      .where(eq(members.spaceId, mundoId))
      .orderBy(members.id),
  };
}

describe("saída comercial preserva a identidade e os dados do adulto", () => {
  it.each(["proprio", "titular"] as const)(
    "%s retira o vínculo e conserva mundo compartilhado, bytes e conquistas",
    async (origem) => {
      const r = await preparar();
      const mundoId = await mundoDe(r.b);
      const convite = ConviteCriadoSchema.parse(
        await criarConvite({ ...quem(r.b), jogo: null }, mundoId, { forma: "member" }),
      );
      await aceitarConvite(quem(r.a), { codigo: convite.codigo });
      const sdk = await criarRecreio({
        baseUrl: ORIGEM,
        jogo: JOGO,
        fetch: despachar,
        obterIngresso: async () => (await emitirIngresso(r.b.ator, { jogo: JOGO })).ingresso,
        agendar: () => () => {},
      });
      await sdk.dados.gravar("marco", new TextEncoder().encode("progresso privado"));
      await sdk.conquista("marca", "uma-vez");
      const antes = await memoria(r.b.perfil.id, mundoId);
      const concessoesAntes = await db
        .select()
        .from(entitlements)
        .where(inArray(entitlements.groupId, [r.grupoId, r.grupoProprioB]))
        .orderBy(entitlements.id);
      const resultado =
        origem === "proprio"
          ? await sairDoGrupo(r.autorB, { grupoId: r.grupoId, versao: 1 })
          : await retirarAdultoDoGrupo(r.autorA, {
              grupoId: r.grupoId,
              perfilId: r.b.perfil.id,
              versao: 1,
            });
      expect(resultado).toEqual({ alterado: true, perfilId: r.b.perfil.id, versao: 2 });
      expect(await memoria(r.b.perfil.id, mundoId)).toEqual(antes);
      const [depois] = await db.select().from(profiles).where(eq(profiles.id, r.b.perfil.id));
      expect(depois).toMatchObject({
        id: r.b.perfil.id,
        userId: r.b.conta.id,
        kind: "adult",
        groupId: null,
        coverageEnabled: false,
        policyVersion: 2,
        nickname: r.b.perfil.apelido,
      });
      expect(
        await db
          .select()
          .from(entitlements)
          .where(inArray(entitlements.groupId, [r.grupoId, r.grupoProprioB]))
          .orderBy(entitlements.id),
      ).toEqual(concessoesAntes);
      expect(antes.mundo[0]?.stewardProfileId).toBe(r.b.perfil.id);
      await expect(renovarSessao(sdk.sessao.token())).rejects.toMatchObject({
        codigo: "SESSAO_ENCERRADA",
        detalhe: { motivo: "permissions_changed" },
      });
      expect(await avaliarAcesso({ profileId: r.b.perfil.id })).toMatchObject({
        podeJogar: false,
        motivo: "perfil_sem_cobertura",
      });
      expect(await avaliarAcesso({ profileId: r.a.perfil.id })).toMatchObject({ podeJogar: true });
      const repetido =
        origem === "proprio"
          ? await sairDoGrupo(r.autorB, { grupoId: r.grupoId, versao: 1 })
          : await retirarAdultoDoGrupo(r.autorA, {
              grupoId: r.grupoId,
              perfilId: r.b.perfil.id,
              versao: 1,
            });
      expect(repetido).toEqual({ alterado: false });
      const eventos = await eventosCom("profileId", r.b.perfil.id);
      const encerramentos = eventos.filter(
        (e) =>
          e.eventType === "recreio.game_session_ended" &&
          e.payload.reason === "permissions_changed",
      );
      expect(encerramentos).toHaveLength(1);
      expect(encerramentos[0]).toMatchObject({
        actorId: origem === "proprio" ? r.b.conta.id : r.a.conta.id,
        payload: { targetId: r.b.conta.id },
      });
      expect(
        eventos.filter(
          (e) =>
            e.eventType ===
            (origem === "proprio" ? "recreio.group_member_left" : "recreio.group_member_removed"),
        ),
      ).toHaveLength(1);
      expect(await usarCoberturaPropria(r.autorB, { versao: 2 })).toEqual({
        alterado: true,
        perfilId: r.b.perfil.id,
        versao: 3,
      });
      expect(
        (await db.select().from(profiles).where(eq(profiles.id, r.b.perfil.id)))[0],
      ).toMatchObject({
        id: r.b.perfil.id,
        groupId: r.grupoProprioB,
        coverageEnabled: true,
        policyVersion: 3,
      });
      expect(await usarCoberturaPropria(r.autorB, { versao: 2 })).toEqual({ alterado: false });
      await expect(renovarSessao(sdk.sessao.token())).rejects.toMatchObject({
        codigo: "SESSAO_ENCERRADA",
        detalhe: { motivo: "permissions_changed" },
      });
      const retomado = await criarRecreio({
        baseUrl: ORIGEM,
        jogo: JOGO,
        fetch: despachar,
        obterIngresso: async () => (await emitirIngresso(r.b.ator, { jogo: JOGO })).ingresso,
        agendar: () => () => {},
      });
      expect(new TextDecoder().decode((await retomado.dados.ler("marco"))?.dados)).toBe(
        "progresso privado",
      );
      expect(await memoria(r.b.perfil.id, mundoId)).toEqual(antes);
      expect(await listarMundos({ ...quem(r.b), jogo: "morada" })).toContainEqual(
        expect.objectContaining({ id: mundoId }),
      );
      expect(
        await db
          .select()
          .from(entitlements)
          .where(inArray(entitlements.groupId, [r.grupoId, r.grupoProprioB]))
          .orderBy(entitlements.id),
      ).toEqual(concessoesAntes);
      await retomado.sessao.sair();
      await sdk.sessao.sair();
    },
  );

  it("titular pode retirar o próprio jogador e continuar administrando a cobertura dos demais", async () => {
    const r = await preparar();
    await sairDoGrupo(r.autorA, { grupoId: r.grupoId, versao: 1 });
    const estado = await consultarGrupo(r.autorA, r.grupoId);
    expect(estado.perfis.map((p) => p.perfilId)).toEqual([r.b.perfil.id]);
    expect(estado.limite).toBe(4);
    expect(await avaliarAcesso({ profileId: r.b.perfil.id })).toMatchObject({ podeJogar: true });
  });

  it("leitura do participante mostra somente seu perfil e a capacidade própria", async () => {
    const r = await preparar();
    const leitura = await consultarMinhaParticipacao(r.autorB);
    expect(leitura).toMatchObject({
      perfilId: r.b.perfil.id,
      apelido: r.b.perfil.apelido,
      grupoId: r.grupoId,
      grupoProprio: false,
      efetivo: true,
      limiteProprio: 1,
    });
    expect(Object.keys(leitura ?? {}).sort()).toEqual([
      "apelido",
      "efetivo",
      "grupoId",
      "grupoProprio",
      "limiteProprio",
      "perfilId",
      "selecionado",
      "versao",
    ]);
    expect(JSON.stringify(leitura)).not.toContain(r.a.conta.email);
    expect(JSON.stringify(leitura)).not.toContain(r.a.perfil.id);
    await db
      .update(devices)
      .set({ minorContextGeneration: crypto.randomUUID() })
      .where(eq(devices.id, r.autorB.sessaoDeAparelhoId));
    await expect(consultarMinhaParticipacao(r.autorB)).rejects.toMatchObject({ code: "AUTH" });
  });

  it("retorno é escolha explícita, com revisão atual e vaga financiada própria", async () => {
    const r = await preparar();
    await expect(usarCoberturaPropria(r.autorB, { versao: 1 })).rejects.toMatchObject({
      code: "SAIA_DO_GRUPO",
    });
    await sairDoGrupo(r.autorB, { grupoId: r.grupoId, versao: 1 });
    await expect(usarCoberturaPropria(r.autorB, { versao: 1 })).rejects.toMatchObject({
      code: "CONFLITO",
    });
    await expect(
      usarCoberturaPropria(r.autorB, { versao: 2, grupoId: r.grupoId }),
    ).rejects.toMatchObject({
      name: "ZodError",
    });
    await revogar({ email: r.b.conta.email, motivo: "teste" });
    await expect(usarCoberturaPropria(r.autorB, { versao: 2 })).rejects.toMatchObject({
      code: "SEM_COBERTURA",
    });
    expect(
      (await db.select().from(profiles).where(eq(profiles.id, r.b.perfil.id)))[0],
    ).toMatchObject({
      groupId: null,
      coverageEnabled: false,
      policyVersion: 2,
    });
  });

  it("login antigo ou contexto infantil não recupera cobertura", async () => {
    const r = await preparar();
    await sairDoGrupo(r.autorB, { grupoId: r.grupoId, versao: 1 });
    await expect(
      usarCoberturaPropria(
        {
          ...r.autorB,
          login: { ...r.autorB.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
        },
        { versao: 2 },
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    await db
      .update(devices)
      .set({ minorContextGeneration: crypto.randomUUID() })
      .where(eq(devices.id, r.autorB.sessaoDeAparelhoId));
    await expect(usarCoberturaPropria(r.autorB, { versao: 2 })).rejects.toMatchObject({
      code: "AUTH",
    });
    expect(
      (await db.select().from(profiles).where(eq(profiles.id, r.b.perfil.id)))[0],
    ).toMatchObject({
      groupId: null,
      coverageEnabled: false,
      policyVersion: 2,
    });
  });

  it("plano Individual ocupado não cede uma segunda vaga no retorno do titular", async () => {
    const r = await preparar();
    const outro = await novoJogador({ comAcesso: false });
    await sairDoGrupo(r.autorB, { grupoId: r.grupoId, versao: 1 });
    await db
      .update(profiles)
      .set({ groupId: r.grupoProprioB, coverageEnabled: true })
      .where(eq(profiles.id, outro.perfil.id));
    await expect(usarCoberturaPropria(r.autorB, { versao: 2 })).rejects.toMatchObject({
      code: "SEM_COBERTURA",
    });
    expect(
      (await db.select().from(profiles).where(eq(profiles.id, r.b.perfil.id)))[0],
    ).toMatchObject({
      groupId: null,
      coverageEnabled: false,
      policyVersion: 2,
    });
    expect(await avaliarAcesso({ profileId: outro.perfil.id })).toMatchObject({ podeJogar: true });
  });

  it.each(["recusa", "vencimento"] as const)(
    "%s durante auditoria reverte o retorno",
    async (tipo) => {
      const r = await preparar();
      await sairDoGrupo(r.autorB, { grupoId: r.grupoId, versao: 1 });
      const [antes] = await db.select().from(profiles).where(eq(profiles.id, r.b.perfil.id));
      const financeiroAntes = await db
        .select()
        .from(entitlements)
        .where(eq(entitlements.groupId, r.grupoProprioB));
      await db.execute(
        tipo === "recusa"
          ? sql`create function audit.recusar_retorno_grupo_teste() returns trigger language plpgsql as $$ begin
          if new.event_type='recreio.group_coverage_updated' then raise exception 'audit unavailable'; end if;
          return new; end $$`
          : sql`create function audit.recusar_retorno_grupo_teste() returns trigger language plpgsql as $$ begin
          if new.event_type='recreio.group_coverage_updated' then
            update recreio.entitlements set ends_at=clock_timestamp()+interval '1 second'
              where group_id=(new.payload->>'groupId')::uuid;
            perform pg_sleep(1.1);
          end if;
          return new; end $$`,
      );
      await db.execute(sql`create trigger recusar_retorno_grupo_teste before insert on audit.events
      for each row execute function audit.recusar_retorno_grupo_teste()`);
      try {
        const tentativa = usarCoberturaPropria(r.autorB, { versao: 2 });
        if (tipo === "recusa")
          await expect(tentativa).rejects.toBeInstanceOf(AuditPersistenceError);
        else await expect(tentativa).rejects.toMatchObject({ code: "SEM_COBERTURA" });
        expect((await db.select().from(profiles).where(eq(profiles.id, r.b.perfil.id)))[0]).toEqual(
          antes,
        );
        expect(
          await db.select().from(entitlements).where(eq(entitlements.groupId, r.grupoProprioB)),
        ).toEqual(financeiroAntes);
        expect(
          (await eventosCom("profileId", r.b.perfil.id)).filter(
            (e) => e.eventType === "recreio.group_coverage_updated",
          ),
        ).toHaveLength(0);
      } finally {
        await db.execute(sql`drop trigger recusar_retorno_grupo_teste on audit.events`);
        await db.execute(sql`drop function audit.recusar_retorno_grupo_teste()`);
      }
    },
  );

  it("adulto convidado não administra o grupo; retirada não atinge perfil de fora nem menor", async () => {
    const r = await preparar();
    const c = await novoJogador();
    await expect(
      retirarAdultoDoGrupo(r.autorB, {
        grupoId: r.grupoId,
        perfilId: r.a.perfil.id,
        versao: 1,
      }),
    ).rejects.toMatchObject({ code: "GRUPO" });
    expect(await sairDoGrupo(await autor(c), { grupoId: r.grupoId, versao: 1 })).toEqual({
      alterado: false,
    });
    expect(
      await retirarAdultoDoGrupo(r.autorA, {
        grupoId: r.grupoId,
        perfilId: c.perfil.id,
        versao: 1,
      }),
    ).toEqual({ alterado: false });
    const intencao = await prepararPerfilMenor(r.autorA);
    const { perfil } = await cadastrarPerfilMenor(r.autorA, {
      intencaoId: intencao.id,
      perfil: { apelido: "Protegido", avatar: "padrao" },
      nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
      assumoResponsabilidade: true,
      versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
    });
    await expect(
      retirarAdultoDoGrupo(r.autorA, {
        grupoId: r.grupoId,
        perfilId: perfil.id,
        versao: 1,
      }),
    ).rejects.toMatchObject({ code: "PERFIL" });
  });

  it("revisão antiga, login antigo e contexto infantil não retiram o vínculo", async () => {
    const r = await preparar();
    await expect(sairDoGrupo(r.autorB, { grupoId: r.grupoId, versao: 2 })).rejects.toMatchObject({
      code: "CONFLITO",
    });
    await expect(
      sairDoGrupo(
        { ...r.autorB, login: { ...r.autorB.login, criadoEm: new Date(Date.now() - 11 * 60_000) } },
        { grupoId: r.grupoId, versao: 1 },
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    await db
      .update(devices)
      .set({ minorContextGeneration: crypto.randomUUID() })
      .where(eq(devices.id, r.autorB.sessaoDeAparelhoId));
    await expect(sairDoGrupo(r.autorB, { grupoId: r.grupoId, versao: 1 })).rejects.toMatchObject({
      code: "AUTH",
    });
    expect(
      (await db.select().from(profiles).where(eq(profiles.id, r.b.perfil.id)))[0]?.groupId,
    ).toBe(r.grupoId);
  });

  it("falha de auditoria reverte vínculo e revisão", async () => {
    const r = await preparar();
    const [antes] = await db.select().from(profiles).where(eq(profiles.id, r.b.perfil.id));
    await db.execute(sql`create function audit.recusar_saida_grupo_teste() returns trigger language plpgsql as $$ begin
      if new.event_type='recreio.group_member_left' then raise exception 'audit unavailable'; end if;
      return new; end $$`);
    await db.execute(sql`create trigger recusar_saida_grupo_teste before insert on audit.events
      for each row execute function audit.recusar_saida_grupo_teste()`);
    try {
      await expect(sairDoGrupo(r.autorB, { grupoId: r.grupoId, versao: 1 })).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect((await db.select().from(profiles).where(eq(profiles.id, r.b.perfil.id)))[0]).toEqual(
        antes,
      );
    } finally {
      await db.execute(sql`drop trigger recusar_saida_grupo_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_saida_grupo_teste()`);
    }
  });

  it("saídas de grupos recíprocos conservam a ordem global dos mutexes", async () => {
    const r = await preparar();
    const [grupoB] = await db.select().from(groups).where(eq(groups.ownerUserId, r.b.conta.id));
    if (!grupoB) throw new Error("Grupo ausente");
    await db.update(profiles).set({ groupId: grupoB.id }).where(eq(profiles.id, r.a.perfil.id));
    expect(
      await Promise.all([
        sairDoGrupo(r.autorA, { grupoId: grupoB.id, versao: 1 }),
        sairDoGrupo(r.autorB, { grupoId: r.grupoId, versao: 1 }),
      ]),
    ).toMatchObject([{ alterado: true }, { alterado: true }]);
    expect((await db.select().from(groups).where(eq(groups.id, r.grupoId)))[0]?.ownerUserId).toBe(
      r.a.conta.id,
    );
    expect((await db.select().from(groups).where(eq(groups.id, grupoB.id)))[0]?.ownerUserId).toBe(
      r.b.conta.id,
    );
  });

  it("retirada e saída simultâneas confirmam uma única mudança do perfil", async () => {
    const r = await preparar();
    const resultados = await Promise.allSettled([
      sairDoGrupo(r.autorB, { grupoId: r.grupoId, versao: 1 }),
      retirarAdultoDoGrupo(r.autorA, { grupoId: r.grupoId, perfilId: r.b.perfil.id, versao: 1 }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled" && r.value.alterado)).toHaveLength(1);
    const [perfil] = await db.select().from(profiles).where(eq(profiles.id, r.b.perfil.id));
    expect(perfil).toMatchObject({ groupId: null, coverageEnabled: false, policyVersion: 2 });
    const eventos = await eventosCom("profileId", r.b.perfil.id);
    expect(
      eventos.filter((e) =>
        ["recreio.group_member_left", "recreio.group_member_removed"].includes(e.eventType),
      ),
    ).toHaveLength(1);
  });
});
