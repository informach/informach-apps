import { createHash, randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as deviceSessions,
  recreioEntitlements as entitlements,
  recreioGameSessions as gameSessions,
  recreioGroups as groups,
  recreioGameInstances as instances,
  recreioSpaceInvites as invites,
  recreioSpaceJournal as journal,
  recreioSpaceLeases as leases,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
  recreioGameTickets as tickets,
  users,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { criarPerfilProprio } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { conceder } from "../scripts/concessoes";
import { CHECAGEM, codigoDoBanco, loginDe, novaConta, RESTRICAO, UNICO } from "./apoio";

const daqui = (ms: number) => new Date(Date.now() + ms);
const sha256 = (dados: Buffer) => createHash("sha256").update(dados).digest("hex");

async function jogador(apelido: string) {
  const conta = await novaConta();
  const { perfil } = await criarPerfilProprio(conta.id, { apelido, avatar: "sol" });
  const contexto = await resolverAtor(loginDe(conta));
  if (!contexto || !perfil.grupoId) throw new Error("Jogador de teste incompleto");
  return {
    conta,
    perfil,
    grupoId: perfil.grupoId,
    sessaoDeAparelhoId: contexto.ator.sessaoDeAparelhoId,
  };
}

async function mundoDe(perfilId: string) {
  const [mundo] = await db
    .insert(spaces)
    .values({
      gameId: "morada",
      stewardProfileId: perfilId,
      createdByProfileId: perfilId,
      name: "Casa da Lia",
      contentPolicy: "padrao",
    })
    .returning();
  if (!mundo) throw new Error("Mundo de teste não criado");
  return mundo;
}

const proximoFim = sql<number>`nextval('recreio.game_session_end_seq')`;

describe("excluir a conta não apaga o mundo", () => {
  it("o mundo, o membro, a posse, a fotografia e o diário ficam; o que é pessoal sai", async () => {
    const lia = await jogador("Lia");
    const bia = await jogador("Bia");
    await conceder({ email: lia.conta.email, tier: "family", dias: 30, motivo: "alfa_equipe" });
    const mundo = await mundoDe(lia.perfil.id);
    expect(mundo).toMatchObject({ status: "hibernating", membersInvite: "with_approval" });

    const [membroLia] = await db
      .insert(members)
      .values({ spaceId: mundo.id, profileId: lia.perfil.id, role: "steward", state: "active" })
      .returning();
    const [membroBia] = await db
      .insert(members)
      .values({
        spaceId: mundo.id,
        profileId: bia.perfil.id,
        role: "member",
        state: "active",
        invitedByMemberId: membroLia?.id,
      })
      .returning();
    if (!membroLia || !membroBia) throw new Error("Membros de teste não criados");
    const [instancia] = await db
      .insert(instances)
      .values({ gameId: "morada", publicUrl: "ws://localhost:3010", version: "dev", capacity: 50 })
      .returning();
    const [posse] = await db
      .insert(leases)
      .values({
        spaceId: mundo.id,
        fence: 1,
        holderKind: "server",
        instanceId: instancia?.id,
        state: "held",
        claimedAt: new Date(),
        expiresAt: daqui(30_000),
      })
      .returning();
    const foto = Buffer.from("estado do mundo");
    const [fotografia] = await db
      .insert(snapshots)
      .values({
        spaceId: mundo.id,
        revision: 1,
        fence: 1,
        schemaVersion: 1,
        journalSeq: 0,
        tick: 0,
        kind: "checkpoint",
        storage: "pg",
        data: foto,
        byteSize: foto.length,
        sha256: sha256(foto),
      })
      .returning();
    const fatos = [1, 2].map((seq) => ({
      spaceId: mundo.id,
      seq,
      fence: 1,
      tick: seq * 10,
      factId: `fato:${seq}`,
      payload: Buffer.from(`fato ${seq}`),
      byteSize: 6,
    }));
    await db.insert(journal).values(fatos);
    const [convite] = await db
      .insert(invites)
      .values({
        spaceId: mundo.id,
        invitedByMemberId: membroBia.id,
        form: "member",
        codeHash: sha256(Buffer.from(randomUUID())),
        targetProfileId: lia.perfil.id,
        state: "accepted",
        expiresAt: daqui(86_400_000),
        acceptedAt: new Date(),
        acceptedByProfileId: lia.perfil.id,
      })
      .returning();
    // O que é da pessoa: ingresso e sessão de jogo aberta naquele mundo.
    const jti = randomUUID();
    await db.insert(tickets).values({
      jti,
      profileId: lia.perfil.id,
      deviceSessionId: lia.sessaoDeAparelhoId,
      gameId: "morada",
      expiresAt: daqui(60_000),
    });
    const [sessaoDeJogo] = await db
      .insert(gameSessions)
      .values({
        profileId: lia.perfil.id,
        deviceSessionId: lia.sessaoDeAparelhoId,
        gameId: "morada",
        spaceId: mundo.id,
        expiresAt: daqui(900_000),
      })
      .returning();
    if (!posse || !fotografia || !convite || !sessaoDeJogo) throw new Error("Fixture incompleta");

    await db.delete(users).where(eq(users.id, lia.conta.id));

    // O mundo fica, sem responsável e sem criador conhecidos.
    const [mundoDepois] = await db.select().from(spaces).where(eq(spaces.id, mundo.id));
    expect(mundoDepois).toMatchObject({
      id: mundo.id,
      name: "Casa da Lia",
      stewardProfileId: null,
      createdByProfileId: null,
    });
    // A participação da Lia fica, sem apontar para ninguém; a da Bia não muda.
    const membrosDepois = await db.select().from(members).where(eq(members.spaceId, mundo.id));
    expect(membrosDepois).toHaveLength(2);
    expect(membrosDepois.find((membro) => membro.id === membroLia.id)).toMatchObject({
      profileId: null,
      role: "steward",
      state: "active",
    });
    expect(membrosDepois.find((membro) => membro.id === membroBia.id)).toMatchObject({
      profileId: bia.perfil.id,
      invitedByMemberId: membroLia.id,
    });
    // Posse, fotografia e diário intactos, byte a byte.
    expect(await db.select().from(leases).where(eq(leases.spaceId, mundo.id))).toMatchObject([
      { id: posse.id, fence: 1, state: "held", releasedAt: null, instanceId: instancia?.id },
    ]);
    const [fotoDepois] = await db.select().from(snapshots).where(eq(snapshots.spaceId, mundo.id));
    expect(fotoDepois?.id).toBe(fotografia.id);
    expect(Buffer.from(fotoDepois?.data ?? []).toString()).toBe("estado do mundo");
    const diarioDepois = await db
      .select()
      .from(journal)
      .where(eq(journal.spaceId, mundo.id))
      .orderBy(journal.seq);
    expect(diarioDepois.map((fato) => [fato.seq, fato.factId, fato.payload.toString()])).toEqual([
      [1, "fato:1", "fato 1"],
      [2, "fato:2", "fato 2"],
    ]);
    // O convite fica como registro do mundo, sem os perfis que saíram.
    expect(await db.select().from(invites).where(eq(invites.id, convite.id))).toMatchObject([
      { state: "accepted", targetProfileId: null, acceptedByProfileId: null },
    ]);

    // O que era da conta saiu em cascata.
    expect(await db.select().from(profiles).where(eq(profiles.id, lia.perfil.id))).toHaveLength(0);
    expect(await db.select().from(groups).where(eq(groups.ownerUserId, lia.conta.id))).toHaveLength(
      0,
    );
    expect(
      await db.select().from(entitlements).where(eq(entitlements.groupId, lia.grupoId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(deviceSessions).where(eq(deviceSessions.id, lia.sessaoDeAparelhoId)),
    ).toHaveLength(0);
    expect(await db.select().from(tickets).where(eq(tickets.jti, jti))).toHaveLength(0);
    expect(
      await db.select().from(gameSessions).where(eq(gameSessions.id, sessaoDeJogo.id)),
    ).toHaveLength(0);
    // A outra conta não foi tocada.
    expect(await db.select().from(profiles).where(eq(profiles.id, bia.perfil.id))).toHaveLength(1);
  });

  it("perfil sem login fica sem grupo quando o titular sai, e o mundo dele continua", async () => {
    const lia = await jogador("Lia");
    const [filha] = await db
      .insert(profiles)
      .values({ groupId: lia.grupoId, kind: "minor", nickname: "Filha" })
      .returning();
    if (!filha) throw new Error("Perfil de teste não criado");
    const mundo = await mundoDe(filha.id);
    await db
      .insert(members)
      .values({ spaceId: mundo.id, profileId: filha.id, role: "steward", state: "active" });
    await db.delete(users).where(eq(users.id, lia.conta.id));
    // O perfil sem login fica órfão de grupo (sem cobertura); o mundo dele fica inteiro.
    expect(await db.select().from(profiles).where(eq(profiles.id, filha.id))).toMatchObject([
      { groupId: null, userId: null, kind: "minor" },
    ]);
    expect(await db.select().from(spaces).where(eq(spaces.id, mundo.id))).toMatchObject([
      { stewardProfileId: filha.id },
    ]);
  });

  it("um mundo com conteúdo não pode ser apagado por baixo", async () => {
    const lia = await jogador("Lia");
    const mundo = await mundoDe(lia.perfil.id);
    await db
      .insert(members)
      .values({ spaceId: mundo.id, profileId: lia.perfil.id, role: "steward", state: "active" });
    expect(RESTRICAO).toContain(
      await codigoDoBanco(db.delete(spaces).where(eq(spaces.id, mundo.id))),
    );
    expect(await db.select().from(spaces).where(eq(spaces.id, mundo.id))).toHaveLength(1);
  });
});

describe("um perfil joga uma coisa por vez", () => {
  it("recusa a segunda sessão de jogo aberta e aceita depois de encerrar a primeira", async () => {
    const lia = await jogador("Lia");
    const nova = () =>
      db
        .insert(gameSessions)
        .values({
          profileId: lia.perfil.id,
          deviceSessionId: lia.sessaoDeAparelhoId,
          gameId: "morada",
          expiresAt: daqui(900_000),
        })
        .returning();
    const [primeira] = await nova();
    if (!primeira) throw new Error("Sessão de teste não criada");
    expect(await codigoDoBanco(nova())).toBe(UNICO);

    // Encerrar exige os três campos: quando, por que e a posição no cursor.
    expect(
      await codigoDoBanco(
        db
          .update(gameSessions)
          .set({ endedAt: new Date() })
          .where(eq(gameSessions.id, primeira.id)),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.execute(sql`
          update recreio.game_sessions
          set ended_at = now(), end_reason = 'sumiu', ended_seq = ${proximoFim}
          where id = ${primeira.id}`),
      ),
    ).toBe(CHECAGEM);
    const [encerrada] = await db
      .update(gameSessions)
      .set({ endedAt: new Date(), endReason: "replaced", endedSeq: proximoFim })
      .where(eq(gameSessions.id, primeira.id))
      .returning();
    const [segunda] = await nova();
    if (!segunda) throw new Error("A segunda sessão deveria entrar");
    expect(segunda.endedAt).toBeNull();

    // O cursor só cresce: a próxima sessão encerrada vem depois.
    const [outraEncerrada] = await db
      .update(gameSessions)
      .set({ endedAt: new Date(), endReason: "left", endedSeq: proximoFim })
      .where(eq(gameSessions.id, segunda.id))
      .returning();
    expect(Number(outraEncerrada?.endedSeq)).toBeGreaterThan(Number(encerrada?.endedSeq));
    // Outro perfil joga ao mesmo tempo sem problema.
    const bia = await jogador("Bia");
    expect(
      await codigoDoBanco(
        db.insert(gameSessions).values({
          profileId: bia.perfil.id,
          deviceSessionId: bia.sessaoDeAparelhoId,
          gameId: "morada",
          expiresAt: daqui(900_000),
        }),
      ),
    ).toBeUndefined();
  });
});

describe("um mundo aberto tem uma posse só", () => {
  it("recusa a segunda posse aberta e a cerca repetida; aceita depois de liberar", async () => {
    const lia = await jogador("Lia");
    const mundo = await mundoDe(lia.perfil.id);
    const posse = (fence: number) =>
      db
        .insert(leases)
        .values({
          spaceId: mundo.id,
          fence,
          holderKind: "server",
          state: "assigned",
          expiresAt: daqui(30_000),
        })
        .returning();
    const [primeira] = await posse(1);
    if (!primeira) throw new Error("Posse de teste não criada");
    expect(await codigoDoBanco(posse(2))).toBe(UNICO);

    // Liberar sem a data, ou com a data e o estado antigo, não passa.
    expect(
      await codigoDoBanco(
        db.update(leases).set({ state: "released" }).where(eq(leases.id, primeira.id)),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.update(leases).set({ releasedAt: new Date() }).where(eq(leases.id, primeira.id)),
      ),
    ).toBe(CHECAGEM);
    await db
      .update(leases)
      .set({ state: "released", releasedAt: new Date(), endReason: "empty" })
      .where(eq(leases.id, primeira.id));

    // Com a primeira liberada, a cerca velha continua recusada e a nova entra.
    expect(await codigoDoBanco(posse(1))).toBe(UNICO);
    expect(await codigoDoBanco(posse(2))).toBeUndefined();
    expect(await codigoDoBanco(posse(3))).toBe(UNICO);
    // Outro mundo tem a sua própria posse.
    const outro = await mundoDe(lia.perfil.id);
    expect(
      await codigoDoBanco(
        db.insert(leases).values({
          spaceId: outro.id,
          fence: 1,
          holderKind: "server",
          state: "assigned",
          expiresAt: daqui(30_000),
        }),
      ),
    ).toBeUndefined();
  });
});

describe("outras regras que o banco confere", () => {
  it("fotografia fica no Postgres ou no bucket, nunca nos dois nem em nenhum", async () => {
    const lia = await jogador("Lia");
    const mundo = await mundoDe(lia.perfil.id);
    const dados = Buffer.from("foto");
    const base = {
      spaceId: mundo.id,
      fence: 1,
      schemaVersion: 1,
      journalSeq: 0,
      tick: 0,
      kind: "checkpoint" as const,
      byteSize: dados.length,
      sha256: sha256(dados),
    };
    expect(
      await codigoDoBanco(db.insert(snapshots).values({ ...base, revision: 1, storage: "pg" })),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db
          .insert(snapshots)
          .values({ ...base, revision: 1, storage: "pg", data: dados, objectKey: "mundos/1" }),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.insert(snapshots).values({ ...base, revision: 1, storage: "bucket", data: dados }),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.insert(snapshots).values({ ...base, revision: 1, storage: "pg", data: dados }),
      ),
    ).toBeUndefined();
    expect(
      await codigoDoBanco(
        db
          .insert(snapshots)
          .values({ ...base, revision: 2, storage: "bucket", objectKey: "mundos/2" }),
      ),
    ).toBeUndefined();
    // A mesma revisão não entra duas vezes.
    expect(
      await codigoDoBanco(
        db.insert(snapshots).values({ ...base, revision: 2, storage: "pg", data: dados }),
      ),
    ).toBe(UNICO);
  });

  it("o diário não repete posição nem fato no mesmo mundo", async () => {
    const lia = await jogador("Lia");
    const mundo = await mundoDe(lia.perfil.id);
    const fato = (seq: number, factId: string) =>
      db.insert(journal).values({
        spaceId: mundo.id,
        seq,
        fence: 1,
        tick: 1,
        factId,
        payload: Buffer.from("x"),
        byteSize: 1,
      });
    expect(await codigoDoBanco(fato(1, "nasc:1"))).toBeUndefined();
    expect(await codigoDoBanco(fato(1, "nasc:2"))).toBe(UNICO);
    expect(await codigoDoBanco(fato(2, "nasc:1"))).toBe(UNICO);
    expect(await codigoDoBanco(fato(2, "nasc:2"))).toBeUndefined();
  });

  it("o mesmo perfil não entra duas vezes no mesmo mundo, e o código de convite é único", async () => {
    const lia = await jogador("Lia");
    const mundo = await mundoDe(lia.perfil.id);
    const membro = () =>
      db
        .insert(members)
        .values({ spaceId: mundo.id, profileId: lia.perfil.id, role: "steward", state: "active" })
        .returning();
    const [primeiro] = await membro();
    if (!primeiro) throw new Error("Membro de teste não criado");
    expect(await codigoDoBanco(membro())).toBe(UNICO);
    const convite = (codeHash: string) =>
      db.insert(invites).values({
        spaceId: mundo.id,
        invitedByMemberId: primeiro.id,
        form: "visit",
        codeHash,
        state: "sent",
        expiresAt: daqui(86_400_000),
      });
    expect(await codigoDoBanco(convite("resumo-1"))).toBeUndefined();
    expect(await codigoDoBanco(convite("resumo-1"))).toBe(UNICO);
  });

  it("concessão precisa terminar depois de começar e levar um código de motivo", async () => {
    const lia = await jogador("Lia");
    const base = {
      groupId: lia.grupoId,
      kind: "courtesy" as const,
      tier: "family" as const,
      startsAt: new Date(),
      endsAt: daqui(86_400_000),
      reasonCode: "alfa_equipe",
    };
    expect(
      await codigoDoBanco(db.insert(entitlements).values({ ...base, endsAt: base.startsAt })),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.insert(entitlements).values({ ...base, reasonCode: "Pedido da Lia por e-mail" }),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.execute(sql`
          insert into recreio.entitlements (group_id, kind, tier, starts_at, ends_at, reason_code)
          values (${lia.grupoId}, 'courtesy', 'gratis', now(), now() + interval '1 day', 'alfa_equipe')`),
      ),
    ).toBe(CHECAGEM);
    expect(await codigoDoBanco(db.insert(entitlements).values(base))).toBeUndefined();
  });

  it("sessão de aparelho de conta sempre tem a conta e a sessão de login", async () => {
    const conta = await novaConta();
    expect(
      await codigoDoBanco(
        db.insert(deviceSessions).values({ kind: "account", expiresAt: daqui(60_000) }),
      ),
    ).toBe(CHECAGEM);
    const authSessionId = randomUUID();
    const linha = {
      kind: "account" as const,
      authSessionId,
      userId: conta.id,
      expiresAt: daqui(60_000),
    };
    expect(await codigoDoBanco(db.insert(deviceSessions).values(linha))).toBeUndefined();
    expect(await codigoDoBanco(db.insert(deviceSessions).values(linha))).toBe(UNICO);
  });
});
