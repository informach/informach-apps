import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioTrialClaims as claims,
  customers,
  recreioTrialEnrollments as enrollments,
  recreioGameSessions as games,
  recreioEntitlements as grants,
  recreioGroups as groups,
  recreioProfiles as profiles,
  sessions,
} from "@informach/db/schema";
import {
  VALIDADE_DA_CONFERENCIA_FINANCEIRA_MS,
  VERSAO_DA_RESPONSABILIDADE,
} from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { avaliarAcesso } from "@/features/acesso/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import {
  aprovarPareamento,
  consultarPareamento,
  definirPinDaConta,
  definirPinDoMenor,
  prepararPareamento,
  trocarPerfilComPin,
} from "@/features/protecao/service";
import { renovarSessao } from "@/features/sessao-de-jogo/service";
import {
  autorizarExperimento,
  consultarMeuTeste,
  retirarConsentimentoDoTeste,
} from "@/features/teste/service";
import { eventosCom } from "./apoio";
import { entrarNoJogo } from "./jogo-apoio";
import { adultoDoTeste, assinaturaDeFixture, pedidoDeTeste, trialDeFixture } from "./teste-apoio";

describe("consentimento nativo não inicia o teste", () => {
  it("exige os dois aceites atuais e recusa identidade adicional no formulário", async () => {
    const p = await adultoDoTeste();
    for (const mudanca of [
      { souAdulto: false },
      { aceitoExperimento: false },
      { versaoDoTeste: "antiga" },
      { versaoDaDeclaracao: "antiga" },
      { payerUserId: p.conta.id },
    ])
      await expect(
        autorizarExperimento(p.autor, { ...pedidoDeTeste(), ...mudanca }),
      ).rejects.toBeInstanceOf(ZodError);
    expect(
      await db.select().from(enrollments).where(eq(enrollments.payerUserId, p.conta.id)),
    ).toEqual([]);
  });

  it("pagante sem jogador autoriza condições atuais sem criar concessão, SID ou assinatura", async () => {
    const p = await adultoDoTeste(),
      pedido = pedidoDeTeste();
    const aceite = await autorizarExperimento(p.autor, pedido);
    const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, p.conta.id));
    if (!grupo) throw new Error("Grupo ausente");
    expect(aceite).toMatchObject({ id: pedido.pedidoId, retiradoEm: null });
    expect(await db.select().from(profiles).where(eq(profiles.groupId, grupo.id))).toEqual([]);
    expect(await db.select().from(grants).where(eq(grants.groupId, grupo.id))).toEqual([]);
    expect(await db.select().from(claims).where(eq(claims.payerUserId, p.conta.id))).toEqual([]);
    expect(
      await db
        .select()
        .from(customers)
        .where(and(eq(customers.app, "recreio"), eq(customers.subjectId, p.conta.id))),
    ).toEqual([]);
    const eventos = await eventosCom("enrollmentId", aceite.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      eventType: "recreio.trial_enrollment_recorded",
      actorId: p.conta.id,
    });
    expect(await consultarMeuTeste(p.autor)).toMatchObject({
      consentimento: aceite,
      teste: null,
      modo: "setup",
    });
  });

  it("replay e dois pedidos concorrentes conservam um aceite e um evento", async () => {
    const p = await adultoDoTeste(),
      pedido = pedidoDeTeste();
    const primeiro = await autorizarExperimento(p.autor, pedido);
    expect(await autorizarExperimento(p.autor, pedido)).toEqual(primeiro);
    const respostas = await Promise.all([
      autorizarExperimento(p.autor, pedidoDeTeste()),
      autorizarExperimento(p.autor, pedidoDeTeste()),
    ]);
    expect(respostas).toEqual([primeiro, primeiro]);
    expect(
      await db.select().from(enrollments).where(eq(enrollments.payerUserId, p.conta.id)),
    ).toHaveLength(1);
    expect(await eventosCom("enrollmentId", primeiro.id)).toHaveLength(1);
  });

  it("pedido de outra conta não pode sobrescrever nem consultar o recibo dela", async () => {
    const a = await adultoDoTeste(),
      b = await adultoDoTeste();
    const aceite = await autorizarExperimento(a.autor, pedidoDeTeste());
    await expect(
      autorizarExperimento(b.autor, { ...pedidoDeTeste(), pedidoId: aceite.id }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(retirarConsentimentoDoTeste(b.autor, aceite.id)).rejects.toMatchObject({
      code: "TESTE",
    });
    expect((await consultarMeuTeste(b.autor)).consentimento).toBeNull();
    expect((await consultarMeuTeste(a.autor)).consentimento).toEqual(aceite);
  });

  it("login antigo não admite consentimento; login encerrado também recusa leitura", async () => {
    const p = await adultoDoTeste();
    const criadoEm = new Date(Date.now() - 11 * 60_000);
    await db
      .update(sessions)
      .set({ createdAt: criadoEm })
      .where(eq(sessions.id, p.autor.login.authSessionId));
    p.autor.login.criadoEm = criadoEm;
    await expect(autorizarExperimento(p.autor, pedidoDeTeste())).rejects.toMatchObject({
      code: "LOGIN_RECENTE",
    });
    await db.delete(sessions).where(eq(sessions.id, p.autor.login.authSessionId));
    await expect(consultarMeuTeste(p.autor)).rejects.toMatchObject({ code: "AUTH" });
  });

  it.each(["compartilhado", "pareado"] as const)(
    "contexto infantil %s não adquire gestão do teste",
    async (tipo) => {
      const p = await adultoDoTeste();
      const aceite = await autorizarExperimento(p.autor, pedidoDeTeste());
      const intencao = await prepararPerfilMenor(p.autor);
      const { perfil } = await cadastrarPerfilMenor(p.autor, {
        intencaoId: intencao.id,
        perfil: { apelido: "Protegido", avatar: "padrao" },
        nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
        assumoResponsabilidade: true,
        versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
      });
      let dispositivo = p.autor.sessaoDeAparelhoId;
      if (tipo === "compartilhado") {
        await definirPinDaConta(p.autor, { pin: "593871" });
        await definirPinDoMenor(p.autor, { perfilId: perfil.id, pin: "396175" });
        await trocarPerfilComPin(p.autor, {
          destino: { tipo: "perfil", perfilId: perfil.id },
          pin: "396175",
        });
      } else {
        const pedido = await prepararPareamento("198.51.100.207");
        const pareado = await aprovarPareamento(p.autor, {
          perfilId: perfil.id,
          codigo: pedido.codigo,
        });
        await consultarPareamento(pedido.segredo);
        dispositivo = pareado.aparelhoId;
      }
      const indevido = { ...p.autor, sessaoDeAparelhoId: dispositivo };
      await expect(autorizarExperimento(indevido, pedidoDeTeste())).rejects.toMatchObject({
        code: "AUTH",
      });
      await expect(consultarMeuTeste(indevido)).rejects.toMatchObject({ code: "AUTH" });
      await expect(retirarConsentimentoDoTeste(indevido, aceite.id)).rejects.toMatchObject({
        code: "AUTH",
      });
      const [linha] = await db.select().from(enrollments).where(eq(enrollments.id, aceite.id));
      expect(linha?.withdrawnAt).toBeNull();
    },
  );

  it("cliente comercial antigo do Recreio impede outro teste, sem herdar esse fato de outro app", async () => {
    const a = await adultoDoTeste(),
      b = await adultoDoTeste();
    for (const [p, app] of [
      [a, "recreio"],
      [b, "cozya"],
    ] as const)
      await db.insert(customers).values({
        provider: "stripe",
        providerCustomerId: `cus_fixture_${randomUUID()}`,
        app,
        subjectType: "user",
        subjectId: p.conta.id,
        email: p.conta.email,
      });
    expect((await consultarMeuTeste(a.autor)).elegivel).toBe(false);
    await expect(autorizarExperimento(a.autor, pedidoDeTeste())).rejects.toMatchObject({
      code: "TESTE",
    });
    await expect(autorizarExperimento(b.autor, pedidoDeTeste())).resolves.toMatchObject({
      retiradoEm: null,
    });
  });

  it("retirada antes de começar é idempotente, e repetir o pedido antigo não reabre consentimento", async () => {
    const p = await adultoDoTeste(),
      pedido = pedidoDeTeste();
    const aceite = await autorizarExperimento(p.autor, pedido);
    const retirada = await retirarConsentimentoDoTeste(p.autor, aceite.id);
    expect(retirada.retiradoEm).not.toBeNull();
    expect(await retirarConsentimentoDoTeste(p.autor, aceite.id)).toEqual(retirada);
    expect(await autorizarExperimento(p.autor, pedido)).toEqual(retirada);
    expect((await eventosCom("enrollmentId", aceite.id)).map((e) => e.eventType)).toEqual([
      "recreio.trial_enrollment_recorded",
      "recreio.trial_enrollment_withdrawn",
    ]);
    expect((await consultarMeuTeste(p.autor)).teste).toBeNull();
  });

  it("recusa real da auditoria desfaz consentimento e grupo preparados", async () => {
    const p = await adultoDoTeste();
    await db.execute(sql`create function audit.recusar_aceite_teste() returns trigger language plpgsql as $$
      begin if new.event_type='recreio.trial_enrollment_recorded' then
        raise exception 'auditoria indisponivel na fixture'; end if; return new; end $$`);
    await db.execute(sql`create trigger recusar_aceite_teste before insert on audit.events
      for each row execute function audit.recusar_aceite_teste()`);
    try {
      await expect(autorizarExperimento(p.autor, pedidoDeTeste())).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(await db.select().from(groups).where(eq(groups.ownerUserId, p.conta.id))).toEqual([]);
      expect(
        await db.select().from(enrollments).where(eq(enrollments.payerUserId, p.conta.id)),
      ).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger recusar_aceite_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_aceite_teste()`);
    }
  });
});

describe("retirada preserva outros direitos e fecha credenciais incompatíveis", () => {
  it("revoga só o teste, conserva a marca e encerra a SID sem cobertura", async () => {
    const p = await adultoDoTeste(true),
      jogador = p.jogador;
    if (!jogador) throw new Error("Jogador ausente");
    const fixture = await trialDeFixture(p),
      aberta = await entrarNoJogo(jogador);
    await retirarConsentimentoDoTeste(p.autor, fixture.consentimento.id);
    const [grant] = await db.select().from(grants).where(eq(grants.id, fixture.grant.id));
    expect(grant?.revokedAt).toBeInstanceOf(Date);
    expect(await db.select().from(claims).where(eq(claims.payerUserId, p.conta.id))).toHaveLength(
      1,
    );
    const [sid] = await db.select().from(games).where(eq(games.id, aberta.sid));
    expect(sid).toMatchObject({ endReason: "access_lost", endedAt: expect.any(Date) });
    expect(sid?.endedSeq).toBeGreaterThan(0);
    await expect(renovarSessao(aberta.token)).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
    await expect(autorizarExperimento(p.autor, pedidoDeTeste())).rejects.toMatchObject({
      code: "TESTE",
    });
  });

  it.each([true, false])(
    "fallback pago com prazo menor=%s conserva somente a autoridade compatível",
    async (menor) => {
      const p = await adultoDoTeste(true),
        jogador = p.jogador;
      if (!jogador) throw new Error("Jogador ausente");
      const fixture = await trialDeFixture(p),
        aberta = await entrarNoJogo(jogador);
      const fim = new Date(Date.now() + (menor ? 60_000 : 86_400_000));
      const confirmadoEm = await assinaturaDeFixture(p, fim);
      await retirarConsentimentoDoTeste(p.autor, fixture.consentimento.id);
      expect(await avaliarAcesso({ profileId: jogador.perfil.id })).toMatchObject({
        podeJogar: true,
        origem: "assinatura",
        validoAte: new Date(
          Math.min(fim.getTime(), confirmadoEm.getTime() + VALIDADE_DA_CONFERENCIA_FINANCEIRA_MS),
        ),
      });
      const [sid] = await db.select().from(games).where(eq(games.id, aberta.sid));
      if (menor) {
        expect(sid).toMatchObject({ endReason: "permissions_changed", endedAt: expect.any(Date) });
        await expect(renovarSessao(aberta.token)).rejects.toMatchObject({
          codigo: "SESSAO_ENCERRADA",
        });
      } else {
        expect(sid?.endedAt).toBeNull();
        await expect(renovarSessao(aberta.token)).resolves.toHaveProperty("token");
      }
    },
  );
});
