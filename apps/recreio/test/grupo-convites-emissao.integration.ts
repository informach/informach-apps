import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGroups as groups,
  recreioGroupInvites as invites,
  recreioProfiles as profiles,
  sessions,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-regras";
import { convidarAdulto } from "@/features/grupo/convites-service";
import { resolverAtor } from "@/features/sessao/service";
import { eventosCom, loginReal, novaConta } from "./apoio";

async function titular() {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Login ausente");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  return { conta, autor };
}
const pedido = (email = `${crypto.randomUUID()}@example.test`) => ({
  email,
  declaroMaioridade: true,
  versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
});

describe("emissão nativa de convite comercial sem jogador obrigatório", () => {
  it("duplicação concorrente cria um grupo e um convite sem alterar prazo ou criar perfil", async () => {
    const a = await titular();
    const entrada = pedido();
    const resultados = await Promise.all([
      convidarAdulto(a.autor, entrada),
      convidarAdulto(a.autor, entrada),
    ]);
    expect(new Set(resultados.map((r) => r.conviteId)).size).toBe(1);
    expect(resultados.filter((r) => r.criado)).toHaveLength(1);
    const primeiro = resultados[0];
    if (!primeiro) throw new Error("Convite ausente");
    const repetido = await convidarAdulto(a.autor, {
      ...entrada,
      email: ` ${entrada.email.toUpperCase()} `,
    });
    expect(repetido).toEqual({ ...primeiro, criado: false });
    const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, a.conta.id));
    if (!grupo) throw new Error("Grupo ausente");
    expect(await db.select().from(profiles).where(eq(profiles.groupId, grupo.id))).toEqual([]);
    const eventos = await eventosCom("groupId", grupo.id);
    expect(eventos.filter((e) => e.eventType === "recreio.group_invite_created")).toHaveLength(1);
    expect(JSON.stringify(eventos)).not.toContain(entrada.email);
    expect(JSON.stringify(eventos)).not.toContain(a.conta.email);
  });

  it("sem declaração, versão atual ou destinatário diferente não prepara grupo", async () => {
    const a = await titular();
    for (const entrada of [
      { email: "pessoa@example.test" },
      { ...pedido(), declaroMaioridade: false },
      { ...pedido(), versaoDaDeclaracao: "adulto-2020-01-01" },
    ])
      await expect(convidarAdulto(a.autor, entrada)).rejects.toHaveProperty("name", "ZodError");
    await expect(convidarAdulto(a.autor, pedido(a.conta.email))).rejects.toMatchObject({
      code: "CONVITE",
    });
    expect(await db.select().from(groups).where(eq(groups.ownerUserId, a.conta.id))).toEqual([]);
  });

  it("login antigo e contexto infantil não criam convite mesmo sem jogador ativo", async () => {
    const a = await titular();
    await expect(
      convidarAdulto(
        { ...a.autor, login: { ...a.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) } },
        pedido(),
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    await db
      .update(devices)
      .set({ minorContextGeneration: crypto.randomUUID() })
      .where(eq(devices.id, a.autor.sessaoDeAparelhoId));
    await expect(convidarAdulto(a.autor, pedido())).rejects.toMatchObject({ code: "AUTH" });
    expect(await db.select().from(groups).where(eq(groups.ownerUserId, a.conta.id))).toEqual([]);
  });

  it("cinco pendências limitam o emissor; expirar retira o endereço e permite novo convite", async () => {
    const a = await titular();
    const entrada = pedido();
    const primeiro = await convidarAdulto(a.autor, entrada);
    for (let i = 0; i < 4; i++) await convidarAdulto(a.autor, pedido());
    await expect(convidarAdulto(a.autor, pedido())).rejects.toMatchObject({
      code: "LIMITE_DE_CONVITES",
    });
    await db.execute(sql`update recreio.group_invites set created_at=statement_timestamp()-interval '74 hours',
      expires_at=statement_timestamp()-interval '2 hours' where id=${primeiro.conviteId}::uuid`);
    const novo = await convidarAdulto(a.autor, entrada);
    expect(novo.criado).toBe(true);
    expect(novo.conviteId).not.toBe(primeiro.conviteId);
    const [antigo] = await db.select().from(invites).where(eq(invites.id, primeiro.conviteId));
    expect(antigo).toMatchObject({ state: "expired", recipientEmail: null });
    expect(antigo?.finishedAt).toBeInstanceOf(Date);
  });

  it("limite global por endereço serializa dois emissores disputando a última pendência", async () => {
    const entrada = pedido();
    const agora = new Date();
    for (let i = 0; i < 19; i++) {
      const conta = await novaConta();
      const [grupo] = await db.insert(groups).values({ ownerUserId: conta.id }).returning();
      if (!grupo) throw new Error("Grupo ausente");
      await db.insert(invites).values({
        groupId: grupo.id,
        inviterUserId: conta.id,
        recipientEmail: entrada.email,
        inviterDeclarationVersion: VERSAO_DA_DECLARACAO_ADULTA,
        createdAt: agora,
        expiresAt: new Date(agora.getTime() + 72 * 60 * 60_000),
      });
    }
    const [a, b] = await Promise.all([titular(), titular()]);
    if (!a || !b) throw new Error("Titulares ausentes");
    const resultados = await Promise.allSettled([
      convidarAdulto(a.autor, entrada),
      convidarAdulto(b.autor, entrada),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter((r) => r.status === "rejected")).toMatchObject([
      { reason: { code: "LIMITE_DE_CONVITES" } },
    ]);
    expect(
      await db
        .select({ id: invites.id })
        .from(invites)
        .where(and(eq(invites.recipientEmail, entrada.email), eq(invites.state, "pending"))),
    ).toHaveLength(20);
  });

  it("auditoria indisponível reverte também o grupo novo", async () => {
    const a = await titular();
    await db.execute(sql`create function audit.recusar_convite_grupo_teste() returns trigger language plpgsql as $$ begin
      if new.event_type='recreio.group_invite_created' then raise exception 'audit unavailable'; end if;
      return new; end $$`);
    await db.execute(sql`create trigger recusar_convite_grupo_teste before insert on audit.events
      for each row execute function audit.recusar_convite_grupo_teste()`);
    try {
      await expect(convidarAdulto(a.autor, pedido())).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(await db.select().from(groups).where(eq(groups.ownerUserId, a.conta.id))).toEqual([]);
      expect(await db.select().from(invites).where(eq(invites.inviterUserId, a.conta.id))).toEqual(
        [],
      );
    } finally {
      await db.execute(sql`drop trigger recusar_convite_grupo_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_convite_grupo_teste()`);
    }
  });
});
