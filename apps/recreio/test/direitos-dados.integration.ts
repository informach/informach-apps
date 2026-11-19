import { createHash } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioDeviceSessions as devices,
  recreioGroups as groups,
  recreioGuardianLinks as guardians,
  recreioProfileDataKeys as keys,
  recreioProfiles as profiles,
  sessions,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { prepararCopiaPessoalDoJogo } from "@/features/direitos/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { criarPerfilProprio } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { eventosCom, loginReal, novaConta, sinal } from "./apoio";

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

describe("direitos: recorte pessoal por jogo sem autoridade de gameplay", () => {
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
