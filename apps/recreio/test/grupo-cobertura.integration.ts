import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioEntitlements as entitlements,
  recreioGroups as groups,
  recreioProfiles as profiles,
  sessions,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { avaliarAcesso } from "@/features/acesso/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { atualizarCobertura, consultarGrupo } from "@/features/grupo/service";
import { resolverAtor } from "@/features/sessao/service";
import { emitirIngresso, renovarSessao, trocarIngresso } from "@/features/sessao-de-jogo/service";
import { conceder } from "../scripts/concessoes";
import { eventosCom, loginReal, novaConta, novoJogador } from "./apoio";

async function preparar(tier: "individual" | "family" = "family") {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Login ausente");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  for (let i = 0; i < 4; i++) {
    const intencao = await prepararPerfilMenor(autor);
    await cadastrarPerfilMenor(autor, {
      intencaoId: intencao.id,
      perfil: { apelido: `Privado ${i}`, avatar: "padrao" },
      nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
      assumoResponsabilidade: true,
      versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
    });
  }
  const acesso = await conceder({ email: conta.email, tier, dias: 30, motivo: "teste" });
  const estado = await consultarGrupo(autor, acesso.grupoId);
  return { conta, autor, estado };
}
type Estado = Awaited<ReturnType<typeof consultarGrupo>>;
function selecao(estado: Estado, escolhidos: readonly string[]) {
  return {
    grupoId: estado.grupoId,
    perfis: estado.perfis.map((p) => ({
      perfilId: p.perfilId,
      versao: p.versao,
      cobrir: escolhidos.includes(p.perfilId),
    })),
  };
}

