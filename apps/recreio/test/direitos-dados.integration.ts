import { createHash } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioDeviceSessions as devices,
  recreioGameSessions as gameSessions,
  recreioGroups as groups,
  recreioGuardianLinks as guardians,
  recreioProfileDataKeys as keys,
  recreioMinorPolicies as policies,
  recreioSocialPreferences as preferences,
  recreioRightsPreparations as preparations,
  recreioProfiles as profiles,
  recreioMinorProtection as protection,
  recreioSafetyReports as reports,
  recreioRestrictionReviews as reviews,
  sessions,
  recreioSpaceMembers as spaceMembers,
  recreioSpaces as spaces,
  recreioProfileWorldTraces as traces,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { capturarDadosPessoaisDaConta } from "@/features/direitos/captura-conta-repository";
import { capturarDadosPessoaisDoPerfil } from "@/features/direitos/captura-perfil-repository";
import {
  cancelarPreviaDeDireitos,
  consultarMeusDireitos,
  listarJogosComDadosPessoais,
  prepararCopiaDoCadastroPessoal,
  prepararCopiaPessoalDoJogo,
  prepararPedidoDeDireitos as prepararDireitosComId,
} from "@/features/direitos/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { criarPerfilProprio } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { eventosCom, loginReal, novaConta, sinal } from "./apoio";

/** Identificador estável pertence à operação, não ao perfil ou ao login. */
function prepararPedidoDeDireitos(autor: AutorNativoRecente, pedido: Record<string, unknown>) {
  return prepararDireitosComId(autor, { pedidoId: crypto.randomUUID(), ...pedido });
}

const JOGO = "titulo-historico-privacidade";
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function adulto(comJogador = true) {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Native session absent");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const perfil = comJogador
    ? (await criarPerfilProprio(autor, { apelido: "Pessoa privada", avatar: "padrao" })).perfil
    : null;
  return { conta, autor, perfil };
}
async function menor(autor: AutorNativoRecente) {
  const intencao = await prepararPerfilMenor(autor);
  return (
    await cadastrarPerfilMenor(autor, {
      intencaoId: intencao.id,
      perfil: { apelido: "Criança privada", avatar: "padrao" },
      nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
      assumoResponsabilidade: true,
      versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
    })
  ).perfil;
}
/** Persistência sintética explícita, sem simular pagamento ou ingresso. */
async function dados(perfilId: string, jogo = JOGO) {
  const [chave] = await db
    .insert(keys)
    .values({ profileId: perfilId, gameId: jogo, key: "progresso", revision: 2 })
    .returning();
  if (!chave) throw new Error("Data key absent");
  for (const [baseRevision, revision, kind, texto] of [
    [0, 1, "accepted", "anterior"],
    [1, 2, "accepted", "atual"],
    [0, null, "conflict", "conflito"],
  ] as const) {
    const bytes = Buffer.from(texto);
    await db.insert(versions).values({
      dataId: chave.id,
      profileId: perfilId,
      gameId: jogo,
      baseRevision,
      revision,
      kind,
      bytes,
      digest: digest(bytes),
    });
  }
  await db.insert(achievements).values({
    profileId: perfilId,
    gameId: jogo,
    achievementId: "cheguei",
    keyHash: digest(Buffer.from("chave-privada")),
  });
  return chave;
}
function proprio(a: Awaited<ReturnType<typeof adulto>>) {
  if (!a.perfil) throw new Error("Own profile absent");
  return a.perfil.id;
}
const copiar = (autor: AutorNativoRecente, perfilId: string, jogo = JOGO) =>
  prepararCopiaPessoalDoJogo(autor, { perfilId, jogo });

