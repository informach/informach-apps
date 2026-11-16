import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  events,
  recreioGameSessions as games,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { desconectarAparelho, listarAparelhos } from "@/features/aparelhos/service";
import { selecionarPerfil } from "@/features/perfis/service";
import { encerrarSessaoDeAparelho, resolverAtor } from "@/features/sessao/service";
import { type Jogador, loginReal, novoJogador } from "./apoio";

async function outroAparelho(pessoa: Jogador) {
  const login = await loginReal(pessoa.conta);
  const contexto = await resolverAtor(login);
  if (!contexto) throw new Error("Aparelho ausente");
  await selecionarPerfil(contexto.ator, pessoa.perfil.id);
  return { login, ator: { ...contexto.ator, perfil: pessoa.perfil } };
}
async function auditoria(contaId: string, tipo: string) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.actorId, contaId), eq(events.eventType, tipo)));
}
async function partida(pessoa: Jogador, aparelhoId: string) {
  const id = randomUUID();
  await db.insert(games).values({
    id,
    profileId: pessoa.perfil.id,
    deviceSessionId: aparelhoId,
    gameId: "morada",
    expiresAt: new Date(Date.now() + 60_000),
  });
  return id;
}
async function estadoDoAparelho(id: string) {
  const [linha] = await db.select().from(devices).where(eq(devices.id, id));
  return linha;
}

