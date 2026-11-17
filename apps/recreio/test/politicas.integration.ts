import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioMinorProfiles as minors,
  recreioMinorPolicies as policies,
  recreioProfiles as profiles,
  sessions,
  recreioMinorDailyUsage as usage,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { consultarSupervisao, salvarSupervisao } from "@/features/politicas/service";
import { resolverAtor } from "@/features/sessao/service";
import { codigoDoBanco, eventosCom, loginReal, novaConta, sinal } from "./apoio";

async function familia() {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Login ausente");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const intencao = await prepararPerfilMenor(autor);
  const { perfil } = await cadastrarPerfilMenor(autor, {
    intencaoId: intencao.id,
    perfil: { apelido: "Protegido", avatar: "padrao" },
    nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
    assumoResponsabilidade: true,
    versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
  });
  return { conta, autor, perfil };
}
async function partida(r: Awaited<ReturnType<typeof familia>>) {
  const [sessao] = await db
    .insert(games)
    .values({
      profileId: r.perfil.id,
      deviceSessionId: r.autor.sessaoDeAparelhoId,
      gameId: "perfil-teste",
      expiresAt: new Date(Date.now() + 60000),
    })
    .returning();
  if (!sessao) throw new Error("Partida ausente");
  return sessao;
}

describe("supervisão transacional", () => {
  it("conta sem jogador lê regras, confirma a revisão e mantém idempotência sem dados privados no evento", async () => {
    const r = await familia();
    const inicial = await consultarSupervisao(r.autor, r.perfil.id);
    expect(inicial).toMatchObject({
      versao: 1,
      reconhecida: false,
      politica: { faixa: "6", contatos: "approval", textoLivre: false },
    });
    const pedido = {
      perfilId: r.perfil.id,
      versao: inicial.versao,
      configuracao: inicial.configuracao,
      reconheco: true,
    };
    expect(await salvarSupervisao(r.autor, pedido)).toMatchObject({ versao: 1, reconhecida: true });
    await salvarSupervisao(r.autor, pedido);
    const eventos = (await eventosCom("profileId", r.perfil.id)).filter(
      (e) => e.eventType === "recreio.minor_supervision_changed",
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.actorId).toBe(r.conta.id);
    expect(eventos[0]?.payload).toEqual({
      app: "recreio",
      profileId: r.perfil.id,
      revision: 1,
      changed: false,
    });
    expect(await db.select().from(profiles).where(eq(profiles.userId, r.conta.id))).toEqual([]);
    expect((await consultarSupervisao(r.autor, r.perfil.id)).reconhecida).toBe(true);
  });
  it("salvar aumenta a versão e encerra a partida no mesmo commit; concorrência não sobrescreve regras", async () => {
    const r = await familia();
    const inicial = await consultarSupervisao(r.autor, r.perfil.id);
    const aberta = await partida(r);
    const resultados = await Promise.allSettled([
      salvarSupervisao(r.autor, {
        perfilId: r.perfil.id,
        versao: inicial.versao,
        configuracao: { ...inicial.configuracao, pausado: true },
        reconheco: true,
      }),
      salvarSupervisao(r.autor, {
        perfilId: r.perfil.id,
        versao: inicial.versao,
        configuracao: { ...inicial.configuracao, minutosPorDia: 30 },
        reconheco: true,
      }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const falhou = resultados.find((r) => r.status === "rejected");
    if (falhou?.status !== "rejected") throw new Error("Conflito ausente");
    expect(falhou.reason).toMatchObject({ code: "CONFLITO" });
    expect((await consultarSupervisao(r.autor, r.perfil.id)).versao).toBe(2);
    expect((await db.select().from(games).where(eq(games.id, aberta.id)))[0]).toMatchObject({
      endReason: "permissions_changed",
      endedAt: expect.any(Date),
    });
    expect(
      (await eventosCom("profileId", r.perfil.id)).filter(
        (e) => e.eventType === "recreio.minor_supervision_changed",
      ),
    ).toHaveLength(1);
  });
  it("responsabilidade alheia, login removido e contexto infantil não configuram supervisão", async () => {
    const r = await familia();
    const outro = await familia();
    await expect(consultarSupervisao(outro.autor, r.perfil.id)).rejects.toMatchObject({
      code: "PERFIL",
    });
    const inicial = await consultarSupervisao(r.autor, r.perfil.id);
    const pedido = {
      perfilId: r.perfil.id,
      versao: 1,
      configuracao: inicial.configuracao,
      reconheco: true,
    };
    await db
      .update(devices)
      .set({ minorContextGeneration: crypto.randomUUID(), activeProfileId: r.perfil.id })
      .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    await expect(salvarSupervisao(r.autor, pedido)).rejects.toMatchObject({ code: "AUTH" });
    await db
      .update(devices)
      .set({ minorContextGeneration: null, activeProfileId: null })
      .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    await db.delete(sessions).where(eq(sessions.id, r.autor.login.authSessionId));
    await expect(salvarSupervisao(r.autor, pedido)).rejects.toMatchObject({ code: "AUTH" });
    expect(
      (await db.select().from(policies).where(eq(policies.profileId, r.perfil.id)))[0]
        ?.acknowledgedVersion,
    ).toBe(0);
  });
  it("novo limite acima da idade e texto livre para criança são recusados sem modificar a revisão", async () => {
    const r = await familia();
    const inicial = await consultarSupervisao(r.autor, r.perfil.id);
    for (const configuracao of [
      { ...inicial.configuracao, limiteDeConteudo: "12" },
      { ...inicial.configuracao, textoLivre: true },
    ]) {
      await expect(
        salvarSupervisao(r.autor, {
          perfilId: r.perfil.id,
          versao: 1,
          configuracao,
          reconheco: true,
        }),
      ).rejects.toMatchObject({ codigo: "POLITICA_INCOMPATIVEL" });
    }
    expect((await consultarSupervisao(r.autor, r.perfil.id)).versao).toBe(1);
  });
  it("recalcular uma mudança etária invalida concessões; fazer 18 preserva proteção e pede revisão", async () => {
    const r = await familia();
    const calendario = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "numeric",
    }).formatToParts(new Date());
    const ano = Number(calendario.find((p) => p.type === "year")?.value);
    const mes = Number(calendario.find((p) => p.type === "month")?.value);
    await db
      .update(minors)
      .set({ birthYear: ano - 18, birthMonth: mes })
      .where(eq(minors.profileId, r.perfil.id));
    const inicial = await consultarSupervisao(r.autor, r.perfil.id);
    await salvarSupervisao(r.autor, {
      perfilId: r.perfil.id,
      versao: 1,
      configuracao: inicial.configuracao,
      reconheco: true,
    });
    // Reconstitui o último cálculo no mês anterior, antes do aniversário.
    await db
      .update(policies)
      .set({ computedAt: new Date(Date.UTC(ano, mes - 2, 15, 12)) })
      .where(eq(policies.profileId, r.perfil.id));
    const aberta = await partida(r);
    const agora = await consultarSupervisao(r.autor, r.perfil.id);
    expect(agora).toMatchObject({
      versao: 2,
      reconhecida: false,
      politica: { faixa: "16", precisaContaAdulta: true },
    });
    expect((await consultarSupervisao(r.autor, r.perfil.id)).versao).toBe(2);
    expect((await db.select().from(games).where(eq(games.id, aberta.id)))[0]?.endReason).toBe(
      "permissions_changed",
    );
    expect((await db.select().from(profiles).where(eq(profiles.id, r.perfil.id)))[0]?.kind).toBe(
      "minor",
    );
  });
  it("falha de auditoria reverte configuração, versão e encerramento da partida", async () => {
    const r = await familia();
    const inicial = await consultarSupervisao(r.autor, r.perfil.id);
    const aberta = await partida(r);
    await db.execute(
      sql`create function audit.recusar_supervisao_em_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.minor_supervision_changed' then raise exception 'auditoria indisponível'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_supervisao_em_teste before insert on audit.events for each row execute function audit.recusar_supervisao_em_teste()`,
    );
    try {
      await expect(
        salvarSupervisao(r.autor, {
          perfilId: r.perfil.id,
          versao: 1,
          configuracao: { ...inicial.configuracao, pausado: true },
          reconheco: true,
        }),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
      expect((await db.select().from(games).where(eq(games.id, aberta.id)))[0]?.endedAt).toBeNull();
      expect(await consultarSupervisao(r.autor, r.perfil.id)).toMatchObject({
        versao: 1,
        configuracao: { pausado: false },
      });
    } finally {
      await db.execute(sql`drop trigger recusar_supervisao_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_supervisao_em_teste()`);
    }
  });
  it("validade que termina na espera pelo cursor não confirma supervisão", async () => {
    const r = await familia();
    const inicial = await consultarSupervisao(r.autor, r.perfil.id);
    const pronta = sinal<number>();
    const liberar = sinal<void>();
    const trava = db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('recreio:game_sessions:encerramento',0))`,
      );
      const [conexao] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      if (!conexao) throw new Error("Conexão ausente");
      pronta.concluir(conexao.pid);
      await liberar.promessa;
    });
    void trava.catch(pronta.recusar);
    const pid = await pronta.promessa;
    await db
      .update(devices)
      .set({ expiresAt: sql`clock_timestamp()+interval '900 milliseconds'` })
      .where(eq(devices.id, r.autor.sessaoDeAparelhoId));
    const resultado = salvarSupervisao(r.autor, {
      perfilId: r.perfil.id,
      versao: 1,
      configuracao: { ...inicial.configuracao, pausado: true },
      reconheco: true,
    }).then(
      (valor) => ({ ok: true, valor }),
      (erro: unknown) => ({ ok: false, erro }),
    );
    try {
      await expect
        .poll(
          async () =>
            (
              await db.execute<{ esperando: boolean }>(
                sql`select exists(select 1 from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))) as esperando`,
              )
            )[0]?.esperando,
          { interval: 20 },
        )
        .toBe(true);
      await db.execute(sql`select pg_sleep(1)`);
    } finally {
      liberar.concluir(undefined);
      await trava;
    }
    expect(await resultado).toMatchObject({ ok: false, erro: { code: "AUTH" } });
    expect(
      (await db.select().from(policies).where(eq(policies.profileId, r.perfil.id)))[0]?.paused,
    ).toBe(false);
    expect(
      (await db.select().from(profiles).where(eq(profiles.id, r.perfil.id)))[0]?.policyVersion,
    ).toBe(1);
  });
  it("o banco não permite atribuir ao menor tempo da partida de outro perfil", async () => {
    const r = await familia();
    const outro = await familia();
    const aberta = await partida(outro);
    expect(
      await codigoDoBanco(
        db
          .insert(usage)
          .values({ profileId: r.perfil.id, localDay: "2026-11-17", sessionId: aberta.id }),
      ),
    ).toBe("23503");
    await db
      .insert(usage)
      .values({ profileId: outro.perfil.id, localDay: "2026-11-17", sessionId: aberta.id });
    expect(await codigoDoBanco(db.delete(games).where(eq(games.id, aberta.id)))).toBe("23503");
    await db.update(usage).set({ sessionId: null }).where(eq(usage.profileId, outro.perfil.id));
    await db.delete(games).where(eq(games.id, aberta.id));
  });
});
