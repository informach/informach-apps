import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGroupInvites as invites,
  sessions,
  users,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import {
  type AutorNativoRecente,
  serializarContaNativa,
} from "@/features/account/autoridade-repository";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-regras";
import {
  convidarAdulto,
  convitesEnviados,
  convitesRecebidos,
  recusarConviteDeAdulto,
  revogarConviteDeAdulto,
} from "@/features/grupo/convites-service";
import { resolverAtor } from "@/features/sessao/service";
import { codigoDoBanco, eventosCom, loginReal, novaConta, sinal } from "./apoio";

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
async function preparar() {
  const a = await titular();
  const b = await titular();
  const convite = await convidarAdulto(a.autor, {
    email: b.conta.email,
    identificacao: "Ana",
    declaroMaioridade: true,
    versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
  });
  return { a, b, convite };
}

describe("convites privados, recusa e revogação", () => {
  it("destinatário vê só seu recibo e outra conta não lê nem encerra", async () => {
    const r = await preparar();
    const estranho = await titular();
    expect(await convitesRecebidos(r.b.autor)).toEqual([
      { conviteId: r.convite.conviteId, expiraEm: r.convite.expiraEm, identificacao: "Ana" },
    ]);
    expect(await convitesRecebidos(r.a.autor)).toEqual([]);
    expect(await convitesRecebidos(estranho.autor)).toEqual([]);
    expect(await convitesEnviados(r.b.autor)).toEqual([]);
    expect(await convitesEnviados(r.a.autor)).toEqual([
      { conviteId: r.convite.conviteId, email: r.b.conta.email, expiraEm: r.convite.expiraEm },
    ]);
    await expect(revogarConviteDeAdulto(estranho.autor, r.convite.conviteId)).rejects.toMatchObject(
      { code: "CONVITE" },
    );
    await expect(recusarConviteDeAdulto(estranho.autor, r.convite.conviteId)).rejects.toMatchObject(
      { code: "CONVITE" },
    );
    expect(await convitesRecebidos(r.b.autor)).toHaveLength(1);
  });

  it("trocar o e-mail e reutilizá-lo em outra conta não entrega o convite antigo", async () => {
    const r = await preparar();
    const novo = await titular();
    await db
      .update(users)
      .set({ email: `${crypto.randomUUID()}@example.test` })
      .where(eq(users.id, r.b.conta.id));
    await db.update(users).set({ email: r.b.conta.email }).where(eq(users.id, novo.conta.id));
    expect(await convitesRecebidos(r.b.autor)).toEqual([]);
    expect(await convitesRecebidos(novo.autor)).toEqual([]);
    await expect(recusarConviteDeAdulto(novo.autor, r.convite.conviteId)).rejects.toMatchObject({
      code: "CONVITE",
    });
  });

  it("destinatário sem conta na emissão recebe ao criar o próprio acesso", async () => {
    const a = await titular();
    const email = `${crypto.randomUUID()}@example.test`;
    const convite = await convidarAdulto(a.autor, {
      email,
      identificacao: "Ana",
      declaroMaioridade: true,
      versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
    });
    const novo = await titular();
    await db.update(users).set({ email }).where(eq(users.id, novo.conta.id));
    expect(await convitesRecebidos(novo.autor)).toEqual([
      { conviteId: convite.conviteId, expiraEm: convite.expiraEm, identificacao: "Ana" },
    ]);
  });

  it.each(["emissor", "destinatario"] as const)(
    "%s encerra e remove os endereços sem reabrir o convite",
    async (quem) => {
      const r = await preparar();
      const resultado =
        quem === "emissor"
          ? await revogarConviteDeAdulto(r.a.autor, r.convite.conviteId)
          : await recusarConviteDeAdulto(r.b.autor, r.convite.conviteId);
      expect(resultado).toEqual({ alterado: true });
      expect(await convitesRecebidos(r.b.autor)).toEqual([]);
      expect(await convitesEnviados(r.a.autor)).toEqual([]);
      const [linha] = await db.select().from(invites).where(eq(invites.id, r.convite.conviteId));
      expect(linha).toMatchObject({
        state: "revoked",
        recipientEmail: null,
        recipientUserId: null,
      });
      expect(await revogarConviteDeAdulto(r.a.autor, r.convite.conviteId)).toEqual({
        alterado: false,
      });
      const eventos = await eventosCom("inviteId", r.convite.conviteId);
      expect(
        eventos.filter(
          (e) =>
            e.eventType ===
            (quem === "emissor" ? "recreio.group_invite_revoked" : "recreio.group_invite_declined"),
        ),
      ).toHaveLength(1);
      expect(JSON.stringify(eventos)).not.toContain(r.b.conta.email);
    },
  );

  it("prazo vencido deixa de aparecer mesmo antes do expurgo; revogar marca expired", async () => {
    const r = await preparar();
    await db.execute(sql`update recreio.group_invites set created_at=statement_timestamp()-interval '74 hours',
      expires_at=statement_timestamp()-interval '2 hours' where id=${r.convite.conviteId}::uuid`);
    expect(await convitesRecebidos(r.b.autor)).toEqual([]);
    expect(await convitesEnviados(r.a.autor)).toEqual([]);
    await revogarConviteDeAdulto(r.a.autor, r.convite.conviteId);
    const [linha] = await db.select().from(invites).where(eq(invites.id, r.convite.conviteId));
    expect(linha).toMatchObject({ state: "expired", recipientEmail: null, recipientUserId: null });
  });

  it("contexto infantil não lê pendências; login antigo não as encerra", async () => {
    const r = await preparar();
    await expect(
      recusarConviteDeAdulto(
        {
          ...r.b.autor,
          login: { ...r.b.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
        },
        r.convite.conviteId,
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    await db
      .update(devices)
      .set({ minorContextGeneration: crypto.randomUUID() })
      .where(eq(devices.id, r.b.autor.sessaoDeAparelhoId));
    await expect(convitesRecebidos(r.b.autor)).rejects.toMatchObject({ code: "AUTH" });
    await expect(recusarConviteDeAdulto(r.b.autor, r.convite.conviteId)).rejects.toMatchObject({
      code: "AUTH",
    });
  });

  it("auditoria indisponível conserva a pendência e suas autorizações anteriores", async () => {
    const r = await preparar();
    const [antes] = await db.select().from(invites).where(eq(invites.id, r.convite.conviteId));
    await db.execute(sql`create function audit.recusar_fim_convite_grupo_teste() returns trigger language plpgsql as $$ begin
      if new.event_type='recreio.group_invite_declined' then raise exception 'audit unavailable'; end if;
      return new; end $$`);
    await db.execute(sql`create trigger recusar_fim_convite_grupo_teste before insert on audit.events
      for each row execute function audit.recusar_fim_convite_grupo_teste()`);
    try {
      await expect(recusarConviteDeAdulto(r.b.autor, r.convite.conviteId)).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(
        (await db.select().from(invites).where(eq(invites.id, r.convite.conviteId)))[0],
      ).toEqual(antes);
    } finally {
      await db.execute(sql`drop trigger recusar_fim_convite_grupo_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_fim_convite_grupo_teste()`);
    }
  });

  it("leitura que espera a autoridade nativa tem prazo limitado no banco", async () => {
    const r = await preparar();
    const pronto = sinal<void>();
    const soltar = sinal<void>();
    const bloqueio = db.transaction(async (tx) => {
      await serializarContaNativa(tx, r.b.autor.contaId);
      pronto.concluir();
      await soltar.promessa;
    });
    await pronto.promessa;
    try {
      expect(await codigoDoBanco(convitesRecebidos(r.b.autor))).toBe("55P03");
    } finally {
      soltar.concluir();
      await bloqueio;
    }
  });
});
