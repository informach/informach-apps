import { db, eq } from "@informach/db";
import {
  recreioGameSessions as games,
  sessions,
  recreioGameTickets as tickets,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import {
  definirPinDaConta,
  definirPinDoMenor,
  trocarPerfilComPin,
} from "@/features/protecao/service";
import { emitirIngresso, trocarIngresso } from "@/features/sessao-de-jogo/service";
import { conceder, revogar } from "../scripts/concessoes";
import { novoJogador } from "./apoio";

describe("ingresso anterior à perda de autoridade", () => {
  it("restaurar cobertura não revalida ingresso emitido antes da revogação", async () => {
    const r = await novoJogador();
    const ingresso = await emitirIngresso(r.ator, { jogo: "morada" });
    await revogar({ email: r.conta.email, motivo: "teste" });
    await conceder({ email: r.conta.email, tier: "individual", dias: 30, motivo: "teste" });
    await expect(trocarIngresso({ ingresso: ingresso.ingresso })).rejects.toMatchObject({
      codigo: "INGRESSO_INVALIDO",
    });
    expect(await db.select().from(games).where(eq(games.profileId, r.perfil.id))).toEqual([]);
    const novo = await emitirIngresso(r.ator, { jogo: "morada" });
    await expect(trocarIngresso({ ingresso: novo.ingresso })).resolves.toMatchObject({
      perfil: { profileId: r.perfil.id },
    });
  });
  it("voltar pelo PIN ao mesmo perfil não revalida ingresso do contexto anterior", async () => {
    const r = await novoJogador();
    const [sessao] = await db.select().from(sessions).where(eq(sessions.id, r.login.authSessionId));
    if (!sessao) throw new Error("Login ausente");
    const autor: AutorNativoRecente = {
      ...r.ator,
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
    await definirPinDaConta(autor, { pin: "593871" });
    await definirPinDoMenor(autor, { perfilId: perfil.id, pin: "396175" });
    const ingresso = await emitirIngresso(r.ator, { jogo: "morada" });
    await trocarPerfilComPin(autor, {
      destino: { tipo: "perfil", perfilId: perfil.id },
      pin: "396175",
    });
    await trocarPerfilComPin(autor, {
      destino: { tipo: "perfil", perfilId: r.perfil.id },
      pin: "593871",
    });
    await expect(trocarIngresso({ ingresso: ingresso.ingresso })).rejects.toMatchObject({
      codigo: "INGRESSO_INVALIDO",
    });
    expect(await db.select().from(games).where(eq(games.profileId, r.perfil.id))).toEqual([]);
    expect(
      await db.select().from(tickets).where(eq(tickets.deviceSessionId, r.ator.sessaoDeAparelhoId)),
    ).toEqual([]);
  });
});
