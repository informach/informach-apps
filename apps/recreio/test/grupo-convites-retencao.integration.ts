import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  recreioGroups as groups,
  recreioGroupInvites as invites,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import {
  LOTE_DE_CONVITES_DE_GRUPO,
  LOTE_DE_RECIBOS_DE_GRUPO,
  limparConvitesDeGrupo,
} from "@/features/grupo/convites-retencao-repository";
import { eventosCom, novaConta, sinal } from "./apoio";

async function preparar(quantos: number) {
  const conta = await novaConta();
  const [grupo] = await db.insert(groups).values({ ownerUserId: conta.id }).returning();
  if (!grupo) throw new Error("Grupo ausente");
  const vencidos = await db
    .insert(invites)
    .values(
      Array.from({ length: quantos }, (_, n) => ({
        groupId: grupo.id,
        inviterUserId: conta.id,
        inviterDeclarationVersion: "adulto-2026-11-17",
        recipientEmail: `${crypto.randomUUID()}@example.test`,
        recipientUserId: conta.id,
        createdAt: new Date(Date.now() - 80_000 - n),
        expiresAt: new Date(Date.now() - 60_000 - n),
      })),
    )
    .returning();
  return { conta, grupo, vencidos };
}

describe("retenção global dos convites comerciais", () => {
  it("retira endereço e vínculo expirados, mantém convite vigente e não duplica auditoria", async () => {
    const r = await preparar(2);
    const [vigente] = await db
      .insert(invites)
      .values({
        groupId: r.grupo.id,
        inviterUserId: r.conta.id,
        inviterDeclarationVersion: "adulto-2026-11-17",
        recipientEmail: `${crypto.randomUUID()}@example.test`,
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    const resultado = await limparConvitesDeGrupo();
    expect(resultado.convitesDeGrupoVencidos).toBeGreaterThanOrEqual(2);
    for (const antes of r.vencidos) {
      expect((await db.select().from(invites).where(eq(invites.id, antes.id)))[0]).toMatchObject({
        state: "expired",
        recipientEmail: null,
        recipientUserId: null,
      });
      const auditoria = (await eventosCom("inviteId", antes.id)).filter(
        (e) => e.eventType === "recreio.group_invite_expired",
      );
      expect(auditoria).toHaveLength(1);
      expect(JSON.stringify(auditoria)).not.toContain(antes.recipientEmail);
    }
    if (!vigente) throw new Error("Convite ausente");
    expect((await db.select().from(invites).where(eq(invites.id, vigente.id)))[0]).toEqual(vigente);
    await limparConvitesDeGrupo();
    for (const antes of r.vencidos)
      expect(
        (await eventosCom("inviteId", antes.id)).filter(
          (e) => e.eventType === "recreio.group_invite_expired",
        ),
      ).toHaveLength(1);
  });

  it("falha da auditoria reverte inclusive a retirada do endereço", async () => {
    const r = await preparar(1);
    await db.execute(sql`create function audit.recusar_expiracao_grupo_teste() returns trigger language plpgsql as $$ begin
      if new.event_type='recreio.group_invite_expired' then raise exception 'audit unavailable'; end if; return new; end $$`);
    await db.execute(
      sql`create trigger recusar_expiracao_grupo_teste before insert on audit.events for each row execute function audit.recusar_expiracao_grupo_teste()`,
    );
    try {
      await expect(limparConvitesDeGrupo()).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(await db.select().from(invites).where(eq(invites.groupId, r.grupo.id))).toEqual(
        r.vencidos,
      );
    } finally {
      await db.execute(sql`drop trigger recusar_expiracao_grupo_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_expiracao_grupo_teste()`);
    }
  });

  it("lotes são limitados e SKIP LOCKED deixa outro worker continuar", async () => {
    // Não depender de pendências que outro teste tenha deixado.
    while ((await limparConvitesDeGrupo()).convitesDeGrupoVencidos > 0) {
      /* consome lotes do banco isolado */
    }
    const r = await preparar(LOTE_DE_CONVITES_DE_GRUPO + 1);
    const primeiro = r.vencidos[0];
    if (!primeiro) throw new Error("Convite ausente");
    const travado = sinal<void>();
    const soltar = sinal<void>();
    const trava = db.transaction(async (tx) => {
      await tx.select().from(invites).where(eq(invites.id, primeiro.id)).for("update");
      travado.concluir();
      await soltar.promessa;
    });
    await travado.promessa;
    try {
      expect((await limparConvitesDeGrupo()).convitesDeGrupoVencidos).toBe(
        LOTE_DE_CONVITES_DE_GRUPO,
      );
      expect((await db.select().from(invites).where(eq(invites.id, primeiro.id)))[0]?.state).toBe(
        "pending",
      );
    } finally {
      soltar.concluir();
      await trava;
    }
    expect((await limparConvitesDeGrupo()).convitesDeGrupoVencidos).toBe(1);
  });

  it("apaga recibos técnicos antigos sem retirar a participação aceita", async () => {
    while ((await limparConvitesDeGrupo()).recibosDeGrupoApagados > 0) {
      /* consome lotes do banco isolado */
    }
    const conta = await novaConta();
    const [grupo] = await db.insert(groups).values({ ownerUserId: conta.id }).returning();
    if (!grupo) throw new Error("Grupo ausente");
    const [perfil] = await db
      .insert(profiles)
      .values({
        userId: conta.id,
        groupId: grupo.id,
        kind: "adult",
        nickname: "Lua",
        avatar: "padrao",
      })
      .returning();
    if (!perfil) throw new Error("Perfil ausente");
    const antigos = await db
      .insert(invites)
      .values(
        Array.from({ length: LOTE_DE_RECIBOS_DE_GRUPO + 1 }, () => ({
          groupId: grupo.id,
          inviterUserId: conta.id,
          inviterDeclarationVersion: "adulto-2026-11-17",
          state: "accepted" as const,
          createdAt: new Date(Date.now() - 3 * 86_400_000),
          expiresAt: new Date(Date.now() - 86_400_000),
          finishedAt: new Date(Date.now() - 2 * 86_400_000),
          acceptedUserId: conta.id,
          acceptedProfileId: perfil.id,
          recipientDeclarationVersion: "adulto-2026-11-17",
          requestHash: "a".repeat(64),
        })),
      )
      .returning({ id: invites.id });
    expect((await limparConvitesDeGrupo()).recibosDeGrupoApagados).toBe(LOTE_DE_RECIBOS_DE_GRUPO);
    expect(
      await db
        .select()
        .from(invites)
        .where(
          and(
            eq(invites.groupId, grupo.id),
            inArray(
              invites.id,
              antigos.map((i) => i.id),
            ),
          ),
        ),
    ).toHaveLength(1);
    expect((await db.select().from(profiles).where(eq(profiles.id, perfil.id)))[0]).toEqual(perfil);
    expect((await limparConvitesDeGrupo()).recibosDeGrupoApagados).toBe(1);
    expect((await db.select().from(profiles).where(eq(profiles.id, perfil.id)))[0]).toEqual(perfil);
  });
});