describe("seleção explícita da cobertura pelo titular nativo", () => {
  it("pagante sem jogador escolhe qual dos quatro menores usa o Individual", async () => {
    const { conta, autor, estado } = await preparar("individual");
    const escolhido = estado.perfis[2];
    if (!escolhido) throw new Error("Perfil ausente");
    expect(estado.limite).toBe(1);
    expect(estado.perfis.filter((p) => p.efetivo)).toHaveLength(1);
    expect(await atualizarCobertura(autor, selecao(estado, [escolhido.perfilId]))).toEqual({
      alterados: 3,
    });
    const depois = await consultarGrupo(autor, estado.grupoId);
    expect(depois.perfis.filter((p) => p.efetivo).map((p) => p.perfilId)).toEqual([
      escolhido.perfilId,
    ]);
    for (const p of depois.perfis) {
      expect(await avaliarAcesso({ profileId: p.perfilId })).toMatchObject({
        podeJogar: p.perfilId === escolhido.perfilId,
      });
    }
    expect(
      await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.userId, conta.id)),
    ).toEqual([]);
    const auditoria = await eventosCom("groupId", estado.grupoId);
    expect(auditoria.filter((e) => e.eventType === "recreio.group_coverage_updated")).toHaveLength(
      3,
    );
    expect(JSON.stringify(auditoria)).not.toContain("Privado");
    expect(JSON.stringify(auditoria)).not.toContain(conta.email);
  });

  it("não ativa duas vagas no Individual nem aceita duplicação, omissão ou grupo alheio", async () => {
    const a = await preparar("individual");
    const b = await preparar();
    await atualizarCobertura(a.autor, selecao(a.estado, []));
    const atual = await consultarGrupo(a.autor, a.estado.grupoId);
    const dois = atual.perfis.slice(0, 2).map((p) => p.perfilId);
    const pedido = selecao(atual, dois);
    await expect(atualizarCobertura(a.autor, pedido)).rejects.toMatchObject({
      code: "LIMITE_DE_PERFIS",
    });
    await expect(
      atualizarCobertura(a.autor, { ...pedido, perfis: pedido.perfis.slice(1) }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(
      atualizarCobertura(a.autor, { ...pedido, perfis: [pedido.perfis[0], pedido.perfis[0]] }),
    ).rejects.toHaveProperty("name", "ZodError");
    await expect(consultarGrupo(b.autor, atual.grupoId)).rejects.toMatchObject({ code: "GRUPO" });
    await expect(atualizarCobertura(b.autor, pedido)).rejects.toMatchObject({ code: "GRUPO" });
    expect((await consultarGrupo(a.autor, atual.grupoId)).perfis.every((p) => !p.selecionado)).toBe(
      true,
    );
  });

  it("duas seleções antigas disputam a mesma vaga e somente uma confirma", async () => {
    const a = await preparar("individual");
    await atualizarCobertura(a.autor, selecao(a.estado, []));
    const atual = await consultarGrupo(a.autor, a.estado.grupoId);
    const resultados = await Promise.allSettled(
      atual.perfis
        .slice(0, 2)
        .map((p) => atualizarCobertura(a.autor, selecao(atual, [p.perfilId]))),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter((r) => r.status === "rejected")).toMatchObject([
      { reason: { code: "CONFLITO" } },
    ]);
    expect(
      (await consultarGrupo(a.autor, atual.grupoId)).perfis.filter((p) => p.efetivo),
    ).toHaveLength(1);
  });

  it("contexto infantil não administra; login antigo não confirma a seleção", async () => {
    const a = await preparar();
    await expect(
      atualizarCobertura(
        {
          ...a.autor,
          login: { ...a.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
        },
        selecao(a.estado, []),
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    const { recreioDeviceSessions: devices } = await import("@informach/db/schema");
    await db
      .update(devices)
      .set({
        activeProfileId: a.estado.perfis[0]?.perfilId,
        minorContextGeneration: crypto.randomUUID(),
      })
      .where(eq(devices.id, a.autor.sessaoDeAparelhoId));
    await expect(consultarGrupo(a.autor, a.estado.grupoId)).rejects.toMatchObject({ code: "AUTH" });
    await expect(atualizarCobertura(a.autor, selecao(a.estado, []))).rejects.toMatchObject({
      code: "AUTH",
    });
  });

  it("retirada encerra a sessão e recolocar cobertura não reativa o token anterior", async () => {
    const p = await novoJogador();
    const [sessao] = await db.select().from(sessions).where(eq(sessions.id, p.login.authSessionId));
    const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, p.conta.id));
    if (!sessao || !grupo) throw new Error("Contexto ausente");
    const autor: AutorNativoRecente = {
      ...p.ator,
      login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
    };
    const ingresso = await emitirIngresso(p.ator, { jogo: "morada" });
    const jogo = await trocarIngresso({ ingresso: ingresso.ingresso });
    const antes = await consultarGrupo(autor, grupo.id);
    await atualizarCobertura(autor, selecao(antes, []));
    const encerramentos = (await eventosCom("profileId", p.perfil.id)).filter(
      (e) =>
        e.eventType === "recreio.game_session_ended" && e.payload.reason === "permissions_changed",
    );
    expect(encerramentos).toHaveLength(1);
    expect(encerramentos[0]).toMatchObject({
      actorId: p.conta.id,
      payload: { targetId: p.conta.id },
    });
    await expect(renovarSessao(jogo.token)).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
      detalhe: { motivo: "permissions_changed" },
    });
    const retirada = await consultarGrupo(autor, grupo.id);
    await atualizarCobertura(autor, selecao(retirada, [p.perfil.id]));
    await expect(renovarSessao(jogo.token)).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
    expect(await avaliarAcesso({ profileId: p.perfil.id })).toMatchObject({ podeJogar: true });
  });

  it("falha estrita da auditoria desfaz seleção e revisão", async () => {
    const a = await preparar();
    await db.execute(sql`create function audit.recusar_cobertura_teste() returns trigger language plpgsql as $$ begin
      if new.event_type='recreio.group_coverage_updated' then raise exception 'audit unavailable'; end if;
      return new; end $$`);
    await db.execute(sql`create trigger recusar_cobertura_teste before insert on audit.events
      for each row execute function audit.recusar_cobertura_teste()`);
    try {
      await expect(atualizarCobertura(a.autor, selecao(a.estado, []))).rejects.toBeInstanceOf(
        AuditPersistenceError,
      );
      expect(await consultarGrupo(a.autor, a.estado.grupoId)).toEqual(a.estado);
    } finally {
      await db.execute(sql`drop trigger recusar_cobertura_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_cobertura_teste()`);
    }
  });

  it("grupos recíprocos alteram cobertura sem inverter as travas dos adultos", async () => {
    const jogadores = await Promise.all([novoJogador(), novoJogador()]);
    const contextos = await Promise.all(
      jogadores.map(async (p) => {
        const [sessao] = await db
          .select()
          .from(sessions)
          .where(eq(sessions.id, p.login.authSessionId));
        const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, p.conta.id));
        if (!sessao || !grupo) throw new Error("Contexto ausente");
        const autor: AutorNativoRecente = {
          ...p.ator,
          login: {
            authSessionId: sessao.id,
            criadoEm: sessao.createdAt,
            expiraEm: sessao.expiresAt,
          },
        };
        return { p, autor, grupo };
      }),
    );
    const [a, b] = contextos;
    if (!a || !b) throw new Error("Contextos ausentes");
    // Fixture de duas coberturas consentidas; o convite de produção é outro incremento.
    await db.update(profiles).set({ groupId: b.grupo.id }).where(eq(profiles.id, a.p.perfil.id));
    await db.update(profiles).set({ groupId: a.grupo.id }).where(eq(profiles.id, b.p.perfil.id));
    const anteriores = await Promise.all(contextos.map((c) => consultarGrupo(c.autor, c.grupo.id)));
    const resultados = await Promise.all(
      contextos.map((c, i) => {
        const antes = anteriores[i];
        if (!antes) throw new Error("Composição ausente");
        return atualizarCobertura(c.autor, selecao(antes, []));
      }),
    );
    expect(resultados).toEqual([{ alterados: 1 }, { alterados: 1 }]);
    const posteriores = await Promise.all(
      contextos.map((c) => consultarGrupo(c.autor, c.grupo.id)),
    );
    expect(posteriores.every((c) => c.perfis.every((p) => !p.efetivo))).toBe(true);
  });

  it("vencimento durante a auditoria impede reativar uma cobertura no commit", async () => {
    const a = await preparar();
    await atualizarCobertura(a.autor, selecao(a.estado, []));
    const antes = await consultarGrupo(a.autor, a.estado.grupoId);
    await db.execute(sql`create function audit.vencer_cobertura_teste() returns trigger language plpgsql as $$ begin
      if new.event_type='recreio.group_coverage_updated' and new.payload->>'enabled'='true' then
        update recreio.entitlements set ends_at=clock_timestamp()+interval '1 second'
          where group_id=(new.payload->>'groupId')::uuid;
        perform pg_sleep(1.1);
      end if; return new; end $$`);
    await db.execute(sql`create trigger vencer_cobertura_teste before insert on audit.events
      for each row execute function audit.vencer_cobertura_teste()`);
    try {
      const escolhido = antes.perfis[0];
      if (!escolhido) throw new Error("Perfil ausente");
      await expect(
        atualizarCobertura(a.autor, selecao(antes, [escolhido.perfilId])),
      ).rejects.toMatchObject({ code: "LIMITE_DE_PERFIS" });
      expect(await consultarGrupo(a.autor, a.estado.grupoId)).toEqual(antes);
      const [concessao] = await db
        .select()
        .from(entitlements)
        .where(
          and(eq(entitlements.groupId, a.estado.grupoId), eq(entitlements.reasonCode, "teste")),
        );
      expect(concessao?.endsAt.getTime()).toBeGreaterThan(Date.now());
    } finally {
      await db.execute(sql`drop trigger vencer_cobertura_teste on audit.events`);
      await db.execute(sql`drop function audit.vencer_cobertura_teste()`);
    }
  });
});
