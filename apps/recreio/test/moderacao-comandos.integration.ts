import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioModerationCommands as commands,
  recreioPairedCredentials as credentials,
  recreioDeviceSessions as devices,
  recreioProfiles as profiles,
  recreioMinorProtection as protection,
  recreioSafetyReports as reports,
  recreioProfileRestrictions as restrictions,
  recreioRestrictionReviews as reviews,
  sessions,
  users,
} from "@informach/db/schema";
import { emitirProvaDeModeracao, verificarProvaDeModeracao } from "@informach/recreio/emissor";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { ReferenciaDeJogador } from "@/features/autoridade-de-jogo/aparelho-repository";
import { executarComandoDeModeracaoNoBanco } from "@/features/moderacao/comandos-repository";
import { denunciarContato } from "@/features/moderacao/denuncias-service";
import { pedirRevisaoDaRestricao } from "@/features/moderacao/recurso-service";
import { emitirCodigoDeAmigo, pedirAmizade } from "@/features/social/service";
import { eventosCom, loginReal, novaConta, novoJogador } from "./apoio";
import { familiaSocial, referenciaSocial as ref } from "./social-apoio";

const segredo = "moderation-integration-only-".repeat(3);
async function equipe() {
  const conta = await novaConta(),
    login = await loginReal(conta);
  await db
    .update(users)
    .set({ role: "admin", twoFactorEnabled: true })
    .where(eq(users.id, conta.id));
  return { conta, login };
}
async function denunciar(alvo: ReferenciaDeJogador) {
  const origem = await novoJogador({ comAcesso: false });
  const codigo = await emitirCodigoDeAmigo(alvo);
  await pedirAmizade(ref(origem), { codigo: codigo.codigo, pedidoId: crypto.randomUUID() });
  return denunciarContato(ref(origem), {
    perfilId: alvo.perfilId,
    denunciaId: crypto.randomUUID(),
    categoria: "ameaca",
  });
}
async function prova(
  autor: Awaited<ReturnType<typeof equipe>>,
  comando: unknown,
  agora = new Date(),
) {
  const token = await emitirProvaDeModeracao(segredo, {
    contaId: autor.conta.id,
    authSessionId: autor.login.authSessionId,
    comando,
    agora,
  });
  return verificarProvaDeModeracao(segredo, token, comando, new Date());
}
async function preparar() {
  const alvo = await novoJogador({ comAcesso: false }),
    autor = await equipe();
  const caso = await denunciar(ref(alvo));
  const base = { comandoId: crypto.randomUUID(), protocolo: caso.protocolo, versaoDoCaso: 1 };
  return { alvo, autor, base };
}
async function nativo(
  jogador: Awaited<ReturnType<typeof novoJogador>>,
): Promise<AutorNativoRecente> {
  const [sessao] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, jogador.login.authSessionId));
  if (!sessao) throw new Error("Sessão ausente");
  return {
    ...jogador.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
}

