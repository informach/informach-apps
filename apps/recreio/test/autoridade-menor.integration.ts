import { db, eq } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioMinorProfiles as minors,
  recreioProfiles as profiles,
  sessions,
  recreioMinorDailyUsage as usage,
} from "@informach/db/schema";
import { SessaoDeJogoIdSchema, VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it, vi } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import {
  alterarDados,
  consultarDados,
  desbloquearConquista,
} from "@/features/dados-de-perfil/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { consultarSupervisao, salvarSupervisao } from "@/features/politicas/service";
import {
  prepararConcessaoDeTempo,
  registrarConcessaoDeTempo,
} from "@/features/politicas/tempo-repository";
import { agoraDoBanco } from "@/features/protecao/autoridade-repository";
import {
  aprovarPareamento,
  consultarPareamento,
  definirPinDaConta,
  definirPinDoMenor,
  desconectarTodosDoMenor,
  prepararPareamento,
  trocarPerfilComPin,
} from "@/features/protecao/service";
import { resolverAtor } from "@/features/sessao/service";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { conceder } from "../scripts/concessoes";
import { eventosCom, loginReal, novaConta } from "./apoio";

// Um título L independente. O manifesto e a classificação reais do Morada são preservados.
vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "perfil-menor",
      nome: "Progresso protegido",
      rota: "/jogar/perfil-menor",
      capacidades: {
        ...real.JOGOS[0].capacidades,
        mundos: null,
        posse: [],
        dadosDePerfil: true,
        conquistas: true,
      },
      conquistas: ["primeiro-ponto"],
      classificacao: { faixa: "L", descritores: [], interacoes: [] },
    },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((j) => j.id === id) ?? null,
  };
});

let ip = 1;
/** A sessão/ledger são fixtures de autoridade; a emissão pelo ingresso é homologada separadamente. */
async function abrir(compartilhado = false, reconhecer = true, jogo = "perfil-menor") {
  const conta = await novaConta();
  const login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessaoNativa] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessaoNativa) throw new Error("Login ausente");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: {
      authSessionId: sessaoNativa.id,
      criadoEm: sessaoNativa.createdAt,
      expiraEm: sessaoNativa.expiresAt,
    },
  };
  const intencao = await prepararPerfilMenor(autor);
  const { perfil } = await cadastrarPerfilMenor(autor, {
    intencaoId: intencao.id,
    perfil: { apelido: "Protegido", avatar: "padrao" },
    nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
    assumoResponsabilidade: true,
    versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
  });
  await conceder({ email: conta.email, tier: "family", dias: 30, motivo: "teste" });
  const supervisao = await consultarSupervisao(autor, perfil.id);
  if (reconhecer)
    await salvarSupervisao(autor, {
      perfilId: perfil.id,
      versao: supervisao.versao,
      configuracao: supervisao.configuracao,
      reconheco: true,
    });
  let aparelhoId = autor.sessaoDeAparelhoId;
  if (compartilhado) {
    await definirPinDaConta(autor, { pin: "593871" });
    await definirPinDoMenor(autor, { perfilId: perfil.id, pin: "396175" });
    await trocarPerfilComPin(autor, {
      destino: { tipo: "perfil", perfilId: perfil.id },
      pin: "396175",
    });
  } else {
    const pedido = await prepararPareamento(`198.51.100.${ip++}`);
    const pareado = await aprovarPareamento(autor, { perfilId: perfil.id, codigo: pedido.codigo });
    await consultarPareamento(pedido.segredo);
    aparelhoId = pareado.aparelhoId;
  }
  const sessao = await db.transaction(async (tx) => {
    await tx.select().from(profiles).where(eq(profiles.id, perfil.id)).for("update");
    const agora = await agoraDoBanco(tx);
    const preparada = await prepararConcessaoDeTempo(tx, perfil.id, supervisao.configuracao, agora);
    if (!preparada.permitido) throw new Error("Concessão recusada");
    const sid = SessaoDeJogoIdSchema.parse(crypto.randomUUID());
    await tx.insert(games).values({
      id: sid,
      profileId: perfil.id,
      deviceSessionId: aparelhoId,
      gameId: jogo,
      expiresAt: preparada.expiraEm,
    });
    await registrarConcessaoDeTempo(tx, perfil.id, sid, preparada, preparada.expiraEm);
    return {
      sid,
      perfilId: perfil.id,
      jogo,
      expiraEm: preparada.expiraEm.getTime(),
      versaoDaPolitica: supervisao.versao,
    } satisfies SessaoDeJogoAtiva;
  });
  return { conta, login, autor, perfil, aparelhoId, sessao };
}
const gravacao = { operacao: "gravar", chave: "progresso", revisao: 0, conteudo: "YQ==" };

