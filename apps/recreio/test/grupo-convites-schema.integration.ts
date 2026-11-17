import { db, eq } from "@informach/db";
import {
  recreioGroups as groups,
  recreioGroupInvites as invites,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { CHECAGEM, codigoDoBanco, novoJogador, UNICO } from "./apoio";

async function preparar() {
  const emissor = await novoJogador({ comAcesso: false });
  const destinatario = await novoJogador({ comAcesso: false });
  const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, emissor.conta.id));
  if (!grupo) throw new Error("Grupo ausente");
  const agora = new Date();
  const pendente = {
    groupId: grupo.id,
    inviterUserId: emissor.conta.id,
    inviterDeclarationVersion: "adulto-2026-11-17",
    recipientEmail: destinatario.conta.email,
    createdAt: agora,
    expiresAt: new Date(agora.getTime() + 72 * 60 * 60_000),
  };
  const aceito = {
    ...pendente,
    state: "accepted" as const,
    recipientEmail: null,
    finishedAt: new Date(agora.getTime() + 1),
    acceptedProfileId: destinatario.perfil.id,
    acceptedUserId: destinatario.conta.id,
    recipientDeclarationVersion: "adulto-2026-11-17",
    requestHash: "0".repeat(64),
  };
  return { emissor, destinatario, grupo, pendente, aceito };
}

describe("integridade do convite comercial e de seu recibo", () => {
  it("FK de emissão exige o titular daquele grupo e a pendência é única por endereço", async () => {
    const r = await preparar();
    expect(
      await codigoDoBanco(
        db.insert(invites).values({
          ...r.pendente,
          inviterUserId: r.destinatario.conta.id,
        }),
      ),
    ).toBe("23503");
    await db.insert(invites).values(r.pendente);
    expect(await codigoDoBanco(db.insert(invites).values(r.pendente))).toBe(UNICO);
  });

  it("recusa endereço não normalizado, prazo maior que 72 horas e aceite sem data", async () => {
    const r = await preparar();
    for (const mudanca of [
      { recipientEmail: ` ${r.destinatario.conta.email.toUpperCase()} ` },
      { recipientEmail: null },
      { expiresAt: new Date(r.pendente.expiresAt.getTime() + 1) },
      { expiresAt: r.pendente.createdAt },
    ]) {
      expect(await codigoDoBanco(db.insert(invites).values({ ...r.pendente, ...mudanca }))).toBe(
        CHECAGEM,
      );
    }
    expect(await codigoDoBanco(db.insert(invites).values({ ...r.aceito, finishedAt: null }))).toBe(
      CHECAGEM,
    );
  });

  it("aceite não conserva endereço e exige o par perfil/login da própria pessoa", async () => {
    const r = await preparar();
    expect(
      await codigoDoBanco(
        db.insert(invites).values({
          ...r.aceito,
          recipientEmail: r.pendente.recipientEmail,
        }),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.insert(invites).values({
          ...r.aceito,
          acceptedUserId: r.emissor.conta.id,
        }),
      ),
    ).toBe("23503");
    expect(
      await codigoDoBanco(
        db.insert(invites).values({
          ...r.aceito,
          acceptedProfileId: null,
        }),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.insert(invites).values({
          ...r.aceito,
          recipientDeclarationVersion: null,
        }),
      ),
    ).toBe(CHECAGEM);
  });

  it("vencido exige data posterior ao prazo e terminal nunca conserva endereço", async () => {
    const r = await preparar();
    expect(
      await codigoDoBanco(
        db.insert(invites).values({
          ...r.pendente,
          state: "expired",
          recipientEmail: null,
          finishedAt: r.pendente.createdAt,
        }),
      ),
    ).toBe(CHECAGEM);
    expect(
      await codigoDoBanco(
        db.insert(invites).values({
          ...r.pendente,
          state: "revoked",
          finishedAt: r.pendente.expiresAt,
        }),
      ),
    ).toBe(CHECAGEM);
    await db.insert(invites).values({
      ...r.pendente,
      state: "expired",
      recipientEmail: null,
      finishedAt: r.pendente.expiresAt,
    });
  });

  it("apagar o perfil retira o par do recibo atomicamente e não inventa novo aceite", async () => {
    const r = await preparar();
    const [recibo] = await db.insert(invites).values(r.aceito).returning();
    if (!recibo) throw new Error("Recibo ausente");
    await db.delete(profiles).where(eq(profiles.id, r.destinatario.perfil.id));
    const [depois] = await db.select().from(invites).where(eq(invites.id, recibo.id));
    expect(depois).toEqual({ ...recibo, acceptedProfileId: null, acceptedUserId: null });
  });

  it("remover o grupo não apaga a identidade adulta que estava coberta", async () => {
    const r = await preparar();
    await db
      .update(profiles)
      .set({ groupId: r.grupo.id })
      .where(eq(profiles.id, r.destinatario.perfil.id));
    await db.insert(invites).values(r.aceito);
    await db.delete(groups).where(eq(groups.id, r.grupo.id));
    const [perfil] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, r.destinatario.perfil.id));
    expect(perfil).toMatchObject({
      id: r.destinatario.perfil.id,
      userId: r.destinatario.conta.id,
      groupId: null,
    });
    expect(await db.select().from(invites).where(eq(invites.groupId, r.grupo.id))).toEqual([]);
  });
});
