import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGuardianLinks as guardians,
  recreioProfiles as profiles,
  recreioSafetyReports as reports,
  recreioProfileRestrictions as restrictions,
  recreioRestrictionReviews as reviews,
  sessions,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { denunciarContato } from "@/features/moderacao/denuncias-service";
import { consultarRestricao, pedirRevisaoDaRestricao } from "@/features/moderacao/recurso-service";
import { emitirCodigoDeAmigo, pedirAmizade } from "@/features/social/service";
import { eventosCom, novoJogador } from "./apoio";
import { familiaSocial, referenciaSocial as ref } from "./social-apoio";

async function adultoSuspenso() {
  const jogador = await novoJogador({ comAcesso: false, apelido: "Quem recorre" });
  const [sessao] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, jogador.login.authSessionId));
  if (!sessao) throw new Error("Sessão ausente");
  const autor: AutorNativoRecente = {
    ...jogador.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  await db.update(profiles).set({ status: "suspended" }).where(eq(profiles.id, jogador.perfil.id));
  const entrada = {
    perfilId: jogador.perfil.id,
    recursoId: crypto.randomUUID(),
    versaoDoPerfil: jogador.perfil.versaoDaPolitica,
  };
  return { jogador, autor, entrada };
}

describe("pessoa suspensa conserva direito próprio de revisão, separado da denúncia", () => {
  it("adulto sem cobertura recorre de suspensão legada sem inventar autor ou data da imposição", async () => {
    const r = await adultoSuspenso();
    expect(await consultarRestricao(r.autor, r.entrada.perfilId)).toMatchObject({
      suspenso: true,
      podeRecorrer: true,
      recursos: [],
    });
    const recibo = await pedirRevisaoDaRestricao(r.autor, r.entrada);
    const [fato] = await db
      .select()
      .from(restrictions)
      .where(eq(restrictions.profileId, r.entrada.perfilId));
    expect(fato).toMatchObject({
      state: "suspended",
      reason: "legado_sem_recibo",
      sourceReportId: null,
      moderatorUserId: null,
    });
    expect(await pedirRevisaoDaRestricao(r.autor, r.entrada)).toEqual({
      protocolo: recibo.protocolo,
      repetido: true,
    });
    expect(await consultarRestricao(r.autor, r.entrada.perfilId)).toMatchObject({
      podeRecorrer: false,
      recursos: [{ protocolo: recibo.protocolo, situacao: "aberto" }],
    });
    expect(
      (await db.select().from(profiles).where(eq(profiles.id, r.entrada.perfilId)))[0]?.status,
    ).toBe("suspended");
    expect(
      (await eventosCom("reviewId", recibo.protocolo)).filter(
        (e) => e.eventType === "recreio.restriction_review_requested",
      ),
    ).toHaveLength(1);
  });
  it("novos nonces simultâneos do mesmo titular não multiplicam pedidos da mesma restrição", async () => {
    const r = await adultoSuspenso();
    const recibos = await Promise.all([
      pedirRevisaoDaRestricao(r.autor, r.entrada),
      pedirRevisaoDaRestricao(r.autor, { ...r.entrada, recursoId: crypto.randomUUID() }),
    ]);
    expect(recibos[0]?.protocolo).toBe(recibos[1]?.protocolo);
    expect(
      await db.select().from(reviews).where(eq(reviews.profileId, r.entrada.perfilId)),
    ).toHaveLength(1);
  });
  it("corpo alterado no replay e perfil de outra conta são recusados", async () => {
    const r = await adultoSuspenso(),
      outra = await adultoSuspenso();
    await pedirRevisaoDaRestricao(r.autor, r.entrada);
    await expect(
      pedirRevisaoDaRestricao(r.autor, {
        ...r.entrada,
        versaoDoPerfil: r.entrada.versaoDoPerfil + 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(consultarRestricao(outra.autor, r.entrada.perfilId)).rejects.toMatchObject({
      code: "PERFIL",
    });
    await expect(pedirRevisaoDaRestricao(outra.autor, r.entrada)).rejects.toMatchObject({
      code: "PERFIL",
    });
    await expect(
      pedirRevisaoDaRestricao(r.autor, { ...r.entrada, actorUserId: outra.autor.contaId }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });
  it("responsável sem jogador recorre pelo menor; pareado e antigo responsável não herdam o poder", async () => {
    const r = await familiaSocial(),
      outra = await familiaSocial();
    await db.update(profiles).set({ status: "suspended" }).where(eq(profiles.id, r.perfil.id));
    const entrada = {
      perfilId: r.perfil.id,
      recursoId: crypto.randomUUID(),
      versaoDoPerfil: (await consultarRestricao(r.autor, r.perfil.id)).versaoDoPerfil,
    };
    await expect(
      pedirRevisaoDaRestricao(
        { ...r.autor, sessaoDeAparelhoId: r.referencia.sessaoDeAparelhoId },
        entrada,
      ),
    ).rejects.toMatchObject({ code: "AUTH" });
    const recibo = await pedirRevisaoDaRestricao(r.autor, entrada);
    expect(
      (await db.select().from(reviews).where(eq(reviews.id, recibo.protocolo)))[0],
    ).toMatchObject({ actorKind: "responsavel", actorUserId: r.conta.id });
    expect(await db.select().from(profiles).where(eq(profiles.userId, r.conta.id))).toHaveLength(0);
    // O dono comercial continua o mesmo; a responsabilidade atual é retirada.
    const [novoResponsavel] = await db
      .select({ declarationId: guardians.declarationId })
      .from(guardians)
      .where(eq(guardians.profileId, outra.perfil.id));
    if (!novoResponsavel) throw new Error("Declaração do novo responsável ausente");
    await db
      .update(guardians)
      .set({ guardianUserId: outra.conta.id, declarationId: novoResponsavel.declarationId })
      .where(eq(guardians.profileId, r.perfil.id));
    await expect(pedirRevisaoDaRestricao(r.autor, entrada)).rejects.toMatchObject({
      code: "PERFIL",
    });
  });
  it("expurgar denúncia não elimina restrição nem expõe denunciante a quem recorre", async () => {
    const r = await adultoSuspenso(),
      a = await novoJogador({ comAcesso: false, apelido: "Origem reservada" });
    await db.update(profiles).set({ status: "active" }).where(eq(profiles.id, r.entrada.perfilId));
    const codigo = await emitirCodigoDeAmigo(ref(r.jogador));
    await pedirAmizade(ref(a), { codigo: codigo.codigo, pedidoId: crypto.randomUUID() });
    const denuncia = await denunciarContato(ref(a), {
      perfilId: r.entrada.perfilId,
      denunciaId: crypto.randomUUID(),
      categoria: "ameaca",
    });
    const agora = new Date();
    await db
      .update(profiles)
      .set({ status: "suspended" })
      .where(eq(profiles.id, r.entrada.perfilId));
    await db.insert(restrictions).values({
      profileId: r.entrada.perfilId,
      revision: r.entrada.versaoDoPerfil,
      state: "suspended",
      reason: "medida_preventiva",
      sourceReportId: denuncia.protocolo,
      createdAt: agora,
      updatedAt: agora,
    });
    await db.delete(reports).where(eq(reports.id, denuncia.protocolo));
    expect(
      (
        await db.select().from(restrictions).where(eq(restrictions.profileId, r.entrada.perfilId))
      )[0]?.sourceReportId,
    ).toBeNull();
    const recibo = await pedirRevisaoDaRestricao(r.autor, r.entrada);
    const leitura = JSON.stringify(await consultarRestricao(r.autor, r.entrada.perfilId));
    expect(leitura).toContain(recibo.protocolo);
    for (const reservado of [
      a.conta.id,
      a.conta.email,
      a.perfil.id,
      a.perfil.apelido,
      denuncia.protocolo,
    ])
      expect(leitura).not.toContain(reservado);
  });
  it("falha da auditoria reverte recurso e reconciliação legada", async () => {
    const r = await adultoSuspenso();
    await db.execute(
      sql`create function audit.falhar_recurso_restricao_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.restriction_review_requested' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger falhar_recurso_restricao_teste before insert on audit.events for each row execute function audit.falhar_recurso_restricao_teste()`,
    );
    try {
      await expect(pedirRevisaoDaRestricao(r.autor, r.entrada)).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(
        await db.select().from(reviews).where(eq(reviews.profileId, r.entrada.perfilId)),
      ).toHaveLength(0);
      expect(
        await db.select().from(restrictions).where(eq(restrictions.profileId, r.entrada.perfilId)),
      ).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger falhar_recurso_restricao_teste on audit.events`);
      await db.execute(sql`drop function audit.falhar_recurso_restricao_teste()`);
    }
  });
  it("prazo nativo perdido durante auditoria não deixa o recurso gravado", async () => {
    const r = await adultoSuspenso();
    await db
      .update(devices)
      .set({ expiresAt: new Date(Date.now() + 1000) })
      .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    await db.execute(
      sql`create function audit.esperar_recurso_restricao_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.restriction_review_requested' then perform pg_sleep(1.1); end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger esperar_recurso_restricao_teste before insert on audit.events for each row execute function audit.esperar_recurso_restricao_teste()`,
    );
    try {
      await expect(pedirRevisaoDaRestricao(r.autor, r.entrada)).rejects.toMatchObject({
        code: "AUTH",
      });
      expect(
        await db.select().from(reviews).where(eq(reviews.profileId, r.entrada.perfilId)),
      ).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger esperar_recurso_restricao_teste on audit.events`);
      await db.execute(sql`drop function audit.esperar_recurso_restricao_teste()`);
    }
  });
});
