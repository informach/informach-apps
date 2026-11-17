import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioProfiles as profiles,
  recreioSafetyReports as reports,
} from "@informach/db/schema";
import { DenunciaDeContatoSchema } from "@informach/recreio/contrato";
import { describe, expect, it } from "vitest";
import { denunciarContato, denunciarContatoDoMenor } from "@/features/moderacao/denuncias-service";
import { emitirCodigoDeAmigo, pedirAmizade, protegerContato } from "@/features/social/service";
import { eventosCom, novoJogador } from "./apoio";
import { familiaSocial, referenciaSocial as ref } from "./social-apoio";

async function par() {
  const a = await novoJogador({ comAcesso: false }),
    b = await novoJogador({ comAcesso: false });
  const codigo = await emitirCodigoDeAmigo(ref(b));
  const pedido = await pedirAmizade(ref(a), {
    codigo: codigo.codigo,
    pedidoId: crypto.randomUUID(),
  });
  const entrada = {
    perfilId: b.perfil.id,
    denunciaId: crypto.randomUUID(),
    categoria: "contato_indesejado" as const,
  };
  return { a, b, pedido, entrada };
}

describe("denúncia conserva fato mínimo, autoridade, repetição e auditoria", () => {
  it("pedido conhecido sem cobertura produz um protocolo sem duplicar nem ampliar prazo", async () => {
    const r = await par();
    const recibo = await denunciarContato(ref(r.a), r.entrada);
    const [antes] = await db.select().from(reports).where(eq(reports.id, recibo.protocolo));
    expect(antes).toMatchObject({
      reporterProfileId: r.a.perfil.id,
      targetProfileId: r.b.perfil.id,
      actorUserId: r.a.conta.id,
      actorKind: "jogador",
      priority: false,
      evidenceKind: "pedido",
      evidenceId: r.pedido.pedidoId,
      state: "aberta",
    });
    expect(await denunciarContato(ref(r.a), r.entrada)).toEqual({
      protocolo: recibo.protocolo,
      repetida: true,
    });
    expect((await db.select().from(reports).where(eq(reports.id, recibo.protocolo)))[0]).toEqual(
      antes,
    );
    const eventos = (await eventosCom("reportId", recibo.protocolo)).filter(
      (e) => e.eventType === "recreio.safety_reported",
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.actorId).toBe(r.a.conta.id);
    expect(JSON.stringify(eventos)).not.toContain(r.a.perfil.apelido);
    expect(JSON.stringify(eventos)).not.toContain(r.a.conta.email);
    expect(JSON.stringify(eventos)).not.toContain(r.entrada.denunciaId);
  });
  it("mesma chave com outro motivo conflita; evidência e texto do cliente são recusados", async () => {
    const r = await par();
    await denunciarContato(ref(r.a), r.entrada);
    await expect(
      denunciarContato(ref(r.a), { ...r.entrada, categoria: "ameaca" }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    for (const extra of [
      { texto: "conteúdo não deve ser guardado" },
      { evidenceId: r.pedido.pedidoId },
      { actorUserId: r.a.conta.id },
    ])
      expect(DenunciaDeContatoSchema.safeParse({ ...r.entrada, ...extra }).success).toBe(false);
  });
  it("alvo desconhecido, identidade forjada e o próprio perfil são recusados", async () => {
    const r = await par(),
      outra = await novoJogador({ comAcesso: false });
    for (const perfilId of [outra.perfil.id, crypto.randomUUID(), r.a.perfil.id])
      await expect(denunciarContato(ref(r.a), { ...r.entrada, perfilId })).rejects.toMatchObject({
        code: "CONTATO",
      });
    await expect(
      denunciarContato({ ...ref(r.a), perfilId: r.b.perfil.id }, r.entrada),
    ).rejects.toBeDefined();
    expect(
      await db.select().from(reports).where(eq(reports.reporterProfileId, r.a.perfil.id)),
    ).toHaveLength(0);
  });
  it("responsável sem jogador e aparelho infantil usam atores distintos e prioridade", async () => {
    const r = await familiaSocial(),
      a = await novoJogador({ comAcesso: false });
    const codigo = await emitirCodigoDeAmigo(r.referencia);
    await pedirAmizade(ref(a), { codigo: codigo.codigo, pedidoId: crypto.randomUUID() });
    const entrada = {
      perfilId: a.perfil.id,
      denunciaId: crypto.randomUUID(),
      categoria: "assedio",
    };
    const adulto = await denunciarContatoDoMenor(r.autor, r.perfil.id, entrada);
    const infantil = await denunciarContato(r.referencia, {
      ...entrada,
      denunciaId: crypto.randomUUID(),
    });
    expect(
      (await db.select().from(reports).where(eq(reports.id, adulto.protocolo)))[0],
    ).toMatchObject({ actorKind: "responsavel", actorUserId: r.conta.id, priority: true });
    expect(
      (await db.select().from(reports).where(eq(reports.id, infantil.protocolo)))[0],
    ).toMatchObject({ actorKind: "jogador", actorUserId: null, priority: true });
    expect(await db.select().from(profiles).where(eq(profiles.userId, r.conta.id))).toHaveLength(0);
    const outra = await familiaSocial();
    await expect(
      denunciarContatoDoMenor(outra.autor, r.perfil.id, {
        ...entrada,
        denunciaId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PEDIDO" });
  });
  it("bloqueio prévio e suspensão do alvo não retiram a possibilidade de denunciar", async () => {
    const r = await par();
    await protegerContato(ref(r.a), { perfilId: r.b.perfil.id, bloqueado: true, silenciado: true });
    await db.update(profiles).set({ status: "suspended" }).where(eq(profiles.id, r.b.perfil.id));
    const recibo = await denunciarContato(ref(r.a), { ...r.entrada, categoria: "ameaca" });
    expect(
      (await db.select().from(reports).where(eq(reports.id, recibo.protocolo)))[0]?.priority,
    ).toBe(true);
  });
  it("dez novos protocolos por janela; replay continua disponível no teto", async () => {
    const r = await par();
    const primeiro = await denunciarContato(ref(r.a), r.entrada);
    for (let n = 1; n < 10; n++)
      await denunciarContato(ref(r.a), { ...r.entrada, denunciaId: crypto.randomUUID() });
    await expect(
      denunciarContato(ref(r.a), { ...r.entrada, denunciaId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "MUITAS_TENTATIVAS" });
    expect(await denunciarContato(ref(r.a), r.entrada)).toEqual({
      protocolo: primeiro.protocolo,
      repetida: true,
    });
    expect(
      await db.select().from(reports).where(eq(reports.reporterProfileId, r.a.perfil.id)),
    ).toHaveLength(10);
  });
  it("falha da auditoria reverte o recebimento", async () => {
    const r = await par();
    await db.execute(
      sql`create function audit.falhar_denuncia_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.safety_reported' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger falhar_denuncia_teste before insert on audit.events for each row execute function audit.falhar_denuncia_teste()`,
    );
    try {
      await expect(denunciarContato(ref(r.a), r.entrada)).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(
        await db.select().from(reports).where(eq(reports.reporterProfileId, r.a.perfil.id)),
      ).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger falhar_denuncia_teste on audit.events`);
      await db.execute(sql`drop function audit.falhar_denuncia_teste()`);
    }
  });
  it("credencial que vence durante auditoria não deixa protocolo confirmado", async () => {
    const r = await par();
    await db
      .update(devices)
      .set({ expiresAt: new Date(Date.now() + 1000) })
      .where(eq(devices.id, r.a.ator.sessaoDeAparelhoId));
    await db.execute(
      sql`create function audit.esperar_denuncia_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.safety_reported' then perform pg_sleep(1.1); end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger esperar_denuncia_teste before insert on audit.events for each row execute function audit.esperar_denuncia_teste()`,
    );
    try {
      await expect(denunciarContato(ref(r.a), r.entrada)).rejects.toBeDefined();
      expect(
        await db.select().from(reports).where(eq(reports.reporterProfileId, r.a.perfil.id)),
      ).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger esperar_denuncia_teste on audit.events`);
      await db.execute(sql`drop function audit.esperar_denuncia_teste()`);
    }
  });
});
