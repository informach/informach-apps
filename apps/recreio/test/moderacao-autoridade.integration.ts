import { db, eq, sql } from "@informach/db";
import { sessions, users } from "@informach/db/schema";
import { emitirProvaDeModeracao, verificarProvaDeModeracao } from "@informach/recreio/emissor";
import { describe, expect, it } from "vitest";
import { admitirEquipeDeModeracao } from "@/features/moderacao/autoridade-repository";
import { travarComposicaoSocial } from "@/features/social/composicao-repository";
import { novoJogador } from "./apoio";

const segredo = "3".repeat(64);
async function preparar() {
  const jogador = await novoJogador({ comAcesso: false });
  const comando = {
    comandoId: crypto.randomUUID(),
    protocolo: crypto.randomUUID(),
    versaoDoCaso: 1,
    operacao: "analisar",
  };
  const token = await emitirProvaDeModeracao(segredo, {
    contaId: jogador.conta.id,
    authSessionId: jogador.login.authSessionId,
    comando,
    agora: new Date(),
  });
  const prova = await verificarProvaDeModeracao(segredo, token, comando, new Date());
  const admitir = () =>
    db.transaction(async (tx) => {
      await travarComposicaoSocial(
        tx,
        { tipo: "equipe", contaId: jogador.conta.id },
        [],
        async () => {
          const atual = await admitirEquipeDeModeracao(tx, prova);
          await atual.conferirPrazo();
        },
      );
    });
  return { jogador, comando, prova, admitir };
}
describe("prova de moderação ainda exige equipe atual, 2FA e sessão física", () => {
  it("membro não vira equipe pela assinatura, e retirada do papel invalida a mesma prova", async () => {
    const r = await preparar();
    await expect(r.admitir()).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
    await db
      .update(users)
      .set({ role: "admin", twoFactorEnabled: true })
      .where(eq(users.id, r.jogador.conta.id));
    await expect(r.admitir()).resolves.toBeUndefined();
    await db.update(users).set({ role: "member" }).where(eq(users.id, r.jogador.conta.id));
    await expect(r.admitir()).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
  });
  it("2FA retirada, banimento vigente e e-mail não confirmado recusam sem cache", async () => {
    const r = await preparar();
    for (const invalido of [
      { twoFactorEnabled: false },
      { banned: true, banExpiresAt: null },
      { emailVerified: false },
    ]) {
      await db
        .update(users)
        .set({
          role: "admin",
          twoFactorEnabled: true,
          banned: false,
          emailVerified: true,
          ...invalido,
        })
        .where(eq(users.id, r.jogador.conta.id));
      await expect(r.admitir()).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
    }
  });
  it("sessão apagada ou do emissor web não satisfaz a autoridade nativa do Bastidores", async () => {
    const r = await preparar();
    await db
      .update(users)
      .set({ role: "owner", twoFactorEnabled: true })
      .where(eq(users.id, r.jogador.conta.id));
    await db
      .update(sessions)
      .set({ originApp: "conta" })
      .where(eq(sessions.id, r.jogador.login.authSessionId));
    await expect(r.admitir()).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
    await db.delete(sessions).where(eq(sessions.id, r.jogador.login.authSessionId));
    await expect(r.admitir()).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
  });
  it("limite de expediente continua em doze horas mesmo com expiresAt maior", async () => {
    const r = await preparar();
    await db
      .update(users)
      .set({ role: "admin", twoFactorEnabled: true })
      .where(eq(users.id, r.jogador.conta.id));
    await db
      .update(sessions)
      .set({
        createdAt: new Date(Date.now() - 13 * 3_600_000),
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .where(eq(sessions.id, r.jogador.login.authSessionId));
    await expect(r.admitir()).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
  });
  it("prova que vence durante a transação exige recusa ao conferir depois da espera", async () => {
    const r = await preparar();
    await db
      .update(users)
      .set({ role: "admin", twoFactorEnabled: true })
      .where(eq(users.id, r.jogador.conta.id));
    await db
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(sessions.id, r.jogador.login.authSessionId));
    const token = await emitirProvaDeModeracao(segredo, {
      contaId: r.jogador.conta.id,
      authSessionId: r.jogador.login.authSessionId,
      comando: r.comando,
      agora: new Date(Date.now() - 28_000),
    });
    const prova = await verificarProvaDeModeracao(segredo, token, r.comando, new Date());
    await expect(
      db.transaction(async (tx) => {
        await travarComposicaoSocial(
          tx,
          { tipo: "equipe", contaId: prova.contaId },
          [],
          async () => {
            const atual = await admitirEquipeDeModeracao(tx, prova);
            await tx.execute(sql`select pg_sleep(2.1)`);
            await atual.conferirPrazo();
          },
        );
      }),
    ).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
  });
});