describe("aparelhos da própria conta", () => {
  it("pagina sem perder a precisão de criação e não expõe credenciais nem outras contas", async () => {
    const pessoa = await novoJogador({ comAcesso: false });
    const outra = await novoJogador({ comAcesso: false });
    const linhas: (typeof devices.$inferInsert)[] = Array.from({ length: 23 }, () => ({
      id: randomUUID(),
      kind: "account",
      authSessionId: randomUUID(),
      userId: pessoa.conta.id,
      activeProfileId: pessoa.perfil.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    }));
    const ids = linhas.map((l) => l.id).filter((id): id is string => id !== undefined);
    await db.insert(devices).values(linhas);
    await db
      .update(devices)
      .set({ createdAt: sql`'2026-01-01 00:00:00.123456+00'::timestamptz` })
      .where(inArray(devices.id, ids));
    await db.insert(devices).values([
      {
        kind: "account",
        authSessionId: randomUUID(),
        userId: pessoa.conta.id,
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: new Date(),
      },
      {
        kind: "account",
        authSessionId: randomUUID(),
        userId: pessoa.conta.id,
        expiresAt: new Date(Date.now() - 60_000),
      },
      {
        kind: "paired_device",
        userId: pessoa.conta.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    ]);
    const primeira = await listarAparelhos(pessoa.ator);
    expect(primeira.atual.id).toBe(pessoa.ator.sessaoDeAparelhoId);
    expect(primeira.outros).toHaveLength(20);
    expect(primeira.proximo).not.toBeNull();
    await db.update(devices).set({ lastSeenAt: new Date() }).where(inArray(devices.id, ids));
    const segunda = await listarAparelhos(pessoa.ator, primeira.proximo);
    expect(segunda.outros).toHaveLength(3);
    expect(segunda.proximo).toBeNull();
    const todos = [...primeira.outros, ...segunda.outros];
    expect(todos.map((l) => l.id).sort()).toEqual([...ids].sort());
    expect(todos.every((l) => Object.keys(l).sort().join(",") === "criadoEm,id,vistoEm")).toBe(
      true,
    );
    expect((await listarAparelhos(pessoa.ator, outra.ator.sessaoDeAparelhoId)).outros).toEqual([]);
    expect((await listarAparelhos(pessoa.ator, randomUUID())).outros).toEqual([]);
  });

  it("recusa cursor malformado sem consultar outra conta", async () => {
    const pessoa = await novoJogador({ comAcesso: false });
    for (const cursor of ["invalido", 1, [randomUUID()], { id: randomUUID() }])
      await expect(listarAparelhos(pessoa.ator, cursor)).rejects.toMatchObject({ code: "INPUT" });
  });

  it("revoga outro aparelho e suas partidas atomicamente, preservando a negativa e o atual", async () => {
    const pessoa = await novoJogador({ comAcesso: false });
    const outro = await outroAparelho(pessoa);
    const sid = await partida(pessoa, outro.ator.sessaoDeAparelhoId);
    expect(await desconectarAparelho(pessoa.ator, outro.ator.sessaoDeAparelhoId)).toEqual({
      revogado: true,
    });
    expect(await desconectarAparelho(pessoa.ator, outro.ator.sessaoDeAparelhoId)).toEqual({
      revogado: false,
    });
    expect((await estadoDoAparelho(outro.ator.sessaoDeAparelhoId))?.revokedAt).not.toBeNull();
    expect((await estadoDoAparelho(pessoa.ator.sessaoDeAparelhoId))?.revokedAt).toBeNull();
    expect(await resolverAtor(outro.login)).toBeNull();
    const [jogo] = await db.select().from(games).where(eq(games.id, sid));
    expect(jogo).toMatchObject({ endReason: "signed_out", endedSeq: expect.any(Number) });
    const registros = await auditoria(pessoa.conta.id, "recreio.device_session_revoked");
    expect(registros).toHaveLength(1);
    expect(registros[0]?.payload).toEqual({
      app: "recreio",
      deviceSessionId: outro.ator.sessaoDeAparelhoId,
      profileId: pessoa.perfil.id,
    });
    expect(JSON.stringify(registros)).not.toContain(outro.login.authSessionId);
    expect(JSON.stringify(registros)).not.toContain(pessoa.conta.email);
    expect(await auditoria(pessoa.conta.id, "recreio.game_session_ended")).toHaveLength(1);
  });

  it("alvo próprio atual, desconhecido e de outra conta dão a mesma recusa", async () => {
    const pessoa = await novoJogador({ comAcesso: false });
    const outra = await novoJogador({ comAcesso: false });
    for (const alvo of [
      pessoa.ator.sessaoDeAparelhoId,
      outra.ator.sessaoDeAparelhoId,
      randomUUID(),
    ])
      await expect(desconectarAparelho(pessoa.ator, alvo)).rejects.toMatchObject({
        code: "APARELHO",
        message: "Aparelho não disponível.",
      });
    expect((await estadoDoAparelho(outra.ator.sessaoDeAparelhoId))?.revokedAt).toBeNull();
    expect(await auditoria(pessoa.conta.id, "recreio.device_session_revoked")).toEqual([]);
  });

  it("esta autoridade não revoga aparelho pareado", async () => {
    const pessoa = await novoJogador({ comAcesso: false });
    const [pareado] = await db
      .insert(devices)
      .values({
        kind: "paired_device",
        userId: pessoa.conta.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning({ id: devices.id });
    if (!pareado) throw new Error("Aparelho ausente");
    await expect(desconectarAparelho(pessoa.ator, pareado.id)).rejects.toMatchObject({
      code: "APARELHO",
    });
    expect((await estadoDoAparelho(pareado.id))?.revokedAt).toBeNull();
  });

  it.each(["revogada", "vencida", "suspensa", "sem perfil"])(
    "revalida o chamador já resolvido: %s",
    async (caso) => {
      const pessoa = await novoJogador({ comAcesso: false });
      const outro = await outroAparelho(pessoa);
      if (caso === "suspensa")
        await db
          .update(profiles)
          .set({ status: "suspended" })
          .where(eq(profiles.id, pessoa.perfil.id));
      else
        await db
          .update(devices)
          .set(
            caso === "revogada"
              ? { revokedAt: new Date() }
              : caso === "vencida"
                ? { expiresAt: new Date(Date.now() - 60_000) }
                : { activeProfileId: null },
          )
          .where(eq(devices.id, pessoa.ator.sessaoDeAparelhoId));
      await expect(listarAparelhos(pessoa.ator)).rejects.toMatchObject({ code: "AUTH" });
      await expect(
        desconectarAparelho(pessoa.ator, outro.ator.sessaoDeAparelhoId),
      ).rejects.toMatchObject({ code: "AUTH" });
      expect((await estadoDoAparelho(outro.ator.sessaoDeAparelhoId))?.revokedAt).toBeNull();
    },
  );

  it("revogações cruzadas não reaproveitam autoridade encerrada nem criam espera circular", async () => {
    const pessoa = await novoJogador({ comAcesso: false });
    const outro = await outroAparelho(pessoa);
    const resultados = await Promise.allSettled([
      desconectarAparelho(pessoa.ator, outro.ator.sessaoDeAparelhoId),
      desconectarAparelho(outro.ator, pessoa.ator.sessaoDeAparelhoId),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const negado = resultados.find((r) => r.status === "rejected");
    expect(negado?.status === "rejected" && negado.reason).toMatchObject({ code: "AUTH" });
    expect(await auditoria(pessoa.conta.id, "recreio.device_session_revoked")).toHaveLength(1);
  });

  it("falha real da auditoria desfaz aparelho, fim de jogo e eventos; repetição recupera", async () => {
    const pessoa = await novoJogador({ comAcesso: false });
    const outro = await outroAparelho(pessoa);
    const sid = await partida(pessoa, outro.ator.sessaoDeAparelhoId);
    await db.execute(sql`create function audit.recusar_aparelho_em_teste() returns trigger language plpgsql as $$
      begin if new.event_type = 'recreio.device_session_revoked' then raise exception 'auditoria indisponível (teste)'; end if; return new; end $$`);
    await db.execute(
      sql`create trigger recusar_aparelho_em_teste before insert on audit.events for each row execute function audit.recusar_aparelho_em_teste()`,
    );
    try {
      await expect(
        desconectarAparelho(pessoa.ator, outro.ator.sessaoDeAparelhoId),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
      expect((await estadoDoAparelho(outro.ator.sessaoDeAparelhoId))?.revokedAt).toBeNull();
      const [jogo] = await db.select().from(games).where(eq(games.id, sid));
      expect(jogo).toMatchObject({ endedAt: null, endedSeq: null });
      expect(await auditoria(pessoa.conta.id, "recreio.game_session_ended")).toEqual([]);
      expect(await auditoria(pessoa.conta.id, "recreio.device_session_revoked")).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger recusar_aparelho_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_aparelho_em_teste()`);
    }
    expect(await desconectarAparelho(pessoa.ator, outro.ator.sessaoDeAparelhoId)).toEqual({
      revogado: true,
    });
    expect(await auditoria(pessoa.conta.id, "recreio.game_session_ended")).toHaveLength(1);
    expect(await auditoria(pessoa.conta.id, "recreio.device_session_revoked")).toHaveLength(1);
  });

  it("saída e revogação concorrentes encerram a partida uma vez", async () => {
    const pessoa = await novoJogador({ comAcesso: false });
    const outro = await outroAparelho(pessoa);
    const sid = await partida(pessoa, outro.ator.sessaoDeAparelhoId);
    await Promise.all([
      desconectarAparelho(pessoa.ator, outro.ator.sessaoDeAparelhoId),
      encerrarSessaoDeAparelho({
        authSessionId: outro.login.authSessionId,
        contaId: pessoa.conta.id,
      }),
    ]);
    const [jogo] = await db.select().from(games).where(eq(games.id, sid));
    expect(jogo?.endReason).toBe("signed_out");
    expect(await auditoria(pessoa.conta.id, "recreio.game_session_ended")).toHaveLength(1);
  });
});