describe("direitos: captura pessoal consistente", () => {
  it("copia todas as páginas de denúncias próprias e recursos sem revelar denúncias contra o perfil ou decisões de outro adulto", async () => {
    const a = await adulto(),
      b = await adulto();
    const agora = new Date(),
      expiraEm = new Date(agora.getTime() + 86_400_000);
    const proprias = await db
      .insert(reports)
      .values(
        Array.from({ length: 205 }, () => ({
          reporterProfileId: proprio(a),
          targetProfileId: proprio(b),
          actorUserId: a.conta.id,
          actorKind: "jogador" as const,
          clientKey: crypto.randomUUID(),
          requestHash: "a".repeat(64),
          category: "outro" as const,
          priority: false,
          evidenceKind: "protecao" as const,
          createdAt: agora,
          updatedAt: agora,
          expiresAt: expiraEm,
        })),
      )
      .returning({ id: reports.id });
    const [contra] = await db
      .insert(reports)
      .values({
        reporterProfileId: proprio(b),
        targetProfileId: proprio(a),
        actorUserId: b.conta.id,
        actorKind: "jogador",
        clientKey: crypto.randomUUID(),
        requestHash: "b".repeat(64),
        category: "ameaca",
        priority: true,
        evidenceKind: "protecao",
        createdAt: agora,
        updatedAt: agora,
        expiresAt: expiraEm,
      })
      .returning({ id: reports.id });
    const [proprioRecurso] = await db
      .insert(reviews)
      .values({
        profileId: proprio(a),
        restrictionRevision: 1,
        clientKey: crypto.randomUUID(),
        requestHash: "c".repeat(64),
        actorUserId: a.conta.id,
        actorKind: "titular",
        createdAt: agora,
        expiresAt: expiraEm,
      })
      .returning({ id: reviews.id });
    const [alheio] = await db
      .insert(reviews)
      .values({
        profileId: proprio(a),
        restrictionRevision: 2,
        clientKey: crypto.randomUUID(),
        requestHash: "d".repeat(64),
        actorUserId: b.conta.id,
        actorKind: "responsavel",
        state: "resolvido",
        decision: "manter",
        createdAt: agora,
        resolvedAt: agora,
        expiresAt: expiraEm,
      })
      .returning({ id: reviews.id });
    if (!contra || !proprioRecurso || !alheio) throw new Error("Safety fixtures absent");
    for (const captura of [
      await capturarDadosPessoaisDoPerfil(a.autor, proprio(a)),
      await capturarDadosPessoaisDaConta(a.autor),
    ]) {
      try {
        const texto = captura.bytes.toString("utf8");
        expect(
          texto.split("\n").filter((l) => l.startsWith('{"tipo":"denuncia_propria"')),
        ).toHaveLength(205);
        for (const propria of proprias) expect(texto).toContain(propria.id);
        expect(texto).toContain(proprioRecurso.id);
        for (const privado of [
          contra.id,
          alheio.id,
          proprio(b),
          b.conta.id,
          b.conta.email,
          "targetProfileId",
          "moderatorUserId",
          "evidenceKind",
          "requestHash",
          "a".repeat(64),
          "b".repeat(64),
          "c".repeat(64),
          "d".repeat(64),
        ])
          expect(texto).not.toContain(privado);
      } finally {
        captura.bytes.fill(0);
      }
    }
    await expect(capturarDadosPessoaisDoPerfil(b.autor, proprio(a))).rejects.toMatchObject({
      code: "PERFIL",
    });
  });
  it("a conta sem jogador conserva seus atos de segurança com perfil já desvinculado, sem herdar atos de terceiros", async () => {
    const a = await adulto(false),
      b = await adulto();
    const agora = new Date(),
      expiraEm = new Date(agora.getTime() + 86_400_000);
    const [propria] = await db
      .insert(reports)
      .values({
        reporterProfileId: null,
        targetProfileId: proprio(b),
        actorUserId: a.conta.id,
        actorKind: "responsavel",
        clientKey: crypto.randomUUID(),
        requestHash: "e".repeat(64),
        category: "outro",
        priority: false,
        evidenceKind: "protecao",
        createdAt: agora,
        updatedAt: agora,
        expiresAt: expiraEm,
      })
      .returning({ id: reports.id });
    const [alheia] = await db
      .insert(reports)
      .values({
        reporterProfileId: proprio(b),
        actorUserId: b.conta.id,
        actorKind: "jogador",
        clientKey: crypto.randomUUID(),
        requestHash: "f".repeat(64),
        category: "ameaca",
        priority: true,
        evidenceKind: "protecao",
        createdAt: agora,
        updatedAt: agora,
        expiresAt: expiraEm,
      })
      .returning({ id: reports.id });
    if (!propria || !alheia) throw new Error("Safety fixtures absent");
    const captura = await capturarDadosPessoaisDaConta(a.autor);
    try {
      const texto = captura.bytes.toString("utf8");
      expect(texto).toContain(propria.id);
      expect(texto).toContain('"registradaPorMim":true');
      for (const privado of [
        alheia.id,
        proprio(b),
        b.conta.id,
        b.conta.email,
        "e".repeat(64),
        "f".repeat(64),
      ])
        expect(texto).not.toContain(privado);
    } finally {
      captura.bytes.fill(0);
    }
  });
  it("inclui jogos históricos e todas as páginas próprias sem exportar credenciais ou conteúdo compartilhado", async () => {
    const a = await adulto(),
      b = await adulto();
    if (!a.perfil || !b.perfil) throw new Error("Profiles absent");
    await dados(proprio(a));
    await dados(proprio(b), "jogo-privado-de-outro-adulto");
    const mundos = await db
      .insert(spaces)
      .values(
        Array.from({ length: 205 }, () => ({
          gameId: "morada",
          name: "Nome privado de mundo compartilhado",
          contentPolicy: "family" as const,
          createdByProfileId: proprio(b),
          stewardProfileId: proprio(b),
        })),
      )
      .returning({ id: spaces.id });
    await db.insert(spaceMembers).values(
      mundos.map((m) => ({
        spaceId: m.id,
        profileId: proprio(a),
        role: "member" as const,
        state: "active" as const,
        participation: "minha participação",
      })),
    );
    const [sid] = await db
      .insert(gameSessions)
      .values({
        profileId: proprio(a),
        deviceSessionId: a.autor.sessaoDeAparelhoId,
        gameId: JOGO,
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning({ id: gameSessions.id });
    if (!sid) throw new Error("Game session absent");
    const captura = await capturarDadosPessoaisDoPerfil(a.autor, a.perfil.id);
    try {
      const texto = captura.bytes.toString("utf8");
      expect(texto.split("\n").filter((l) => l.startsWith('{"tipo":"participacao"'))).toHaveLength(
        205,
      );
      expect(texto).toContain(JOGO);
      expect(texto).toContain('"estado":"conflict"');
      expect(texto).toContain('"conteudo":"YXR1YWw="');
      for (const privado of [
        a.conta.id,
        a.conta.email,
        b.conta.id,
        b.conta.email,
        proprio(b),
        sid.id,
        a.autor.sessaoDeAparelhoId,
        a.autor.login.authSessionId,
        "Nome privado de mundo compartilhado",
        "jogo-privado-de-outro-adulto",
        "keyHash",
        "pinHash",
        '"cursor"',
      ])
        expect(texto).not.toContain(privado);
      expect(captura).toMatchObject({ perfilId: proprio(a), responsabilidadeId: null });
      await expect(capturarDadosPessoaisDoPerfil(b.autor, a.perfil.id)).rejects.toMatchObject({
        code: "PERFIL",
      });
    } finally {
      captura.bytes.fill(0);
    }
  });
  it("pode capturar menor sem jogador pagante e nega contexto infantil por chamada direta", async () => {
    const a = await adulto(false),
      perfil = await menor(a.autor);
    const captura = await capturarDadosPessoaisDoPerfil(a.autor, perfil.id);
    try {
      expect(captura.responsabilidadeId).not.toBeNull();
      expect(captura.bytes.toString("utf8")).toContain('"tipo":"minor"');
    } finally {
      captura.bytes.fill(0);
    }
    await db
      .update(devices)
      .set({ minorContextGeneration: crypto.randomUUID() })
      .where(eq(devices.id, a.autor.sessaoDeAparelhoId));
    await expect(capturarDadosPessoaisDoPerfil(a.autor, perfil.id)).rejects.toMatchObject({
      code: "AUTH",
    });
  });
});

describe("direitos: recorte pessoal por jogo sem autoridade de gameplay", () => {
  it("copia cadastro do adulto próprio, sem credenciais ou dados do responsável comercial", async () => {
    const a = await adulto(),
      b = await adulto();
    await db
      .insert(preferences)
      .values({ profileId: proprio(a), presenceMode: "invisible" })
      .onConflictDoUpdate({ target: preferences.profileId, set: { presenceMode: "invisible" } });
    const copia = await prepararCopiaDoCadastroPessoal(a.autor, { perfilId: proprio(a) });
    expect(copia).toMatchObject({
      formato: "recreio-cadastro-pessoal-v1",
      perfil: { id: proprio(a), tipo: "adult", apelido: "Pessoa privada" },
      nascimento: null,
      responsabilidadeDeclarada: null,
      supervisao: null,
      protecao: null,
      preferenciaSocial: { presenca: "invisible" },
    });
    for (const privado of [
      a.conta.id,
      a.conta.email,
      b.conta.id,
      proprio(b),
      "authSessionId",
      "token",
      "generation",
    ])
      expect(JSON.stringify(copia)).not.toContain(privado);
    await expect(
      prepararCopiaDoCadastroPessoal(b.autor, { perfilId: proprio(a) }),
    ).rejects.toMatchObject({ code: "PERFIL" });
  });

  it("responsável copia nascimento/supervisão do menor sem exportar PIN ou gerações", async () => {
    const a = await adulto(false),
      b = await adulto();
    const perfil = await menor(a.autor);
    const [vinculo] = await db.select().from(guardians).where(eq(guardians.profileId, perfil.id));
    if (!vinculo) throw new Error("Guardian absent");
    const pinHash = `scrypt-v1$${"A".repeat(22)}$${"B".repeat(43)}`;
    await db
      .insert(protection)
      .values({ profileId: perfil.id, guardianLinkId: vinculo.id, pinHash })
      .onConflictDoUpdate({ target: protection.profileId, set: { pinHash } });
    await db
      .insert(policies)
      .values({
        profileId: perfil.id,
        dailyMinutes: 30,
        weeklySchedule: [{ diaDaSemana: 2, inicioMinuto: 600, fimMinuto: 660 }],
      })
      .onConflictDoUpdate({
        target: policies.profileId,
        set: {
          dailyMinutes: 30,
          weeklySchedule: [{ diaDaSemana: 2, inicioMinuto: 600, fimMinuto: 660 }],
        },
      });
    const copia = await prepararCopiaDoCadastroPessoal(a.autor, { perfilId: perfil.id });
    expect(copia).toMatchObject({
      nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
      responsabilidadeDeclarada: { versao: VERSAO_DA_RESPONSABILIDADE },
      protecao: { pinDefinido: true },
      supervisao: {
        configuracao: {
          minutosPorDia: 30,
          horarios: [{ diaDaSemana: 2, inicioMinuto: 600, fimMinuto: 660 }],
        },
      },
    });
    for (const privado of [
      pinHash,
      "accessGeneration",
      "pinGeneration",
      "guardianUserId",
      a.conta.id,
      b.conta.id,
      vinculo.id,
    ])
      expect(JSON.stringify(copia)).not.toContain(privado);
    await expect(
      prepararCopiaDoCadastroPessoal(b.autor, { perfilId: perfil.id }),
    ).rejects.toMatchObject({ code: "PERFIL" });
    const eventos = (await eventosCom("profileId", perfil.id)).filter(
      (e) => e.eventType === "recreio.profile_record_copy_prepared",
    );
    expect(eventos).toHaveLength(1);
    for (const privado of ["Criança privada", "inicioMinuto", "birthMonth", pinHash])
      expect(JSON.stringify(eventos)).not.toContain(privado);
  });

  it("cadastro recusa configuração inválida e não fabrica supervisão ausente", async () => {
    const a = await adulto(false);
    const perfil = await menor(a.autor);
    await db.delete(policies).where(eq(policies.profileId, perfil.id));
    expect(
      (await prepararCopiaDoCadastroPessoal(a.autor, { perfilId: perfil.id })).supervisao,
    ).toBeNull();
    await db.insert(policies).values({
      profileId: perfil.id,
      weeklySchedule: [{ diaDaSemana: 8, inicioMinuto: 600, fimMinuto: 660 }],
    });
    await expect(
      prepararCopiaDoCadastroPessoal(a.autor, { perfilId: perfil.id }),
    ).rejects.toThrow();
    expect(
      (await eventosCom("profileId", perfil.id)).filter(
        (e) => e.eventType === "recreio.profile_record_copy_prepared",
      ),
    ).toHaveLength(1);
  });

  it("descobre fontes históricas por páginas sem duplicar jogos ou omitir conquistas sem saves", async () => {
    const a = await adulto(),
      b = await adulto();
    const ids = Array.from({ length: 25 }, (_, i) => `historico-${String(i).padStart(2, "0")}`);
    await db
      .insert(keys)
      .values(ids.map((gameId) => ({ profileId: proprio(a), gameId, key: "estado" })));
    await db.insert(achievements).values([
      {
        profileId: proprio(a),
        gameId: ids[0] ?? "historico-00",
        achievementId: "cheguei",
        keyHash: digest(Buffer.from("uma")),
      },
      {
        profileId: proprio(a),
        gameId: "somente-conquistas",
        achievementId: "cheguei",
        keyHash: digest(Buffer.from("outra")),
      },
      {
        profileId: proprio(b),
        gameId: "jogo-alheio",
        achievementId: "cheguei",
        keyHash: digest(Buffer.from("terceira")),
      },
    ]);
    const primeira = await listarJogosComDadosPessoais(a.autor, { perfilId: proprio(a) });
    expect(primeira.itens).toEqual(ids.slice(0, 20));
    expect(primeira.proximo).toBe(ids[19]);
    const segunda = await listarJogosComDadosPessoais(a.autor, {
      perfilId: proprio(a),
      apos: primeira.proximo,
    });
    expect(segunda.itens).toEqual([...ids.slice(20), "somente-conquistas"]);
    expect(segunda.proximo).toBeNull();
    await expect(
      listarJogosComDadosPessoais(b.autor, { perfilId: proprio(a) }),
    ).rejects.toMatchObject({ code: "PERFIL" });
    const eventos = (await eventosCom("profileId", proprio(a))).filter(
      (e) => e.eventType === "recreio.profile_game_inventory_viewed",
    );
    expect(eventos).toHaveLength(2);
    expect(eventos[0]?.payload).toMatchObject({ gameCount: 20, hasMore: true });
    expect(JSON.stringify(eventos)).not.toContain("historico-00");
  });

  it("inventário exige login recente e não oculta identificador legado incompatível", async () => {
    const a = await adulto();
    await db
      .insert(keys)
      .values({ profileId: proprio(a), gameId: "LEGADO_FORA_DO_FORMATO", key: "estado" });
    await expect(listarJogosComDadosPessoais(a.autor, { perfilId: proprio(a) })).rejects.toThrow();
    await expect(
      listarJogosComDadosPessoais(
        { ...a.autor, login: { ...a.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) } },
        { perfilId: proprio(a) },
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    expect(
      (await eventosCom("profileId", proprio(a))).filter(
        (e) => e.eventType === "recreio.profile_game_inventory_viewed",
      ),
    ).toEqual([]);
  });

  it("sem assinatura, preserva atuais/anteriores/conflitos e checksum, inclusive título fora do catálogo", async () => {
    const a = await adulto(),
      b = await adulto();
    await dados(proprio(a));
    await dados(proprio(a), "outro-titulo-historico");
    await dados(proprio(b));
    const copia = await copiar(a.autor, proprio(a));
    expect(copia).toMatchObject({
      formato: "recreio-dados-pessoais-do-jogo-v1",
      perfilId: proprio(a),
      jogo: JOGO,
      escopo: "progresso-versoes-conflitos-conquistas",
      conquistas: [{ id: "cheguei" }],
    });
    expect(copia.chaves).toHaveLength(1);
    expect(copia.chaves[0]?.revisaoAtual).toBe(2);
    expect(copia.chaves[0]?.versoes).toHaveLength(3);
    expect(copia.chaves[0]?.versoes.filter((v) => v.estado === "conflict")).toHaveLength(1);
    for (const v of copia.chaves[0]?.versoes ?? [])
      expect(digest(Buffer.from(v.conteudo, "base64"))).toBe(v.sha256);
    expect(Number.isFinite(Date.parse(copia.conferidoEm))).toBe(true);
    for (const privado of [
      a.conta.id,
      b.conta.id,
      a.conta.email,
      proprio(b),
      "keyHash",
      "outro-titulo-historico",
      "Pessoa privada",
    ])
      expect(JSON.stringify(copia)).not.toContain(privado);
    const eventos = (await eventosCom("profileId", proprio(a))).filter(
      (e) => e.eventType === "recreio.profile_game_copy_prepared",
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      actorId: a.conta.id,
      payload: {
        app: "recreio",
        profileId: proprio(a),
        gameId: JOGO,
        keyCount: 1,
        versionCount: 3,
        achievementCount: 1,
      },
    });
    for (const privado of ["progresso", "conteudo", "sha256", a.conta.email])
      expect(JSON.stringify(eventos)).not.toContain(privado);
  });

  it("responsável sem jogador copia o próprio menor; pagante e outro adulto não herdam o direito", async () => {
    const a = await adulto(false),
      b = await adulto();
    const perfil = await menor(a.autor);
    await dados(perfil.id);
    expect((await copiar(a.autor, perfil.id)).chaves[0]?.versoes).toHaveLength(3);
    const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, b.conta.id));
    if (!grupo) throw new Error("Group absent");
    await db.update(profiles).set({ groupId: grupo.id }).where(eq(profiles.id, perfil.id));
    await expect(copiar(b.autor, perfil.id)).rejects.toMatchObject({ code: "PERFIL" });
    await expect(copiar(a.autor, proprio(b))).rejects.toMatchObject({ code: "PERFIL" });
  });

  it("mudança de responsável retira o direito antigo e mantém o progresso", async () => {
    const a = await adulto(false),
      b = await adulto(false);
    const pa = await menor(a.autor),
      pb = await menor(b.autor);
    await dados(pa.id);
    const [vb] = await db.select().from(guardians).where(eq(guardians.profileId, pb.id));
    if (!vb) throw new Error("Guardian absent");
    await db
      .update(guardians)
      .set({ guardianUserId: b.conta.id, declarationId: vb.declarationId })
      .where(eq(guardians.profileId, pa.id));
    await expect(copiar(a.autor, pa.id)).rejects.toMatchObject({ code: "PERFIL" });
    expect((await copiar(b.autor, pa.id)).chaves).toHaveLength(1);
  });

  it("perfil suspenso conserva a cópia e jogo sem dados devolve recorte vazio explícito", async () => {
    const a = await adulto();
    await dados(proprio(a));
    await db
      .update(profiles)
      .set({ status: "suspended", coverageEnabled: false })
      .where(eq(profiles.id, proprio(a)));
    expect((await copiar(a.autor, proprio(a))).chaves).toHaveLength(1);
    const vazio = await copiar(a.autor, proprio(a), "sem-dados");
    expect(vazio.chaves).toEqual([]);
    expect(vazio.conquistas).toEqual([]);
  });

  it.each([
    "login antigo",
    "login divergente",
    "login removido",
    "aparelho revogado",
    "pareado",
    "contexto infantil",
  ] as const)("recusa %s", async (caso) => {
    const a = await adulto();
    await dados(proprio(a));
    const autor = { ...a.autor, login: { ...a.autor.login } };
    if (caso === "login antigo") autor.login.criadoEm = new Date(Date.now() - 11 * 60_000);
    if (caso === "login divergente") autor.login.authSessionId = crypto.randomUUID();
    if (caso === "login removido")
      await db.delete(sessions).where(eq(sessions.id, autor.login.authSessionId));
    if (caso === "aparelho revogado")
      await db
        .update(devices)
        .set({ revokedAt: new Date() })
        .where(eq(devices.id, autor.sessaoDeAparelhoId));
    if (caso === "pareado")
      await db
        .update(devices)
        .set({ kind: "paired_device" })
        .where(eq(devices.id, autor.sessaoDeAparelhoId));
    if (caso === "contexto infantil")
      await db
        .update(devices)
        .set({ minorContextGeneration: crypto.randomUUID() })
        .where(eq(devices.id, autor.sessaoDeAparelhoId));
    await expect(copiar(autor, proprio(a))).rejects.toMatchObject({
      code: caso === "login antigo" ? "LOGIN_RECENTE" : "AUTH",
    });
    expect(
      (await eventosCom("profileId", proprio(a))).filter(
        (e) => e.eventType === "recreio.profile_game_copy_prepared",
      ),
    ).toEqual([]);
  });

  it.each(["checksum", "atual ausente", "chaves excessivas"] as const)(
    "não entrega cópia parcial por %s",
    async (caso) => {
      const a = await adulto();
      const chave = await dados(proprio(a));
      if (caso === "checksum")
        await db
          .update(versions)
          .set({ bytes: Buffer.from("alterado") })
          .where(eq(versions.dataId, chave.id));
      if (caso === "atual ausente")
        await db
          .delete(versions)
          .where(and(eq(versions.dataId, chave.id), eq(versions.revision, 2)));
      if (caso === "chaves excessivas")
        await db.insert(keys).values(
          Array.from({ length: 16 }, (_, i) => ({
            profileId: proprio(a),
            gameId: JOGO,
            key: `extra-${i}`,
          })),
        );
      await expect(copiar(a.autor, proprio(a))).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    },
  );

  it("falha de auditoria impede devolver os bytes", async () => {
    const a = await adulto();
    await dados(proprio(a));
    await db.execute(
      sql`create function audit.recusar_copia_teste() returns trigger language plpgsql as $$ begin if new.event_type = 'recreio.profile_game_copy_prepared' then raise exception 'auditoria indisponivel'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_copia_teste before insert on audit.events for each row execute function audit.recusar_copia_teste()`,
    );
    try {
      await expect(copiar(a.autor, proprio(a))).rejects.toBeInstanceOf(AuditPersistenceError);
    } finally {
      await db.execute(sql`drop trigger recusar_copia_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_copia_teste()`);
    }
  });

  it("logout enquanto espera o escritor não entrega progresso nem evento", async () => {
    const a = await adulto();
    await dados(proprio(a));
    const pronto = sinal<number>(),
      liberar = sinal<void>();
    const trava = db.transaction(async (tx) => {
      await tx.execute(sql`set local transaction_timeout='15s'`);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`dados-perfil:${proprio(a)}:${JOGO}`}, 0))`,
      );
      const [linha] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      if (!linha) throw new Error("Connection absent");
      pronto.concluir(linha.pid);
      await liberar.promessa;
    });
    void trava.catch(pronto.recusar);
    const pid = await pronto.promessa;
    const resultado = copiar(a.autor, proprio(a)).then(
      (valor) => ({ ok: true, valor }),
      (erro: unknown) => ({ ok: false, erro }),
    );
    try {
      await expect
        .poll(
          async () => {
            const [linha] = await db.execute<{ esperando: boolean }>(
              sql`select exists(select 1 from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))) as esperando`,
            );
            return linha?.esperando;
          },
          { interval: 20 },
        )
        .toBe(true);
      await db.delete(sessions).where(eq(sessions.id, a.autor.login.authSessionId));
      liberar.concluir(undefined);
      await trava;
      expect(await resultado).toMatchObject({ ok: false, erro: { code: "AUTH" } });
      expect(
        (await eventosCom("profileId", proprio(a))).filter(
          (e) => e.eventType === "recreio.profile_game_copy_prepared",
        ),
      ).toEqual([]);
    } finally {
      liberar.concluir(undefined);
      await trava;
      await resultado;
    }
  });
});

describe("direitos: preparação persistida anterior ao consentimento", () => {
  it("prepara o próprio perfil suspenso sem assinatura e sem alterar seus dados", async () => {
    const a = await adulto();
    await dados(proprio(a));
    await db
      .update(profiles)
      .set({ status: "suspended", coverageEnabled: false })
      .where(eq(profiles.id, proprio(a)));
    const previa = await prepararPedidoDeDireitos(a.autor, {
      tipo: "retirar_perfil",
      perfis: [proprio(a)],
    });
    expect(previa.plano).toMatchObject({
      tipo: "retirar_perfil",
      contaId: a.conta.id,
      perfis: [{ id: proprio(a), tipo: "adult", responsabilidadeId: null }],
      mundos: [],
      identidadeGlobalPreservada: true,
      financeiroSeparado: true,
    });
    expect(digest(Buffer.from(JSON.stringify(previa.plano)))).toBe(previa.planoSha256);
    const [registro] = await db
      .select()
      .from(preparations)
      .where(eq(preparations.id, previa.preparacaoId));
    expect(registro?.plan).toEqual(previa.plano);
    expect(registro?.cancelledAt).toBeNull();
    expect((await copiar(a.autor, proprio(a))).chaves).toHaveLength(1);
    expect(
      (await eventosCom("preparationId", previa.preparacaoId)).map((e) => e.eventType),
    ).toEqual(["recreio.rights_prepared"]);
  });

  it("admite conta sem jogador e encerramento de escopo vazio explícito", async () => {
    const a = await adulto(false);
    const previa = await prepararPedidoDeDireitos(a.autor, { tipo: "encerrar_conta", perfis: [] });
    expect(previa.plano.perfis).toEqual([]);
    expect(previa.plano.mundos).toEqual([]);
    const [registro] = await db
      .select()
      .from(preparations)
      .where(eq(preparations.id, previa.preparacaoId));
    expect(registro && registro.expiresAt.getTime() - registro.createdAt.getTime()).toBe(
      30 * 60_000,
    );
  });

  it("responsável sem jogador prepara o menor; outro pagante não ganha essa autoridade", async () => {
    const a = await adulto(false),
      b = await adulto();
    const p = await menor(a.autor);
    const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, b.conta.id));
    if (!grupo) throw new Error("Payer group absent");
    await db.update(profiles).set({ groupId: grupo.id }).where(eq(profiles.id, p.id));
    expect(
      (await prepararPedidoDeDireitos(a.autor, { tipo: "retirar_perfil", perfis: [p.id] })).plano
        .perfis[0],
    ).toMatchObject({ id: p.id, tipo: "minor", responsabilidadeId: expect.any(String) });
    await expect(
      prepararPedidoDeDireitos(b.autor, { tipo: "retirar_perfil", perfis: [p.id] }),
    ).rejects.toMatchObject({ code: "PERFIL" });
  });

  it("não prepara outro adulto e exige todo o escopo pessoal no encerramento", async () => {
    const a = await adulto(),
      b = await adulto();
    const p = await menor(a.autor);
    await expect(
      prepararPedidoDeDireitos(a.autor, { tipo: "retirar_perfil", perfis: [proprio(b)] }),
    ).rejects.toMatchObject({ code: "PERFIL" });
    await expect(
      prepararPedidoDeDireitos(a.autor, { tipo: "encerrar_conta", perfis: [proprio(a)] }),
    ).rejects.toMatchObject({ code: "ESCOPO" });
    const previa = await prepararPedidoDeDireitos(a.autor, {
      tipo: "encerrar_conta",
      perfis: [proprio(a), p.id].sort(),
    });
    expect(previa.plano.perfis).toHaveLength(2);
  });

  it("inclui participação anterior e autoria sem copiar nome, resumo ou identidade de terceiros", async () => {
    const a = await adulto(),
      b = await adulto();
    const [mundo] = await db
      .insert(spaces)
      .values({
        gameId: JOGO,
        createdByProfileId: proprio(a),
        stewardProfileId: proprio(b),
        name: "Nome privado",
        contentPolicy: "livre",
        summary: { segredo: "não exportar" },
      })
      .returning();
    if (!mundo) throw new Error("World absent");
    await db.insert(spaceMembers).values([
      {
        spaceId: mundo.id,
        profileId: proprio(a),
        role: "member",
        state: "former",
        leftAt: new Date(),
      },
      { spaceId: mundo.id, profileId: proprio(b), role: "steward", state: "active" },
    ]);
    const previa = await prepararPedidoDeDireitos(a.autor, {
      tipo: "retirar_perfil",
      perfis: [proprio(a)],
    });
    expect(previa.plano.mundos).toEqual([
      {
        id: mundo.id,
        jogo: JOGO,
        revisao: 0,
        diario: 0,
        gestao: 1,
        cerca: 0,
        estado: "hibernating",
        outrosParticipantes: 1,
      },
    ]);
    expect(JSON.stringify(previa.plano)).not.toContain(proprio(b));
    expect(JSON.stringify(previa.plano)).not.toContain("Nome privado");
    expect(JSON.stringify(previa.plano)).not.toContain("não exportar");
  });

  it("limita a três prévias abertas por conta e cancelamento próprio libera uma vaga", async () => {
    const a = await adulto(false);
    const pedido = { tipo: "encerrar_conta", perfis: [] };
    const primeira = await prepararPedidoDeDireitos(a.autor, pedido);
    await prepararPedidoDeDireitos(a.autor, pedido);
    await prepararPedidoDeDireitos(a.autor, pedido);
    await expect(prepararPedidoDeDireitos(a.autor, pedido)).rejects.toMatchObject({
      code: "LIMITE",
    });
    const ref = { preparacaoId: primeira.preparacaoId, planoSha256: primeira.planoSha256 };
    expect(await cancelarPreviaDeDireitos(a.autor, ref)).toEqual({ cancelada: true });
    expect(await cancelarPreviaDeDireitos(a.autor, ref)).toEqual({ cancelada: true });
    expect(
      (await eventosCom("preparationId", primeira.preparacaoId)).filter(
        (e) => e.eventType === "recreio.rights_preparation_cancelled",
      ),
    ).toHaveLength(1);
    expect((await prepararPedidoDeDireitos(a.autor, pedido)).plano.perfis).toEqual([]);
  });

  it("nega cancelamento alheio e hash divergente sem mudar a prévia", async () => {
    const a = await adulto(false),
      b = await adulto(false);
    const previa = await prepararPedidoDeDireitos(a.autor, { tipo: "encerrar_conta", perfis: [] });
    const ref = { preparacaoId: previa.preparacaoId, planoSha256: previa.planoSha256 };
    await expect(cancelarPreviaDeDireitos(b.autor, ref)).rejects.toMatchObject({
      code: "DIREITOS",
    });
    await expect(
      cancelarPreviaDeDireitos(a.autor, { ...ref, planoSha256: "0".repeat(64) }),
    ).rejects.toMatchObject({ code: "DIREITOS" });
    expect(
      (await db.select().from(preparations).where(eq(preparations.id, previa.preparacaoId)))[0]
        ?.cancelledAt,
    ).toBeNull();
  });

  it.each(["login antigo", "aparelho revogado", "contexto infantil"] as const)(
    "não persiste prévia por %s",
    async (caso) => {
      const a = await adulto(false);
      const autor = { ...a.autor, login: { ...a.autor.login } };
      if (caso === "login antigo") autor.login.criadoEm = new Date(Date.now() - 11 * 60_000);
      if (caso === "aparelho revogado")
        await db
          .update(devices)
          .set({ revokedAt: new Date() })
          .where(eq(devices.id, autor.sessaoDeAparelhoId));
      if (caso === "contexto infantil")
        await db
          .update(devices)
          .set({ minorContextGeneration: crypto.randomUUID() })
          .where(eq(devices.id, autor.sessaoDeAparelhoId));
      await expect(
        prepararPedidoDeDireitos(autor, { tipo: "encerrar_conta", perfis: [] }),
      ).rejects.toMatchObject({ code: caso === "login antigo" ? "LOGIN_RECENTE" : "AUTH" });
      expect(
        await db.select().from(preparations).where(eq(preparations.requesterUserId, a.conta.id)),
      ).toEqual([]);
    },
  );

  it("auditoria indisponível reverte preparação e cancelamento", async () => {
    const a = await adulto(false);
    const previa = await prepararPedidoDeDireitos(a.autor, { tipo: "encerrar_conta", perfis: [] });
    await db.execute(
      sql`create function audit.recusar_previa_teste() returns trigger language plpgsql as $$ begin if new.event_type in ('recreio.rights_prepared','recreio.rights_preparation_cancelled') then raise exception 'auditoria indisponivel'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_previa_teste before insert on audit.events for each row execute function audit.recusar_previa_teste()`,
    );
    try {
      await expect(
        prepararPedidoDeDireitos(a.autor, { tipo: "encerrar_conta", perfis: [] }),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
      await expect(
        cancelarPreviaDeDireitos(a.autor, {
          preparacaoId: previa.preparacaoId,
          planoSha256: previa.planoSha256,
        }),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
      const registros = await db
        .select()
        .from(preparations)
        .where(eq(preparations.requesterUserId, a.conta.id));
      expect(registros).toHaveLength(1);
      expect(registros[0]?.cancelledAt).toBeNull();
    } finally {
      await db.execute(sql`drop trigger recusar_previa_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_previa_teste()`);
    }
  });
});

describe("direitos: recuperar a mesma prévia sem consentimento implícito", () => {
  it("replay concorrente tem um recibo e um evento, preservando o plano original", async () => {
    const a = await adulto();
    const pedido = { pedidoId: crypto.randomUUID(), tipo: "retirar_perfil", perfis: [proprio(a)] };
    const [primeira, repetida] = await Promise.all([
      prepararPedidoDeDireitos(a.autor, pedido),
      prepararPedidoDeDireitos(a.autor, pedido),
    ]);
    expect(repetida).toEqual(primeira);
    expect(primeira).toMatchObject({
      preparacaoId: pedido.pedidoId,
      situacao: "preparada",
      desatualizada: false,
    });
    expect(
      await db.select().from(preparations).where(eq(preparations.requesterUserId, a.conta.id)),
    ).toHaveLength(1);
    expect(
      (await eventosCom("preparationId", pedido.pedidoId)).filter(
        (e) => e.eventType === "recreio.rights_prepared",
      ),
    ).toHaveLength(1);
    await db
      .update(profiles)
      .set({ policyVersion: 2 })
      .where(eq(profiles.id, proprio(a)));
    const desatualizada = await prepararPedidoDeDireitos(a.autor, pedido);
    expect(desatualizada.planoSha256).toBe(primeira.planoSha256);
    expect(desatualizada.plano).toEqual(primeira.plano);
    expect(desatualizada.desatualizada).toBe(true);
  });

  it("identificador não aceita outra seleção ou outra conta", async () => {
    const a = await adulto(),
      b = await adulto();
    const pedido = { pedidoId: crypto.randomUUID(), tipo: "retirar_perfil", perfis: [proprio(a)] };
    await prepararPedidoDeDireitos(a.autor, pedido);
    await expect(
      prepararPedidoDeDireitos(a.autor, { ...pedido, tipo: "encerrar_conta" }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(
      prepararPedidoDeDireitos(b.autor, { ...pedido, perfis: [proprio(b)] }),
    ).rejects.toMatchObject({ code: "DIREITOS" });
  });

  it("repetir uma prévia cancelada ou vencida não a renova", async () => {
    const a = await adulto(false);
    const pedido = { pedidoId: crypto.randomUUID(), tipo: "encerrar_conta", perfis: [] };
    const primeira = await prepararPedidoDeDireitos(a.autor, pedido);
    await cancelarPreviaDeDireitos(a.autor, {
      preparacaoId: primeira.preparacaoId,
      planoSha256: primeira.planoSha256,
    });
    expect(await prepararPedidoDeDireitos(a.autor, pedido)).toMatchObject({
      preparacaoId: primeira.preparacaoId,
      expiraEm: primeira.expiraEm,
      situacao: "cancelada",
    });
    const outro = { ...pedido, pedidoId: crypto.randomUUID() };
    const anterior = await prepararPedidoDeDireitos(a.autor, outro);
    await db
      .update(preparations)
      .set({ createdAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(preparations.id, anterior.preparacaoId));
    expect(await prepararPedidoDeDireitos(a.autor, outro)).toMatchObject({
      preparacaoId: anterior.preparacaoId,
      situacao: "expirada",
    });
  });
});

describe("direitos: painel pessoal com autoridade atual", () => {
  it("mostra próprio adulto e menor de outro grupo; pagante não recebe a lista parental", async () => {
    const a = await adulto(),
      b = await adulto();
    const p = await menor(a.autor);
    const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, b.conta.id));
    if (!grupo) throw new Error("Payer group absent");
    await db
      .update(profiles)
      .set({ groupId: grupo.id, status: "suspended", coverageEnabled: false })
      .where(eq(profiles.id, p.id));
    const painel = await consultarMeusDireitos(a.autor);
    expect(painel.perfis.map((v) => v.id).sort()).toEqual([proprio(a), p.id].sort());
    expect((await consultarMeusDireitos(b.autor)).perfis.map((v) => v.id)).toEqual([proprio(b)]);
    expect(painel.preparacoes).toEqual([]);
  });

  it("lista só prévias próprias com situação atual e sem plano, bytes ou dados de outros adultos", async () => {
    const a = await adulto(false),
      b = await adulto(false);
    const previa = await prepararPedidoDeDireitos(a.autor, { tipo: "encerrar_conta", perfis: [] });
    expect((await consultarMeusDireitos(b.autor)).preparacoes).toEqual([]);
    const painel = await consultarMeusDireitos(a.autor);
    expect(painel.preparacoes).toEqual([
      {
        preparacaoId: previa.preparacaoId,
        planoSha256: previa.planoSha256,
        operacao: null,
        tipo: "encerrar_conta",
        criadaEm: expect.any(String),
        expiraEm: previa.expiraEm,
        situacao: "preparada",
      },
    ]);
    expect(painel.preparacoes[0]).not.toHaveProperty("plan");
    await cancelarPreviaDeDireitos(a.autor, {
      preparacaoId: previa.preparacaoId,
      planoSha256: previa.planoSha256,
    });
    expect((await consultarMeusDireitos(a.autor)).preparacoes[0]?.situacao).toBe("cancelada");
  });

  it("não deixa um contexto infantil abrir o painel por chamada direta", async () => {
    const a = await adulto(false);
    await db
      .update(devices)
      .set({ minorContextGeneration: crypto.randomUUID() })
      .where(eq(devices.id, a.autor.sessaoDeAparelhoId));
    await expect(consultarMeusDireitos(a.autor)).rejects.toMatchObject({ code: "AUTH" });
  });
});

describe("direitos: mundos de visita e escopo estável", () => {
  it("encontra mundo visitado sem membro, autoria ou responsabilidade atual", async () => {
    const a = await adulto(),
      b = await adulto();
    const [mundo] = await db
      .insert(spaces)
      .values({
        gameId: JOGO,
        createdByProfileId: proprio(b),
        stewardProfileId: proprio(b),
        name: "Mundo de outro adulto",
        contentPolicy: "livre",
      })
      .returning();
    if (!mundo) throw new Error("World absent");
    await db
      .insert(spaceMembers)
      .values({ spaceId: mundo.id, profileId: proprio(b), role: "steward", state: "active" });
    await db.insert(traces).values({ profileId: proprio(a), spaceId: mundo.id });
    const previa = await prepararPedidoDeDireitos(a.autor, {
      tipo: "retirar_perfil",
      perfis: [proprio(a)],
    });
    expect(previa.plano.mundos).toMatchObject([{ id: mundo.id, outrosParticipantes: 1 }]);
    expect(JSON.stringify(previa.plano)).not.toContain(proprio(b));
    expect(JSON.stringify(previa.plano)).not.toContain("Mundo de outro adulto");
  });

  it("progresso e nova posse não renovam nem invalidam a mesma prévia pessoal", async () => {
    const a = await adulto();
    const [mundo] = await db
      .insert(spaces)
      .values({
        gameId: JOGO,
        createdByProfileId: proprio(a),
        stewardProfileId: proprio(a),
        name: "Mundo contínuo",
        contentPolicy: "livre",
      })
      .returning();
    if (!mundo) throw new Error("World absent");
    const pedido = { pedidoId: crypto.randomUUID(), tipo: "retirar_perfil", perfis: [proprio(a)] };
    const previa = await prepararPedidoDeDireitos(a.autor, pedido);
    await db
      .update(spaces)
      .set({ revision: 2, journalSeq: 9, leaseEpoch: 3, status: "active" })
      .where(eq(spaces.id, mundo.id));
    const repetida = await prepararPedidoDeDireitos(a.autor, pedido);
    expect(repetida.desatualizada).toBe(false);
    expect(repetida.plano).toEqual(previa.plano);
    expect(repetida.planoSha256).toBe(previa.planoSha256);
    expect(repetida.expiraEm).toBe(previa.expiraEm);
    await db.update(spaces).set({ managementRevision: 2 }).where(eq(spaces.id, mundo.id));
    expect((await prepararPedidoDeDireitos(a.autor, pedido)).desatualizada).toBe(true);
  });
});
