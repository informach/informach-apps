import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioTrialClaims as claims,
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioEntitlements as grants,
  recreioGroups as groups,
  recreioProfiles as profiles,
  recreioGameTickets as tickets,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it, vi } from "vitest";
import { avaliarAcesso } from "@/features/acesso/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { consultarSupervisao, salvarSupervisao } from "@/features/politicas/service";
import {
  aprovarPareamento,
  consultarPareamento,
  prepararPareamento,
} from "@/features/protecao/service";
import { emitirIngresso, renovarSessao, trocarIngresso } from "@/features/sessao-de-jogo/service";
import { DURACAO_DO_TESTE_MS } from "@/features/teste/constantes";
import {
  autorizarExperimento,
  consultarMeuTeste,
  retirarConsentimentoDoTeste,
} from "@/features/teste/service";
import { chavesDoRecreio } from "@/lib/tokens";
import { eventosCom } from "./apoio";
import { claimsDe, ingressoDe } from "./jogo-apoio";
import { adultoDoTeste, pedidoDeTeste } from "./teste-apoio";

// Somente catálogo de um jogo sintético classificado L. A admissão, supervisão,
// chaves, sessões, tempo, PostgreSQL e ciclo financeiro são reais.
vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  return {
    ...real,
    JOGOS: [
      ...real.JOGOS,
      {
        ...real.JOGOS[0],
        id: "jogo-de-teste",
        nome: "Teste de admissão",
        rota: "/jogar/jogo-de-teste",
        classificacao: { faixa: "L", descritores: [], interacoes: [] },
      },
    ],
  };
});

async function estado(p: Awaited<ReturnType<typeof adultoDoTeste>>) {
  const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, p.conta.id));
  if (!grupo) throw new Error("Grupo ausente");
  return {
    claims: await db.select().from(claims).where(eq(claims.payerUserId, p.conta.id)),
    grants: await db.select().from(grants).where(eq(grants.groupId, grupo.id)),
  };
}

async function preparado() {
  const p = await adultoDoTeste(true);
  if (!p.jogador) throw new Error("Jogador ausente");
  const consentimento = await autorizarExperimento(p.autor, pedidoDeTeste());
  return { ...p, jogador: p.jogador, consentimento };
}

