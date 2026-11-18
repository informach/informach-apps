import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioSafetyReports as reports,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import type { AutorDoProtocolo } from "@/features/moderacao/acompanhamento-repository";
import {
  acompanharDenuncias,
  pedirRevisaoDaDenuncia,
} from "@/features/moderacao/acompanhamento-service";
import { denunciarContato } from "@/features/moderacao/denuncias-service";
import { emitirCodigoDeAmigo, pedirAmizade } from "@/features/social/service";
import { eventosCom, novoJogador } from "./apoio";
import { familiaSocial, referenciaSocial as ref } from "./social-apoio";

async function preparar() {
  const a = await novoJogador({ comAcesso: false }),
    b = await novoJogador({ comAcesso: false });
  const codigo = await emitirCodigoDeAmigo(ref(b));
  await pedirAmizade(ref(a), { codigo: codigo.codigo, pedidoId: crypto.randomUUID() });
  const caso = await denunciarContato(ref(a), {
    perfilId: b.perfil.id,
    denunciaId: crypto.randomUUID(),
    categoria: "ameaca",
  });
  await db
    .update(reports)
    .set({ state: "resolvida", decision: "sem_elementos", revision: 2, updatedAt: new Date() })
    .where(eq(reports.id, caso.protocolo));
  const autor: AutorDoProtocolo = { tipo: "jogador", jogador: ref(a) };
  const pedido = { protocolo: caso.protocolo, versaoDoCaso: 2, recursoId: crypto.randomUUID() };
  return { a, b, autor, pedido };
}
describe("quem denunciou acompanha a própria resposta e pode pedir uma revisão", () => {
  it("alvo e outro perfil não veem o caso; projeção própria não expõe a outra ponta", async () => {
    const r = await preparar();
    const propria = await acompanharDenuncias(r.autor, r.pedido.protocolo);
    expect(propria.denuncias).toMatchObject([
      { protocolo: r.pedido.protocolo, situacao: "resolvida", podePedirRevisao: true },
    ]);
    const texto = JSON.stringify(propria);
    for (const privado of [
      r.b.perfil.id,
      r.b.conta.id,
      r.b.conta.email,
      "targetProfileId",
      "actorUserId",
      "requestHash",
      "evidenceId",
    ])
      expect(texto).not.toContain(privado);
    expect(
      (await acompanharDenuncias({ tipo: "jogador", jogador: ref(r.b) }, r.pedido.protocolo))
        .denuncias,
    ).toEqual([]);
    await expect(
      pedirRevisaoDaDenuncia({ tipo: "jogador", jogador: ref(r.b) }, r.pedido),
    ).rejects.toMatchObject({ code: "PROTOCOLO" });
    await expect(
      pedirRevisaoDaDenuncia(r.autor, { ...r.pedido, actorUserId: r.b.conta.id }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });
  it("repetições concorrentes reabrem uma única vez e não reatribuem a denúncia", async () => {
    const r = await preparar();
    const recibos = await Promise.all([
      pedirRevisaoDaDenuncia(r.autor, r.pedido),
      pedirRevisaoDaDenuncia(r.autor, r.pedido),
    ]);
    expect(recibos.map((x) => x.repetido).sort()).toEqual([false, true]);
    const [caso] = await db.select().from(reports).where(eq(reports.id, r.pedido.protocolo));
    expect(caso).toMatchObject({
      state: "recurso",
      revision: 3,
      reviewRevision: 3,
      actorUserId: r.a.conta.id,
      reviewActorUserId: r.a.conta.id,
      reviewActorKind: "jogador",
    });
    expect(caso?.reviewRequestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (await eventosCom("reportId", r.pedido.protocolo)).filter(
        (e) => e.eventType === "recreio.safety_review_requested",
      ),
    ).toHaveLength(1);
    await db
      .update(reports)
      .set({ state: "resolvida", revision: 5, updatedAt: new Date() })
      .where(eq(reports.id, r.pedido.protocolo));
    expect(await pedirRevisaoDaDenuncia(r.autor, r.pedido)).toMatchObject({ repetido: true });
    await expect(
      pedirRevisaoDaDenuncia(r.autor, {
        ...r.pedido,
        recursoId: crypto.randomUUID(),
        versaoDoCaso: 5,
      }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(
      pedirRevisaoDaDenuncia(r.autor, { ...r.pedido, versaoDoCaso: 5 }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
  });
  it("responsável sem jogador recorre da resposta do menor, sem mudar autoria infantil", async () => {
    const familia = await familiaSocial(15),
      outro = await familiaSocial(15),
      adulto = await novoJogador({ comAcesso: false });
    const codigo = await emitirCodigoDeAmigo(familia.referencia);
    await pedirAmizade(ref(adulto), { codigo: codigo.codigo, pedidoId: crypto.randomUUID() });
    const caso = await denunciarContato(familia.referencia, {
      perfilId: adulto.perfil.id,
      denunciaId: crypto.randomUUID(),
      categoria: "outro",
    });
    await db
      .update(reports)
      .set({ state: "resolvida", revision: 2, decision: "sem_elementos", updatedAt: new Date() })
      .where(eq(reports.id, caso.protocolo));
    const autor: AutorDoProtocolo = {
      tipo: "gestor",
      nativo: familia.autor,
      perfilId: familia.perfil.id,
    };
    const pedido = { protocolo: caso.protocolo, versaoDoCaso: 2, recursoId: crypto.randomUUID() };
    await pedirRevisaoDaDenuncia(autor, pedido);
    expect(
      (await db.select().from(reports).where(eq(reports.id, caso.protocolo)))[0],
    ).toMatchObject({
      actorUserId: null,
      actorKind: "jogador",
      reviewActorUserId: familia.conta.id,
      reviewActorKind: "responsavel",
    });
    const [nova] = await db
      .select()
      .from(guardians)
      .where(eq(guardians.profileId, outro.perfil.id));
    if (!nova) throw new Error("Declaração ausente");
    await db
      .update(guardians)
      .set({ guardianUserId: outro.conta.id, declarationId: nova.declarationId })
      .where(eq(guardians.profileId, familia.perfil.id));
    await expect(acompanharDenuncias(autor, caso.protocolo)).rejects.toMatchObject({
      code: "PERFIL",
    });
    await expect(pedirRevisaoDaDenuncia(autor, pedido)).rejects.toMatchObject({ code: "PERFIL" });
  });
  it("prazo encerrado e recibo antigo sem proveniência não autorizam novo recurso ou replay", async () => {
    const r = await preparar(),
      criado = new Date(Date.now() - 40 * 86_400_000);
    await db
      .update(reports)
      .set({
        createdAt: criado,
        updatedAt: new Date(Date.now() - 31 * 86_400_000),
        expiresAt: new Date(criado.getTime() + 180 * 86_400_000),
      })
      .where(eq(reports.id, r.pedido.protocolo));
    expect(
      (await acompanharDenuncias(r.autor, r.pedido.protocolo)).denuncias[0]?.podePedirRevisao,
    ).toBe(false);
    await expect(pedirRevisaoDaDenuncia(r.autor, r.pedido)).rejects.toMatchObject({
      code: "CONFLITO",
    });
    await db
      .update(reports)
      .set({
        state: "recurso",
        revision: 3,
        updatedAt: new Date(),
        reviewRequestedAt: new Date(),
        reviewClientKey: r.pedido.recursoId,
        reviewRevision: 3,
      })
      .where(eq(reports.id, r.pedido.protocolo));
    await expect(pedirRevisaoDaDenuncia(r.autor, r.pedido)).rejects.toMatchObject({
      code: "CONFLITO",
    });
  });
  it("falha da auditoria reverte pedido, revisão e proveniência", async () => {
    const r = await preparar();
    await db.execute(
      sql`create function audit.falhar_revisao_denuncia_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.safety_review_requested' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger falhar_revisao_denuncia_teste before insert on audit.events for each row execute function audit.falhar_revisao_denuncia_teste()`,
    );
    try {
      await expect(pedirRevisaoDaDenuncia(r.autor, r.pedido)).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(
        (await db.select().from(reports).where(eq(reports.id, r.pedido.protocolo)))[0],
      ).toMatchObject({
        state: "resolvida",
        revision: 2,
        reviewRequestedAt: null,
        reviewActorUserId: null,
        reviewActorKind: null,
        reviewRequestHash: null,
      });
    } finally {
      await db.execute(sql`drop trigger falhar_revisao_denuncia_teste on audit.events`);
      await db.execute(sql`drop function audit.falhar_revisao_denuncia_teste()`);
    }
  });
  it("prazo do caso vencido durante a auditoria reverte a revisão", async () => {
    const r = await preparar();
    await db
      .update(reports)
      .set({ expiresAt: new Date(Date.now() + 1000) })
      .where(eq(reports.id, r.pedido.protocolo));
    await db.execute(
      sql`create function audit.esperar_revisao_denuncia_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.safety_review_requested' then perform pg_sleep(1.1); end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger esperar_revisao_denuncia_teste before insert on audit.events for each row execute function audit.esperar_revisao_denuncia_teste()`,
    );
    try {
      await expect(pedirRevisaoDaDenuncia(r.autor, r.pedido)).rejects.toMatchObject({
        code: "CONFLITO",
      });
      expect(
        (await db.select().from(reports).where(eq(reports.id, r.pedido.protocolo)))[0]?.revision,
      ).toBe(2);
    } finally {
      await db.execute(sql`drop trigger esperar_revisao_denuncia_teste on audit.events`);
      await db.execute(sql`drop function audit.esperar_revisao_denuncia_teste()`);
    }
  });
});