describe("autoridade infantil dos dados do jogo", () => {
  it.each([false, true])(
    "progresso e conquista pertencem ao perfil e não concedem gestão; compartilhado=%s",
    async (compartilhado) => {
      const r = await abrir(compartilhado);
      expect(await alterarDados(r.sessao, gravacao)).toEqual({ revisao: 1 });
      expect(await consultarDados(r.sessao, "progresso", false)).toMatchObject({
        versao: { conteudo: "YQ==" },
      });
      await desbloquearConquista(r.sessao, {
        id: "primeiro-ponto",
        chaveIdem: "primeira-conquista",
      });
      const eventos = (await eventosCom("profileId", r.perfil.id)).filter((e) =>
        ["recreio.profile_data_updated", "recreio.achievement_unlocked"].includes(e.eventType),
      );
      expect(eventos).toHaveLength(2);
      expect(eventos.every((e) => e.actorId === null)).toBe(true);
      if (compartilhado)
        await expect(consultarSupervisao(r.autor, r.perfil.id)).rejects.toMatchObject({
          code: "AUTH",
        });
      const outro = await abrir();
      expect(await consultarDados(outro.sessao, "progresso", false)).toEqual({ versao: null });
      await expect(
        consultarDados({ ...r.sessao, perfilId: outro.perfil.id }, "progresso", false),
      ).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
    },
  );
  it("revogação e geração antigas não voltam mesmo restaurando flags do aparelho e da partida", async () => {
    const r = await abrir();
    await desconectarTodosDoMenor(r.autor, r.perfil.id);
    await db.update(devices).set({ revokedAt: null }).where(eq(devices.id, r.aparelhoId));
    await db
      .update(games)
      .set({ endedAt: null, endReason: null, endedSeq: null })
      .where(eq(games.id, r.sessao.sid));
    await expect(alterarDados(r.sessao, gravacao)).rejects.toMatchObject({
      codigo: "SESSAO_INVALIDA",
    });
  });
  it("falta de reconhecimento, concessão vencida e Morada em análise são recusados no servidor", async () => {
    const naoReconhecido = await abrir(false, false);
    await expect(alterarDados(naoReconhecido.sessao, gravacao)).rejects.toMatchObject({
      codigo: "POLITICA_INCOMPATIVEL",
    });
    const vencida = await abrir();
    await db
      .update(usage)
      .set({ leaseUntil: new Date(Date.now() - 1000), accountedUntil: new Date(Date.now() - 2000) })
      .where(eq(usage.profileId, vencida.perfil.id));
    await expect(alterarDados(vencida.sessao, gravacao)).rejects.toMatchObject({
      codigo: "SESSAO_INVALIDA",
    });
    const morada = await abrir(false, true, "morada");
    // Chamada direta ao kernel, pois o Morada sequer declara capacidade de dados pessoais.
    const { comSessaoDeJogoAutoritativa } = await import(
      "@/features/autoridade-de-jogo/repository"
    );
    await expect(
      comSessaoDeJogoAutoritativa(
        morada.sessao,
        async () => {},
        async () => "invalido",
      ),
    ).rejects.toMatchObject({ codigo: "POLITICA_INCOMPATIVEL" });
  });
  it("recalcular a idade encerra concessão antiga e confirma a revisão mesmo recusando a escrita", async () => {
    const r = await abrir();
    await db
      .update(minors)
      .set({ birthYear: new Date().getUTCFullYear() - 13 })
      .where(eq(minors.profileId, r.perfil.id));
    await expect(alterarDados(r.sessao, gravacao)).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
      detalhe: { motivo: "permissions_changed" },
    });
    expect((await db.select().from(games).where(eq(games.id, r.sessao.sid)))[0]?.endReason).toBe(
      "permissions_changed",
    );
    expect(
      (await db.select().from(profiles).where(eq(profiles.id, r.perfil.id)))[0]?.policyVersion,
    ).toBe(2);
    expect(await consultarSupervisao(r.autor, r.perfil.id)).toMatchObject({
      versao: 2,
      reconhecida: false,
    });
  });
});
