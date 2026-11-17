import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioSafetyReports as reports,
  recreioProfileRestrictions as restrictions,
  recreioRestrictionReviews as reviews,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import {
  exigirFilaDeSegurancaEmDia,
  limparDenuncias,
} from "@/features/moderacao/retencao-repository";
import { novoJogador } from "./apoio";

const DIA = 86_400_000;
async function caso() {
  const perfil = await novoJogador({ comAcesso: false });
  const criadoEm = new Date(Date.now() - 60 * DIA);
  const [relato] = await db
    .insert(reports)
    .values({
      reporterProfileId: perfil.perfil.id,
      actorUserId: perfil.conta.id,
      actorKind: "jogador",
      clientKey: crypto.randomUUID(),
      requestHash: "a".repeat(64),
      category: "outro",
      priority: false,
      evidenceKind: "protecao",
      state: "resolvida",
      decision: "sem_elementos",
      createdAt: criadoEm,
      updatedAt: new Date(Date.now() - 31 * DIA),
      expiresAt: new Date(criadoEm.getTime() + 180 * DIA),
    })
    .returning();
  if (!relato) throw new Error("Denúncia ausente");
  return { perfil, relato };
}
describe("retenção fecha casos atendidos e preserva direito sobre restrições vigentes", () => {
  it("encerra após trinta dias sem prorrogar o teto e sem repetir revisão", async () => {
    const r = await caso();
    expect((await limparDenuncias()).denunciasEncerradas).toBeGreaterThanOrEqual(1);
    const [primeira] = await db.select().from(reports).where(eq(reports.id, r.relato.id));
    expect(primeira).toMatchObject({ state: "encerrada", revision: 2 });
    expect(primeira?.closedAt).not.toBeNull();
    expect(primeira?.expiresAt.getTime()).toBeLessThanOrEqual(r.relato.expiresAt.getTime());
    await limparDenuncias();
    expect((await db.select().from(reports).where(eq(reports.id, r.relato.id)))[0]).toEqual(
      primeira,
    );
  });
  it("nova contestação usa seu recebimento; movimentar caso não esconde atraso", async () => {
    const r = await caso(),
      agora = new Date();
    await db
      .update(reports)
      .set({
        state: "recurso",
        revision: 2,
        reviewRevision: 2,
        reviewRequestedAt: agora,
        reviewClientKey: crypto.randomUUID(),
        priority: true,
        updatedAt: agora,
      })
      .where(eq(reports.id, r.relato.id));
    const primeira = await limparDenuncias();
    expect(primeira.denunciasPrioritariasAtrasadas).toBe(0);
    await db
      .update(reports)
      .set({
        state: "em_analise",
        reviewRequestedAt: new Date(Date.now() - 25 * 3_600_000),
        updatedAt: new Date(),
      })
      .where(eq(reports.id, r.relato.id));
    const segunda = await limparDenuncias();
    expect(segunda.denunciasPrioritariasAtrasadas).toBeGreaterThanOrEqual(1);
    expect(() => exigirFilaDeSegurancaEmDia(segunda)).toThrow();
    await db.delete(reports).where(eq(reports.id, r.relato.id));
  });
  it("expurga recurso vencido sem chamar de resolvido e conserva restrição ativa", async () => {
    const r = await caso(),
      criadoEm = new Date(Date.now() - 181 * DIA);
    await db.insert(restrictions).values({
      profileId: r.perfil.perfil.id,
      state: "suspended",
      reason: "medida_preventiva",
      sourceReportId: r.relato.id,
      createdAt: criadoEm,
      updatedAt: criadoEm,
    });
    const [recurso] = await db
      .insert(reviews)
      .values({
        profileId: r.perfil.perfil.id,
        restrictionRevision: 1,
        clientKey: crypto.randomUUID(),
        requestHash: "b".repeat(64),
        actorUserId: r.perfil.conta.id,
        actorKind: "titular",
        createdAt: criadoEm,
        expiresAt: new Date(criadoEm.getTime() + 180 * DIA),
      })
      .returning();
    if (!recurso) throw new Error("Recurso ausente");
    const resultado = await limparDenuncias();
    expect(resultado.recursosDeRestricaoVencidosSemSolucao).toBeGreaterThanOrEqual(1);
    expect(() => exigirFilaDeSegurancaEmDia(resultado)).toThrow();
    expect(await db.select().from(reviews).where(eq(reviews.id, recurso.id))).toHaveLength(0);
    expect(
      (
        await db.select().from(restrictions).where(eq(restrictions.profileId, r.perfil.perfil.id))
      )[0]?.state,
    ).toBe("suspended");
  });
  it("recibos liberados saem aos noventa dias; auditoria indisponível impede a remoção", async () => {
    const r = await caso(),
      liberadoEm = new Date(Date.now() - 91 * DIA);
    await db.insert(restrictions).values({
      profileId: r.perfil.perfil.id,
      state: "released",
      reason: "recurso_procedente",
      revision: 3,
      createdAt: liberadoEm,
      updatedAt: liberadoEm,
      releasedAt: liberadoEm,
    });
    await db.execute(
      sql`create function audit.falhar_moderacao_retencao_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.moderation_retention' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger falhar_moderacao_retencao_teste before insert on audit.events for each row execute function audit.falhar_moderacao_retencao_teste()`,
    );
    try {
      await expect(limparDenuncias()).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(
        await db.select().from(restrictions).where(eq(restrictions.profileId, r.perfil.perfil.id)),
      ).toHaveLength(1);
    } finally {
      await db.execute(sql`drop trigger falhar_moderacao_retencao_teste on audit.events`);
      await db.execute(sql`drop function audit.falhar_moderacao_retencao_teste()`);
    }
    expect((await limparDenuncias()).restricoesLiberadasApagadas).toBeGreaterThanOrEqual(1);
    expect(
      await db.select().from(restrictions).where(eq(restrictions.profileId, r.perfil.perfil.id)),
    ).toHaveLength(0);
  });
});
