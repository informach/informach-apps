import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioMinorProfiles as minors,
  recreioProfiles as profiles,
  sessions,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { consultarSupervisao, salvarSupervisao } from "@/features/politicas/service";
import {
  aprovarPareamento,
  consultarPareamento,
  desconectarTodosDoMenor,
  prepararPareamento,
} from "@/features/protecao/service";
import { resolverAtor } from "@/features/sessao/service";
import { comJogadorSocial, comProtecaoSocial } from "@/features/social/autoridade-repository";
import { loginReal, novaConta, novoJogador } from "./apoio";

let ip = 1;
async function menor() {
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
  const supervisao = await consultarSupervisao(autor, perfil.id);
  await salvarSupervisao(autor, {
    perfilId: perfil.id,
    versao: supervisao.versao,
    configuracao: supervisao.configuracao,
    reconheco: true,
  });
  const pedido = await prepararPareamento(`203.0.113.${ip++}`);
  const aprovado = await aprovarPareamento(autor, { perfilId: perfil.id, codigo: pedido.codigo });
  await consultarPareamento(pedido.segredo);
  return {
    autor,
    perfil,
    referencia: { perfilId: perfil.id, sessaoDeAparelhoId: aprovado.aparelhoId },
  };
}
const referencia = (p: Awaited<ReturnType<typeof novoJogador>>) => ({
  perfilId: p.perfil.id,
  sessaoDeAparelhoId: p.ator.sessaoDeAparelhoId,
});

describe("admissão social por identidade atual, sem concessão de gameplay", () => {
  it("dois adultos sem cobertura conversam somente com o próprio perfil; não abre partida", async () => {
    const a = await novoJogador({ comAcesso: false });
    const b = await novoJogador({ comAcesso: false });
    const resultado = await comJogadorSocial(referencia(a), b.perfil.id, async (_tx, atual) => ({
      origem: atual.origem.id,
      destino: atual.destino?.id,
      contaId: atual.contaId,
    }));
    expect(resultado).toEqual({ origem: a.perfil.id, destino: b.perfil.id, contaId: a.conta.id });
    expect(await db.select().from(games).where(eq(games.profileId, a.perfil.id))).toHaveLength(0);
    await expect(
      comJogadorSocial({ ...referencia(a), perfilId: b.perfil.id }, a.perfil.id, async () => true),
    ).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
  });
  it("pareado conserva sua geração, sem atribuir ações infantis à conta do responsável", async () => {
    const a = await menor();
    const b = await novoJogador({ comAcesso: false });
    expect(
      await comJogadorSocial(a.referencia, b.perfil.id, async (_tx, atual) => ({
        tipo: atual.origem.tipo,
        contaId: atual.contaId,
      })),
    ).toEqual({ tipo: "protegido", contaId: null });
    await desconectarTodosDoMenor(a.autor, a.perfil.id);
    await expect(
      comJogadorSocial(a.referencia, b.perfil.id, async () => true),
    ).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
  });
  it("perda física do login ou prazo do aparelho impede a ação após espera", async () => {
    const a = await novoJogador({ comAcesso: false });
    const b = await novoJogador({ comAcesso: false });
    await db
      .update(devices)
      .set({ expiresAt: new Date(Date.now() + 1000) })
      .where(eq(devices.id, a.ator.sessaoDeAparelhoId));
    await expect(
      comJogadorSocial(referencia(a), b.perfil.id, async (tx) => {
        await tx.execute(sql`select pg_sleep(1.1)`);
        return true;
      }),
    ).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
    const c = await novoJogador({ comAcesso: false });
    await db.delete(sessions).where(eq(sessions.id, c.login.authSessionId));
    await expect(
      comJogadorSocial(referencia(c), b.perfil.id, async () => true),
    ).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
  });
  it("recalcular idade do destinatário confirma revisão mesmo ao recusar a interação", async () => {
    const a = await menor();
    const b = await novoJogador({ comAcesso: false });
    const [antes] = await db.select().from(profiles).where(eq(profiles.id, a.perfil.id));
    await db
      .update(minors)
      .set({ birthYear: new Date().getUTCFullYear() - 14 })
      .where(eq(minors.profileId, a.perfil.id));
    await expect(
      comJogadorSocial(referencia(b), a.perfil.id, async () => true),
    ).rejects.toMatchObject({ code: "CONTATO" });
    const [depois] = await db.select().from(profiles).where(eq(profiles.id, a.perfil.id));
    expect(depois?.policyVersion).toBe((antes?.policyVersion ?? 0) + 1);
  });
  it("proteção própria não exige que o alvo suspenso esteja disponível para contato", async () => {
    const a = await novoJogador({ comAcesso: false });
    const b = await menor();
    await db.update(profiles).set({ status: "suspended" }).where(eq(profiles.id, b.perfil.id));
    expect(
      await comProtecaoSocial(referencia(a), b.perfil.id, async (_tx, atual) => ({
        perfilId: atual.perfilId,
        alvoId: atual.alvoId,
      })),
    ).toEqual({ perfilId: a.perfil.id, alvoId: b.perfil.id });
  });
  it("pedidos recíprocos mantêm a ordem de contas e perfis", async () => {
    const a = await novoJogador({ comAcesso: false });
    const b = await novoJogador({ comAcesso: false });
    expect(
      await Promise.all([
        comJogadorSocial(referencia(a), b.perfil.id, async () => "a"),
        comJogadorSocial(referencia(b), a.perfil.id, async () => "b"),
      ]),
    ).toEqual(["a", "b"]);
  });
});