describe("início real, único e atômico do teste", () => {
  it("consentimento e ingresso não começam prazo; a primeira SID fixa a coorte e o replay não a estende", async () => {
    const p = await preparado();
    expect(await estado(p)).toEqual({ claims: [], grants: [] });
    expect(await avaliarAcesso({ profileId: p.jogador.perfil.id })).toMatchObject({
      podeJogar: false,
    });
    const ingresso = await ingressoDe(p.jogador),
      chaveDeTroca = randomUUID();
    expect(await estado(p)).toEqual({ claims: [], grants: [] });
    const primeira = await trocarIngresso({ ingresso, chaveDeTroca });
    const depois = await estado(p),
      claim = depois.claims[0],
      grant = depois.grants[0];
    expect(depois.claims).toHaveLength(1);
    expect(depois.grants).toHaveLength(1);
    if (!claim || !grant) throw new Error("Teste ausente");
    expect(claim.entitlementId).toBe(grant.id);
    expect(claim.enrollmentId).toBe(p.consentimento.id);
    expect(claim.endsAt.getTime() - claim.startsAt.getTime()).toBe(
      DURACAO_DO_TESTE_MS[claim.cohort],
    );
    expect(grant).toMatchObject({
      kind: "trial",
      tier: "family",
      startsAt: claim.startsAt,
      endsAt: claim.endsAt,
    });
    expect(await avaliarAcesso({ profileId: p.jogador.perfil.id })).toMatchObject({
      podeJogar: true,
      validoAte: claim.endsAt,
    });
    const repetida = await trocarIngresso({ ingresso, chaveDeTroca });
    expect(claimsDe(repetida.token).sid).toBe(claimsDe(primeira.token).sid);
    expect(await estado(p)).toEqual(depois);
    expect(
      (await eventosCom("enrollmentId", p.consentimento.id)).filter(
        (e) => e.eventType === "recreio.trial_started",
      ),
    ).toHaveLength(1);
    await expect(renovarSessao(primeira.token)).resolves.toHaveProperty("token");
  });

  it("sem autorização nativa não emite ingresso elegível", async () => {
    const p = await adultoDoTeste(true);
    if (!p.jogador) throw new Error("Jogador ausente");
    await expect(ingressoDe(p.jogador)).rejects.toMatchObject({ codigo: "ACESSO_NEGADO" });
    expect(await estado(p)).toEqual({ claims: [], grants: [] });
  });

  it("retirada entre ingresso e troca recusa sem consumir o teste", async () => {
    const p = await preparado(),
      ingresso = await ingressoDe(p.jogador);
    await retirarConsentimentoDoTeste(p.autor, p.consentimento.id);
    await expect(trocarIngresso({ ingresso })).rejects.toMatchObject({ codigo: "ACESSO_NEGADO" });
    expect(await estado(p)).toEqual({ claims: [], grants: [] });
  });

  it("recusa retornada por versão antiga da política reverte concessão e recibo", async () => {
    const p = await preparado(),
      ingresso = await ingressoDe(p.jogador);
    await db
      .update(profiles)
      .set({ policyVersion: p.jogador.perfil.versaoDaPolitica + 1 })
      .where(eq(profiles.id, p.jogador.perfil.id));
    await expect(trocarIngresso({ ingresso })).rejects.toMatchObject({
      codigo: "INGRESSO_INVALIDO",
    });
    expect(await estado(p)).toEqual({ claims: [], grants: [] });
    const [recibo] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.jti, String(claimsDe(ingresso).jti)));
    expect(recibo?.consumedAt).toBeNull();
  });

  it("aparelho revogado depois do ingresso não inicia teste", async () => {
    const p = await preparado(),
      ingresso = await ingressoDe(p.jogador);
    await db
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(eq(devices.id, p.autor.sessaoDeAparelhoId));
    await expect(trocarIngresso({ ingresso })).rejects.toMatchObject({
      codigo: "INGRESSO_INVALIDO",
    });
    expect(await estado(p)).toEqual({ claims: [], grants: [] });
  });

  it("falha real da auditoria desfaz SID, ingresso, concessão e claim; repetir depois conserva uma só", async () => {
    const p = await preparado(),
      ingresso = await ingressoDe(p.jogador);
    await db.execute(sql`create function audit.recusar_inicio_teste() returns trigger language plpgsql as $$
      begin if new.event_type='recreio.trial_started' then raise exception 'fixture audit failure'; end if; return new; end $$`);
    await db.execute(
      sql`create trigger recusar_inicio_teste before insert on audit.events for each row execute function audit.recusar_inicio_teste()`,
    );
    try {
      await expect(trocarIngresso({ ingresso })).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(await estado(p)).toEqual({ claims: [], grants: [] });
      expect(await db.select().from(games).where(eq(games.profileId, p.jogador.perfil.id))).toEqual(
        [],
      );
    } finally {
      await db.execute(sql`drop trigger recusar_inicio_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_inicio_teste()`);
    }
    await trocarIngresso({ ingresso });
    expect((await estado(p)).claims).toHaveLength(1);
  });

  it("falha do assinador não consome ingresso nem sorteio persistido", async () => {
    const p = await preparado(),
      ingresso = await ingressoDe(p.jogador);
    const { emissor } = await chavesDoRecreio();
    const falha = vi
      .spyOn(emissor, "sessao")
      .mockRejectedValueOnce(new Error("fixture signing failure"));
    try {
      await expect(trocarIngresso({ ingresso })).rejects.toThrow("fixture signing failure");
      expect(await estado(p)).toEqual({ claims: [], grants: [] });
    } finally {
      falha.mockRestore();
    }
    await trocarIngresso({ ingresso });
    expect((await estado(p)).claims).toHaveLength(1);
  });

  it("retirada depois da SID revoga acesso, preserva claim e não concede outro teste", async () => {
    const p = await preparado(),
      ingresso = await ingressoDe(p.jogador);
    const aberta = await trocarIngresso({ ingresso });
    const antes = await estado(p);
    await retirarConsentimentoDoTeste(p.autor, p.consentimento.id);
    expect((await estado(p)).claims).toEqual(antes.claims);
    expect((await estado(p)).grants[0]?.revokedAt).toBeInstanceOf(Date);
    await expect(renovarSessao(aberta.token)).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
    await expect(autorizarExperimento(p.autor, pedidoDeTeste())).rejects.toMatchObject({
      code: "TESTE",
    });
  });

  it("quatro perfis pareados abrem em concorrência com um único teste e pagante sem jogador", async () => {
    const p = await adultoDoTeste();
    await autorizarExperimento(p.autor, pedidoDeTeste());
    const jogadores = [];
    for (const indice of [1, 2, 3, 4]) {
      const intencao = await prepararPerfilMenor(p.autor);
      const { perfil } = await cadastrarPerfilMenor(p.autor, {
        intencaoId: intencao.id,
        perfil: { apelido: `Jogador ${indice}`, avatar: "padrao" },
        nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
        assumoResponsabilidade: true,
        versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
      });
      const supervisao = await consultarSupervisao(p.autor, perfil.id);
      await salvarSupervisao(p.autor, {
        perfilId: perfil.id,
        versao: supervisao.versao,
        configuracao: supervisao.configuracao,
        reconheco: true,
      });
      const pareamento = await prepararPareamento(`198.51.100.${indice}`);
      const aparelho = await aprovarPareamento(p.autor, {
        perfilId: perfil.id,
        codigo: pareamento.codigo,
      });
      await consultarPareamento(pareamento.segredo);
      jogadores.push({ sessaoDeAparelhoId: aparelho.aparelhoId, perfil });
    }
    const ingressos = await Promise.all(
      jogadores.map((j) => emitirIngresso(j, { jogo: "jogo-de-teste" })),
    );
    expect(await estado(p)).toEqual({ claims: [], grants: [] });
    const abertas = await Promise.all(
      ingressos.map((i) => trocarIngresso({ ingresso: i.ingresso })),
    );
    expect(new Set(abertas.map((a) => claimsDe(a.token).sid)).size).toBe(4);
    const atual = await estado(p);
    expect(atual.claims).toHaveLength(1);
    expect(atual.grants).toHaveLength(1);
    expect((await consultarMeuTeste(p.autor)).teste?.fim).toBe(
      atual.claims[0]?.endsAt.toISOString(),
    );
  });
});
