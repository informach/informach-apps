import { randomUUID } from "node:crypto";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { MembroIdSchema } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { listarParticipacoes } from "@/features/mundos/participacoes";
import { sairDoMundo } from "@/features/mundos/saida";
import { type Jogador, novoJogador } from "./apoio";
import { mundoDe } from "./jogo-apoio";

const autorDe = (p: Jogador) => ({
  contaId: p.conta.id,
  perfilId: p.perfil.id,
  sessaoDeAparelhoId: p.ator.sessaoDeAparelhoId,
});

async function vinculos(p: Jogador) {
  const dono = await novoJogador();
  const mundoId = await mundoDe(dono);
  const [responsavel] = await db.select().from(members).where(eq(members.spaceId, mundoId));
  if (!responsavel) throw new Error("Responsável de prova ausente");
  await db.insert(members).values({
    spaceId: mundoId,
    profileId: p.perfil.id,
    role: "member",
    state: "away",
    invitedByMemberId: responsavel.id,
    participation: "valor-interno-nao-exposto",
  });
  return { dono, mundoId };
}

describe("participações próprias fora da estante", () => {
  it("lista estados atuais sem cobertura e não retorna conteúdo ou outros membros", async () => {
    const p = await novoJogador({ comAcesso: false });
    const { mundoId } = await vinculos(p);
    const autor = autorDe(p);
    for (const estado of ["active", "away", "no_access"] as const) {
      await db
        .update(members)
        .set({ state: estado })
        .where(and(eq(members.spaceId, mundoId), eq(members.profileId, p.perfil.id)));
      const pagina = await listarParticipacoes(autor);
      expect(pagina.itens).toHaveLength(1);
      expect(pagina.itens[0]).toEqual({
        id: expect.any(String),
        mundoId,
        nome: "Casa de teste",
        papel: "member",
        estado,
        estadoDoMundo: "hibernating",
      });
    }
    await db
      .update(members)
      .set({ state: "former", leftAt: new Date() })
      .where(and(eq(members.spaceId, mundoId), eq(members.profileId, p.perfil.id)));
    expect((await listarParticipacoes(autor)).itens).toEqual([]);
  });

  it("não lista vínculos alheios e excluídos; arquivado não perde o direito de saída", async () => {
    const p = await novoJogador({ comAcesso: false });
    const { dono, mundoId } = await vinculos(p);
    const alheio = await mundoDe(dono);
    expect((await listarParticipacoes(autorDe(p))).itens.map((r) => r.mundoId)).not.toContain(
      alheio,
    );
    await db.update(spaces).set({ status: "archived" }).where(eq(spaces.id, mundoId));
    expect((await listarParticipacoes(autorDe(p))).itens[0]?.estadoDoMundo).toBe("archived");
    await db.update(spaces).set({ status: "deleted" }).where(eq(spaces.id, mundoId));
    expect((await listarParticipacoes(autorDe(p))).itens).toEqual([]);
  });

  it("pagina 20 vínculos em ordem, sem repetir, e um cursor alheio não concede acesso", async () => {
    const p = await novoJogador({ comAcesso: false });
    const dono = await novoJogador();
    const mundoId = await mundoDe(dono);
    const criados = await db
      .insert(spaces)
      .values(
        Array.from({ length: 23 }, (_, n) => ({
          gameId: "morada",
          name: `Mundo de prova ${n}`,
          contentPolicy: "todas_as_idades",
          status: "hibernating" as const,
          createdByProfileId: dono.perfil.id,
          stewardProfileId: dono.perfil.id,
        })),
      )
      .returning({ id: spaces.id });
    await db.insert(members).values(
      criados.map((r, n) => ({
        spaceId: r.id,
        profileId: p.perfil.id,
        role: "member" as const,
        state: n % 2 === 0 ? ("away" as const) : ("no_access" as const),
      })),
    );
    const primeira = await listarParticipacoes(autorDe(p));
    expect(primeira.itens).toHaveLength(20);
    expect(primeira.proximo).not.toBeNull();
    const segunda = await listarParticipacoes(autorDe(p), primeira.proximo);
    expect(segunda.itens).toHaveLength(3);
    expect(segunda.proximo).toBeNull();
    const ids = [...primeira.itens, ...segunda.itens].map((r) => r.id);
    expect(new Set(ids).size).toBe(23);
    expect(ids).toEqual([...ids].sort());
    const [alheio] = await db.select().from(members).where(eq(members.spaceId, mundoId));
    if (!alheio) throw new Error("Cursor alheio ausente");
    const pagina = await listarParticipacoes(autorDe(p), MembroIdSchema.parse(alheio.id));
    expect(pagina.itens.every((r) => criados.some((m) => m.id === r.mundoId))).toBe(true);
    await expect(listarParticipacoes(autorDe(p), "não-é-uuid")).rejects.toMatchObject({
      code: "INPUT",
    });
    await expect(listarParticipacoes(autorDe(p), [randomUUID()])).rejects.toMatchObject({
      code: "INPUT",
    });
  });

  it.each([
    "outra_conta",
    "outro_perfil",
    "menor",
    "suspenso",
    "revogado",
    "vencido",
    "pareado",
    "sem_perfil",
  ])("recusa autoridade inválida: %s", async (caso) => {
    const p = await novoJogador();
    const outro = await novoJogador();
    await mundoDe(p);
    const autor = autorDe(p);
    if (caso === "outra_conta") autor.contaId = outro.conta.id;
    else if (caso === "outro_perfil") autor.perfilId = outro.perfil.id;
    else if (caso === "menor" || caso === "suspenso")
      await db
        .update(profiles)
        .set(caso === "menor" ? { kind: "minor" } : { status: "suspended" })
        .where(eq(profiles.id, p.perfil.id));
    else
      await db
        .update(devices)
        .set(
          caso === "revogado"
            ? { revokedAt: new Date() }
            : caso === "vencido"
              ? { expiresAt: new Date(Date.now() - 60_000) }
              : caso === "pareado"
                ? { kind: "paired_device" }
                : { activeProfileId: null },
        )
        .where(eq(devices.id, autor.sessaoDeAparelhoId));
    await expect(listarParticipacoes(autor)).rejects.toMatchObject({ code: "AUTH" });
  });

  it.each(["away", "no_access"] as const)(
    "a saída acessível encerra %s sem tocar no mundo ou responsável",
    async (estado) => {
      const p = await novoJogador({ comAcesso: false });
      const { dono, mundoId } = await vinculos(p);
      await db
        .update(members)
        .set({ state: estado, role: "coadmin" })
        .where(and(eq(members.spaceId, mundoId), eq(members.profileId, p.perfil.id)));
      const antes = await db.select().from(spaces).where(eq(spaces.id, mundoId));
      expect((await listarParticipacoes(autorDe(p))).itens[0]?.estado).toBe(estado);
      await sairDoMundo(autorDe(p), mundoId);
      expect((await listarParticipacoes(autorDe(p))).itens).toEqual([]);
      expect(await db.select().from(spaces).where(eq(spaces.id, mundoId))).toEqual(antes);
      expect((await listarParticipacoes(autorDe(dono))).itens[0]?.papel).toBe("steward");
    },
  );

  it("falha de leitura não é convertida em lista vazia", async () => {
    const p = await novoJogador();
    // O PostgreSQL recusa a leitura, sem mock de repositório ou exceção engolida.
    await db.execute(
      sql`alter table recreio.space_members rename to space_members_indisponivel_teste`,
    );
    try {
      await expect(listarParticipacoes(autorDe(p))).rejects.toThrow();
    } finally {
      await db.execute(
        sql`alter table recreio.space_members_indisponivel_teste rename to space_members`,
      );
    }
  });
});