describe("comandos restritos da equipe têm efeito e recibo atômicos", () => {
  it("repetições simultâneas analisam uma vez; retirada do papel recusa até o replay", async () => {
    const r = await preparar(),
      p = await prova(r.autor, { ...r.base, operacao: "analisar" });
    const recibos = await Promise.all([
      executarComandoDeModeracaoNoBanco(p),
      executarComandoDeModeracaoNoBanco(p),
    ]);
    expect(recibos.map((x) => x.repetido).sort()).toEqual([false, true]);
    expect(
      (await db.select().from(reports).where(eq(reports.id, r.base.protocolo)))[0],
    ).toMatchObject({ state: "em_analise", revision: 2 });
    expect(
      (await eventosCom("commandId", r.base.comandoId)).filter(
        (e) => e.eventType === "recreio.moderation_command_applied",
      ),
    ).toHaveLength(1);
    await db.update(users).set({ role: "member" }).where(eq(users.id, r.autor.conta.id));
    await expect(executarComandoDeModeracaoNoBanco(p)).rejects.toMatchObject({
      codigo: "SEM_PERMISSAO",
    });
  });
  it("corpo diferente com mesmo comando e segunda análise com revisão antiga são recusados", async () => {
    const r = await preparar();
    await executarComandoDeModeracaoNoBanco(
      await prova(r.autor, { ...r.base, operacao: "analisar" }),
    );
    await expect(
      executarComandoDeModeracaoNoBanco(
        await prova(r.autor, {
          ...r.base,
          versaoDoCaso: 2,
          operacao: "concluir",
          decisao: "sem_elementos",
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await expect(
      executarComandoDeModeracaoNoBanco(
        await prova(r.autor, {
          ...r.base,
          comandoId: crypto.randomUUID(),
          operacao: "analisar",
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    expect(
      await db.select().from(commands).where(eq(commands.reportId, r.base.protocolo)),
    ).toHaveLength(1);
  });
  it("suspensão conserva recurso próprio após expurgo; liberação responde esse caso sem reviver aparelho", async () => {
    const r = await preparar();
    const c = {
      ...r.base,
      operacao: "suspender_perfil",
      perfilId: r.alvo.perfil.id,
      versaoDoPerfil: r.alvo.perfil.versaoDaPolitica,
      motivo: "medida_preventiva",
    };
    await executarComandoDeModeracaoNoBanco(await prova(r.autor, c));
    const [suspenso] = await db.select().from(profiles).where(eq(profiles.id, r.alvo.perfil.id));
    if (!suspenso) throw new Error("Perfil ausente");
    const recurso = await pedirRevisaoDaRestricao(await nativo(r.alvo), {
      perfilId: r.alvo.perfil.id,
      recursoId: crypto.randomUUID(),
      versaoDoPerfil: suspenso.policyVersion,
    });
    await expect(
      executarComandoDeModeracaoNoBanco(
        await prova(r.autor, {
          ...c,
          comandoId: crypto.randomUUID(),
          versaoDoCaso: 2,
          versaoDoPerfil: suspenso.policyVersion,
          operacao: "reativar_perfil",
          motivo: "recurso_procedente",
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    await db.delete(reports).where(eq(reports.id, r.base.protocolo));
    const responder = {
      comandoId: crypto.randomUUID(),
      protocolo: recurso.protocolo,
      versaoDoCaso: 1,
      operacao: "responder_recurso",
      perfilId: r.alvo.perfil.id,
      versaoDoPerfil: suspenso.policyVersion,
      versaoDaRestricao: suspenso.policyVersion,
      decisao: "reativar",
      motivo: "recurso_procedente",
    };
    const recibo = await executarComandoDeModeracaoNoBanco(await prova(r.autor, responder));
    expect(recibo).toMatchObject({ repetido: false, versaoDoCaso: 2 });
    expect(
      (await db.select().from(restrictions).where(eq(restrictions.profileId, r.alvo.perfil.id)))[0],
    ).toMatchObject({
      state: "released",
      revision: suspenso.policyVersion + 1,
      sourceReportId: null,
    });
    expect(
      (await db.select().from(reviews).where(eq(reviews.id, recurso.protocolo)))[0],
    ).toMatchObject({ state: "resolvido", decision: "reativar" });
    expect(
      (await db.select().from(commands).where(eq(commands.id, responder.comandoId)))[0],
    ).toMatchObject({
      caseKind: "recurso_restricao",
      restrictionReviewId: recurso.protocolo,
      reportId: null,
    });
  });
  it("menor reativado conserva geração nova e aparelho pareado revogado", async () => {
    const menor = await familiaSocial(15),
      autor = await equipe(),
      caso = await denunciar(menor.referencia);
    const [antes] = await db
      .select()
      .from(credentials)
      .where(eq(credentials.deviceSessionId, menor.referencia.sessaoDeAparelhoId));
    await executarComandoDeModeracaoNoBanco(
      await prova(autor, {
        comandoId: crypto.randomUUID(),
        protocolo: caso.protocolo,
        versaoDoCaso: 1,
        operacao: "suspender_perfil",
        perfilId: menor.perfil.id,
        versaoDoPerfil: menor.perfil.versaoDaPolitica,
        motivo: "risco_confirmado",
      }),
    );
    const [suspenso] = await db.select().from(profiles).where(eq(profiles.id, menor.perfil.id));
    if (!suspenso) throw new Error("Perfil ausente");
    const recurso = await pedirRevisaoDaRestricao(menor.autor, {
      perfilId: menor.perfil.id,
      recursoId: crypto.randomUUID(),
      versaoDoPerfil: suspenso.policyVersion,
    });
    await executarComandoDeModeracaoNoBanco(
      await prova(autor, {
        comandoId: crypto.randomUUID(),
        protocolo: recurso.protocolo,
        versaoDoCaso: 1,
        operacao: "responder_recurso",
        perfilId: menor.perfil.id,
        versaoDoPerfil: suspenso.policyVersion,
        versaoDaRestricao: suspenso.policyVersion,
        decisao: "reativar",
        motivo: "recurso_procedente",
      }),
    );
    const [depois] = await db
      .select()
      .from(credentials)
      .where(eq(credentials.deviceSessionId, menor.referencia.sessaoDeAparelhoId));
    const [aparelho] = await db
      .select()
      .from(devices)
      .where(eq(devices.id, menor.referencia.sessaoDeAparelhoId));
    expect(antes).toBeDefined();
    const [atual] = await db
      .select()
      .from(protection)
      .where(eq(protection.profileId, menor.perfil.id));
    expect(depois?.accessGeneration).toBe(antes?.accessGeneration);
    expect(atual?.accessGeneration).not.toBe(depois?.accessGeneration);
    expect(aparelho?.revokedAt).not.toBeNull();
    await expect(emitirCodigoDeAmigo(menor.referencia)).rejects.toBeDefined();
  });
  it("alvo alheio ao caso e denúncia encerrada não autorizam suspensão", async () => {
    const r = await preparar(),
      outro = await novoJogador({ comAcesso: false });
    await expect(
      executarComandoDeModeracaoNoBanco(
        await prova(r.autor, {
          ...r.base,
          operacao: "suspender_perfil",
          perfilId: outro.perfil.id,
          versaoDoPerfil: outro.perfil.versaoDaPolitica,
          motivo: "medida_preventiva",
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    const fechamento = new Date();
    await db
      .update(reports)
      .set({
        state: "encerrada",
        closedAt: fechamento,
        expiresAt: new Date(fechamento.getTime() + 90 * 86_400_000),
      })
      .where(eq(reports.id, r.base.protocolo));
    await expect(
      executarComandoDeModeracaoNoBanco(await prova(r.autor, { ...r.base, operacao: "analisar" })),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    expect(
      await db.select().from(commands).where(eq(commands.reportId, r.base.protocolo)),
    ).toHaveLength(0);
  });
  it("falha da auditoria reverte status, restrição, revisão e recibo", async () => {
    const r = await preparar();
    await db.execute(
      sql`create function audit.falhar_moderacao_comando_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.moderation_command_applied' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger falhar_moderacao_comando_teste before insert on audit.events for each row execute function audit.falhar_moderacao_comando_teste()`,
    );
    try {
      await expect(
        executarComandoDeModeracaoNoBanco(
          await prova(r.autor, {
            ...r.base,
            operacao: "suspender_perfil",
            perfilId: r.alvo.perfil.id,
            versaoDoPerfil: r.alvo.perfil.versaoDaPolitica,
            motivo: "medida_preventiva",
          }),
        ),
      ).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(
        (await db.select().from(profiles).where(eq(profiles.id, r.alvo.perfil.id)))[0]?.status,
      ).toBe("active");
      expect(
        await db.select().from(restrictions).where(eq(restrictions.profileId, r.alvo.perfil.id)),
      ).toHaveLength(0);
      expect(
        await db.select().from(commands).where(eq(commands.reportId, r.base.protocolo)),
      ).toHaveLength(0);
      expect(
        (await db.select().from(reports).where(eq(reports.id, r.base.protocolo)))[0]?.revision,
      ).toBe(1);
    } finally {
      await db.execute(sql`drop trigger falhar_moderacao_comando_teste on audit.events`);
      await db.execute(sql`drop function audit.falhar_moderacao_comando_teste()`);
    }
  });
  it("sessão da equipe que vence na auditoria reverte a análise e o recibo", async () => {
    const r = await preparar();
    const p = await prova(r.autor, { ...r.base, operacao: "analisar" });
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + 1000) })
      .where(eq(sessions.id, r.autor.login.authSessionId));
    await db.execute(
      sql`create function audit.esperar_moderacao_comando_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.moderation_command_applied' then perform pg_sleep(1.1); end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger esperar_moderacao_comando_teste before insert on audit.events for each row execute function audit.esperar_moderacao_comando_teste()`,
    );
    try {
      await expect(executarComandoDeModeracaoNoBanco(p)).rejects.toMatchObject({
        codigo: "SEM_PERMISSAO",
      });
      expect(
        (await db.select().from(reports).where(eq(reports.id, r.base.protocolo)))[0]?.revision,
      ).toBe(1);
      expect(
        await db.select().from(commands).where(eq(commands.id, r.base.comandoId)),
      ).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger esperar_moderacao_comando_teste on audit.events`);
      await db.execute(sql`drop function audit.esperar_moderacao_comando_teste()`);
    }
  });
});
