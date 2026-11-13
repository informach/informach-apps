import { and, db, eq, isNull } from "@informach/db";
import {
  recreioGameSessions as gameSessions,
  sessions,
  recreioGameTickets as tickets,
} from "@informach/db/schema";
import { ErroDoRecreio, ehErroDoRecreio, SessaoDeJogoIdSchema } from "@informach/recreio";
import {
  IngressoEmitidoSchema,
  SessaoAbertaSchema,
  SessaoRenovadaSchema,
  TIPO_DA_SESSAO,
  TIPO_DO_INGRESSO,
} from "@informach/recreio/contrato";
import { criarVerificadorDeSessao } from "@informach/recreio/host";
import { describe, expect, it, vi } from "vitest";
import * as jogosConfig from "@/features/jogos/config";
import { selecionarPerfil } from "@/features/perfis/service";
import { encerrarSessaoDeAparelho, resolverAtor } from "@/features/sessao/service";
import { emitirIngresso } from "@/features/sessao-de-jogo/service";
import { chavesDoRecreio } from "@/lib/tokens";
import { revogar } from "../scripts/concessoes";
import { aposentarInstancias, eventosCom, type Jogador, loginReal, novoJogador } from "./apoio";
import {
  claimsDe,
  entrarNoJogo,
  esperar,
  ingressoDe,
  MORADA,
  novaInstancia,
  OUTRO_JOGO,
} from "./jogo-apoio";
import { despachar, ORIGEM, pedir } from "./rotas";

// O catálogo de verdade tem um jogo só. Para provar que um jogo não alcança o
// outro, os testes acrescentam um segundo, igual ao Morada em tudo menos no id.
vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    { ...real.JOGOS[0], id: "jogo-de-teste", nome: "Jogo de teste", rota: "/jogar/jogo-de-teste" },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((jogo) => jogo.id === id) ?? null,
    ehGameId: (id: string) => jogos.some((jogo) => jogo.id === id),
  };
});

const trocar = (ingresso: string, extra: { continuarAqui?: boolean } = {}) =>
  pedir("POST", "/api/sdk/v1/sessao", { corpo: { ingresso, ...extra } });
const renovar = (token: string) => pedir("POST", "/api/sdk/v1/sessao/renovar", { token });
const sair = (token: string) => pedir("POST", "/api/sdk/v1/sessao/sair", { token });
const listar = (token: string, jogo = MORADA) =>
  pedir("GET", `/api/sdk/v1/mundos?jogo=${jogo}`, { token });

async function sessaoNoBanco(sid: string) {
  const [linha] = await db.select().from(gameSessions).where(eq(gameSessions.id, sid));
  return linha;
}

function abertasDe(jogador: Jogador) {
  return db
    .select({ id: gameSessions.id })
    .from(gameSessions)
    .where(and(eq(gameSessions.profileId, jogador.perfil.id), isNull(gameSessions.endedAt)));
}

/** Outro aparelho da mesma conta: outra sessão de login, com o mesmo perfil escolhido. */
async function outroAparelho(jogador: Jogador): Promise<Jogador> {
  const login = await loginReal(jogador.conta);
  const contexto = await resolverAtor(login);
  if (!contexto) throw new Error("A sessão de aparelho deveria existir");
  await selecionarPerfil(contexto.ator, jogador.perfil.id);
  return { ...jogador, login, ator: { ...contexto.ator, perfil: jogador.perfil } };
}

describe("chaves públicas", () => {
  it("serve a chave atual sem a parte privada, e o servidor do jogo confere a sessão com ela", async () => {
    const resposta = await despachar(`${ORIGEM}/api/sdk/v1/jwks`);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("public, max-age=300");
    const jwks = await resposta.json();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", use: "sig", alg: "EdDSA" });
    expect(jwks.keys[0].kid).toMatch(/^local-[0-9a-f]{8}$/);
    expect(jwks.keys[0]).not.toHaveProperty("d");

    const lia = await novoJogador();
    const { token, sid } = await entrarNoJogo(lia);
    const verificador = criarVerificadorDeSessao({ emissor: ORIGEM, jogo: MORADA, jwks });
    await expect(verificador.verificar(token)).resolves.toMatchObject({
      perfilId: lia.perfil.id,
      sid,
      jogo: MORADA,
    });
    // O verificador de outro jogo recusa a mesma sessão.
    await expect(
      criarVerificadorDeSessao({ emissor: ORIGEM, jogo: OUTRO_JOGO, jwks }).verificar(token),
    ).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
  });
});

describe("ingresso", () => {
  it("limita a emissão por perfil sem gravar ingressos além do teto", async () => {
    const lia = await novoJogador();
    for (let i = 0; i < 20; i++) await ingressoDe(lia);
    await expect(ingressoDe(lia)).rejects.toMatchObject({ codigo: "MUITAS_TENTATIVAS" });
    const linhas = await db
      .select({ id: tickets.jti })
      .from(tickets)
      .where(eq(tickets.profileId, lia.perfil.id));
    expect(linhas).toHaveLength(20);
    const bruno = await novoJogador();
    await expect(ingressoDe(bruno)).resolves.toBeTypeOf("string");
  });
  it("sai para o perfil ativo, vale 60 s e não leva a conta", async () => {
    const lia = await novoJogador();
    const emitido = IngressoEmitidoSchema.parse(await emitirIngresso(lia.ator, { jogo: MORADA }));
    const claims = claimsDe(emitido.ingresso);
    expect(Object.keys(claims).sort()).toEqual(
      ["aud", "exp", "iat", "iss", "jti", "nbf", "pv", "scp", "sid", "sub"].sort(),
    );
    expect(claims).toMatchObject({
      iss: ORIGEM,
      aud: MORADA,
      sub: lia.perfil.id,
      sid: lia.ator.sessaoDeAparelhoId,
    });
    expect(Number(claims.exp) - Number(claims.iat)).toBe(60);
    expect(emitido.ingresso).not.toContain(lia.conta.id);
    const cabecalho = JSON.parse(
      Buffer.from(emitido.ingresso.split(".")[0] ?? "", "base64url").toString(),
    );
    expect(cabecalho.typ).toBe(TIPO_DO_INGRESSO);

    const [linha] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.jti, String(claims.jti)));
    expect(linha).toMatchObject({
      profileId: lia.perfil.id,
      deviceSessionId: lia.ator.sessaoDeAparelhoId,
      gameId: MORADA,
      consumedAt: null,
    });
  });

  it("não sai para quem não tem o direito de jogar, e a recusa diz o estado", async () => {
    const semAcesso = await novoJogador({ comAcesso: false });
    const recusa = await emitirIngresso(semAcesso.ator, { jogo: MORADA }).catch((erro) => erro);
    expect(ehErroDoRecreio(recusa, "ACESSO_NEGADO")).toBe(true);
    expect(recusa.detalhe).toEqual({ estado: "SEM_ACESSO", motivo: "sem_plano" });
  });

  it("não sai para um jogo que não existe", async () => {
    const lia = await novoJogador();
    await expect(emitirIngresso(lia.ator, { jogo: "xadrez" })).rejects.toMatchObject({
      codigo: "JOGO_INDISPONIVEL",
    });
    await expect(emitirIngresso(lia.ator, { jogo: MORADA, perfil: "x" })).rejects.toThrow();
  });
});

describe("manutenção durante uma sessão", () => {
  it("não renova e encerra a sessão para o próximo batimento da instância", async () => {
    const lia = await novoJogador();
    const sessao = await entrarNoJogo(lia);
    const indisponivel = vi.spyOn(jogosConfig, "jogoQueAbre").mockImplementationOnce(() => {
      throw new ErroDoRecreio("JOGO_INDISPONIVEL");
    });
    try {
      const resposta = await renovar(sessao.token);
      expect(resposta).toMatchObject({ status: 404, corpo: { codigo: "JOGO_INDISPONIVEL" } });
      expect(await sessaoNoBanco(sessao.sid)).toMatchObject({ endReason: "access_lost" });
    } finally {
      indisponivel.mockRestore();
    }
  });
});

describe("troca do ingresso pela sessão", () => {
  it("devolve o token, o perfil e a política, e nada da conta", async () => {
    const lia = await novoJogador({ apelido: "Lia", avatar: "sol" });
    const resposta = await trocar(await ingressoDe(lia));
    expect(resposta.status).toBe(200);
    const aberta = SessaoAbertaSchema.parse(resposta.corpo);
    expect(aberta.perfil).toEqual({ profileId: lia.perfil.id, apelido: "Lia", avatar: "sol" });
    expect(aberta.politica).toEqual({
      multiplayer: true,
      textoLivre: false,
      faixa: "18",
      versao: 1,
    });
    expect(JSON.stringify(resposta.corpo)).not.toContain(lia.conta.id);
    expect(JSON.stringify(resposta.corpo)).not.toContain(lia.conta.email);

    const claims = claimsDe(aberta.token);
    expect(claims).toMatchObject({ iss: ORIGEM, aud: MORADA, sub: lia.perfil.id });
    expect(Number(claims.exp) - Number(claims.iat)).toBe(15 * 60);
    const cabecalho = JSON.parse(
      Buffer.from(aberta.token.split(".")[0] ?? "", "base64url").toString(),
    );
    expect(cabecalho.typ).toBe(TIPO_DA_SESSAO);

    const linha = await sessaoNoBanco(String(claims.sid));
    expect(linha).toMatchObject({
      profileId: lia.perfil.id,
      deviceSessionId: lia.ator.sessaoDeAparelhoId,
      gameId: MORADA,
      endedAt: null,
      endedSeq: null,
    });
    expect(linha?.expiresAt.toISOString()).toBe(aberta.expiraEm);

    const [evento] = await eventosCom("sessionId", String(claims.sid));
    expect(evento).toMatchObject({
      eventType: "recreio.game_session_started",
      actorId: lia.conta.id,
      payload: { app: "recreio", profileId: lia.perfil.id, gameId: MORADA },
    });
    expect(JSON.stringify(evento?.payload)).not.toContain("Lia");
  });

  it("a sessão nunca passa do fim conhecido do acesso", async () => {
    const lia = await novoJogador({ comAcesso: false });
    // Uma concessão que termina em 5 minutos.
    const { conceder } = await import("../scripts/concessoes");
    const agora = new Date();
    await conceder(
      { email: lia.conta.email, tier: "individual", dias: 1, motivo: "teste" },
      { agora: new Date(agora.getTime() - 86_400_000 + 5 * 60_000) },
    );
    const { token } = await entrarNoJogo(lia);
    const claims = claimsDe(token);
    const dura = Number(claims.exp) - Number(claims.iat);
    expect(dura).toBeGreaterThan(4 * 60);
    expect(dura).toBeLessThanOrEqual(5 * 60);
  });

  it("o mesmo ingresso não abre duas sessões", async () => {
    const lia = await novoJogador();
    const ingresso = await ingressoDe(lia);
    expect((await trocar(ingresso)).status).toBe(200);
    const segunda = await trocar(ingresso, { continuarAqui: true });
    expect(segunda).toEqual({ status: 401, corpo: { codigo: "INGRESSO_INVALIDO" } });
    expect(await abertasDe(lia)).toHaveLength(1);

    const recusas = await esperar(async () =>
      (await eventosCom("profileId", lia.perfil.id)).filter(
        (evento) => evento.eventType === "recreio.ticket_rejected",
      ),
    );
    expect(recusas[0]).toMatchObject({
      actorId: null,
      payload: { gameId: MORADA, reason: "used_or_expired" },
    });
    expect(JSON.stringify(recusas[0]?.payload)).not.toContain(ingresso);
  });

  it("duas trocas ao mesmo tempo do mesmo ingresso dão uma sessão", async () => {
    const lia = await novoJogador();
    const ingresso = await ingressoDe(lia);
    const respostas = await Promise.all([trocar(ingresso), trocar(ingresso)]);
    expect(respostas.map((resposta) => resposta.status).sort()).toEqual([200, 401]);
    expect(await abertasDe(lia)).toHaveLength(1);
  });

  it("ingresso vencido no banco ou no token não abre", async () => {
    const lia = await novoJogador();
    const vencidoNoBanco = await ingressoDe(lia);
    await db
      .update(tickets)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(tickets.jti, String(claimsDe(vencidoNoBanco).jti)));
    expect(await trocar(vencidoNoBanco)).toEqual({
      status: 401,
      corpo: { codigo: "INGRESSO_INVALIDO" },
    });

    // Assinado há dois minutos: o prazo do próprio token já passou.
    const { emissor } = await chavesDoRecreio();
    const jti = crypto.randomUUID();
    const antigo = await emissor.ingresso({
      jogo: MORADA,
      perfilId: lia.perfil.id,
      sessaoDeAparelhoId: lia.ator.sessaoDeAparelhoId,
      versaoDaPolitica: 1,
      jti,
      agora: new Date(Date.now() - 120_000),
    });
    await db.insert(tickets).values({
      jti,
      profileId: lia.perfil.id,
      deviceSessionId: lia.ator.sessaoDeAparelhoId,
      gameId: MORADA,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect((await trocar(antigo.token)).corpo).toEqual({ codigo: "INGRESSO_INVALIDO" });
    expect(await abertasDe(lia)).toHaveLength(0);
  });

  it("ingresso com a audiência de outro jogo não abre, mesmo assinado pelo Recreio", async () => {
    const lia = await novoJogador();
    const doMorada = claimsDe(await ingressoDe(lia));
    const { emissor } = await chavesDoRecreio();
    const dados = {
      perfilId: lia.perfil.id,
      sessaoDeAparelhoId: lia.ator.sessaoDeAparelhoId,
      versaoDaPolitica: 1,
      jti: String(doMorada.jti),
      agora: new Date(),
    };
    // O mesmo `jti`, que o banco registrou para o Morada, com outra audiência.
    const trocado = await emissor.ingresso({ ...dados, jogo: OUTRO_JOGO });
    expect(await trocar(trocado.token)).toEqual({
      status: 401,
      corpo: { codigo: "INGRESSO_INVALIDO" },
    });
    // Audiência que não é jogo nenhum.
    const inventado = await emissor.ingresso({ ...dados, jogo: "xadrez" });
    expect((await trocar(inventado.token)).corpo).toEqual({ codigo: "INGRESSO_INVALIDO" });
    expect(await abertasDe(lia)).toHaveLength(0);
  });

  it("ingresso adulterado, sessão no lugar de ingresso e lixo dão a mesma recusa", async () => {
    const lia = await novoJogador();
    const ingresso = await ingressoDe(lia);
    const { token } = await entrarNoJogo(lia);
    for (const errado of [`${ingresso.slice(0, -4)}AAAA`, token, "lixo", "a.b.c"]) {
      expect(await trocar(errado)).toEqual({ status: 401, corpo: { codigo: "INGRESSO_INVALIDO" } });
    }
    expect(
      (await pedir("POST", "/api/sdk/v1/sessao", { corpo: { ingresso, a: 1 } })).corpo,
    ).toEqual({ codigo: "ENTRADA_INVALIDA" });
  });

  it("ingresso de um aparelho que saiu da conta não abre", async () => {
    const lia = await novoJogador();
    const ingresso = await ingressoDe(lia);
    await encerrarSessaoDeAparelho({
      authSessionId: lia.login.authSessionId,
      contaId: lia.conta.id,
    });
    expect((await trocar(ingresso)).corpo).toEqual({ codigo: "INGRESSO_INVALIDO" });
  });

  it("ingresso de quem perdeu o acesso depois de emitido não abre", async () => {
    const lia = await novoJogador();
    const ingresso = await ingressoDe(lia);
    await revogar({ email: lia.conta.email, motivo: "teste" });
    expect(await trocar(ingresso)).toEqual({
      status: 403,
      corpo: { codigo: "ACESSO_NEGADO", estado: "REVOGADO", motivo: "concessao_revogada" },
    });
  });

  it("com um jogo aberto em outro aparelho: JA_ABERTO, e `continuarAqui` encerra o anterior", async () => {
    const lia = await novoJogador();
    const primeira = await entrarNoJogo(lia);
    const celular = await outroAparelho(lia);
    const ingresso = await ingressoDe(celular);

    expect(await trocar(ingresso)).toEqual({ status: 409, corpo: { codigo: "JA_ABERTO" } });
    // A recusa não gastou o ingresso nem mexeu na sessão aberta.
    expect((await sessaoNoBanco(primeira.sid))?.endedAt).toBeNull();

    const segunda = await trocar(ingresso, { continuarAqui: true });
    expect(segunda.status).toBe(200);
    const nova = SessaoDeJogoIdSchema.parse(claimsDe(String(segunda.corpo.token)).sid);
    expect(nova).not.toBe(primeira.sid);
    expect(await sessaoNoBanco(primeira.sid)).toMatchObject({ endReason: "replaced" });
    expect((await abertasDe(lia)).map((linha) => linha.id)).toEqual([nova]);

    // O token antigo continua bem assinado, mas a sessão dele acabou.
    expect(await listar(primeira.token)).toEqual({
      status: 403,
      corpo: { codigo: "SESSAO_ENCERRADA", motivo: "replaced" },
    });
    expect(await renovar(primeira.token)).toMatchObject({
      status: 403,
      corpo: { codigo: "SESSAO_ENCERRADA" },
    });
    expect((await eventosCom("sessionId", primeira.sid)).at(-1)).toMatchObject({
      eventType: "recreio.game_session_ended",
      actorId: lia.conta.id,
      payload: { reason: "replaced", targetId: lia.conta.id },
    });
  });
});

describe("renovação", () => {
  it("troca o token e mantém a sessão", async () => {
    const lia = await novoJogador();
    const { token, sid } = await entrarNoJogo(lia);
    const antes = await sessaoNoBanco(sid);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const resposta = await renovar(token);
    expect(resposta.status).toBe(200);
    const renovada = SessaoRenovadaSchema.parse(resposta.corpo);
    expect(renovada.token).not.toBe(token);
    expect(claimsDe(renovada.token)).toMatchObject({ sid, sub: lia.perfil.id, aud: MORADA });
    const depois = await sessaoNoBanco(sid);
    expect(depois?.endedAt).toBeNull();
    expect(depois?.expiresAt.toISOString()).toBe(renovada.expiraEm);
    expect(depois?.lastRenewedAt.getTime()).toBeGreaterThan(antes?.lastRenewedAt.getTime() ?? 0);
    expect((await listar(renovada.token)).status).toBe(200);
  });

  it("recusa token que não é sessão, sem cabeçalho ou de sessão que não existe", async () => {
    const lia = await novoJogador();
    const ingresso = await ingressoDe(lia);
    const invalida = { status: 401, corpo: { codigo: "SESSAO_INVALIDA" } };
    expect(await renovar(ingresso)).toEqual(invalida);
    expect(await renovar("lixo")).toEqual(invalida);
    expect(await pedir("POST", "/api/sdk/v1/sessao/renovar")).toEqual(invalida);
    expect(await pedir("GET", `/api/sdk/v1/mundos?jogo=${MORADA}`)).toEqual(invalida);

    // Bem assinado, mas para uma sessão que o banco não conhece.
    const { emissor } = await chavesDoRecreio();
    const fantasma = await emissor.sessao({
      jogo: MORADA,
      perfilId: lia.perfil.id,
      sid: SessaoDeJogoIdSchema.parse(crypto.randomUUID()),
      versaoDaPolitica: 1,
      jti: crypto.randomUUID(),
      agora: new Date(),
    });
    expect(await renovar(fantasma.token)).toEqual(invalida);
    expect(await listar(fantasma.token)).toEqual(invalida);
  });

  it("sessão de um jogo não lista os mundos de outro", async () => {
    const lia = await novoJogador();
    const { token } = await entrarNoJogo(lia);
    expect(await listar(token, OUTRO_JOGO)).toEqual({
      status: 401,
      corpo: { codigo: "SESSAO_INVALIDA" },
    });
  });

  it("com a concessão revogada: recusa, encerra a sessão e avisa só as instâncias daquele jogo, uma vez", async () => {
    await aposentarInstancias();
    const lia = await novoJogador();
    const doJogo = await novaInstancia(MORADA);
    const deOutroJogo = await novaInstancia(OUTRO_JOGO);
    const { token, sid } = await entrarNoJogo(lia);
    const inicio = await doJogo.cliente.batimento({ mundos: [], cursor: null });
    const inicioDoOutro = await deOutroJogo.cliente.batimento({ mundos: [], cursor: null });
    expect(inicio.sessoesEncerradas).toEqual([]);

    await revogar({ email: lia.conta.email, motivo: "teste" });
    expect(await renovar(token)).toEqual({
      status: 403,
      corpo: { codigo: "ACESSO_PERDIDO", estado: "REVOGADO", motivo: "concessao_revogada" },
    });
    const linha = await sessaoNoBanco(sid);
    expect(linha).toMatchObject({ endReason: "access_lost" });
    expect(linha?.endedAt).not.toBeNull();
    expect(linha?.endedSeq).toBeGreaterThan(0);

    const aviso = await doJogo.cliente.batimento({ mundos: [], cursor: inicio.cursor });
    expect(aviso.sessoesEncerradas).toEqual([{ sid, motivo: "access_lost" }]);
    const depois = await doJogo.cliente.batimento({ mundos: [], cursor: aviso.cursor });
    expect(depois.sessoesEncerradas).toEqual([]);

    // A instância de outro jogo nunca fica sabendo, nem com o cursor do começo.
    const outro = await deOutroJogo.cliente.batimento({
      mundos: [],
      cursor: inicioDoOutro.cursor,
    });
    expect(outro.sessoesEncerradas).toEqual([]);
    expect(
      (await deOutroJogo.cliente.batimento({ mundos: [], cursor: null })).sessoesEncerradas,
    ).toEqual([]);

    // A sessão acabou de vez: renovar de novo não a reabre.
    expect(await renovar(token)).toEqual({
      status: 403,
      corpo: { codigo: "SESSAO_ENCERRADA", motivo: "access_lost" },
    });
    const eventos = await eventosCom("sessionId", sid);
    expect(eventos.at(-1)).toMatchObject({
      eventType: "recreio.game_session_ended",
      actorId: null,
      payload: { reason: "access_lost", targetId: lia.conta.id },
    });
  });

  it("sair da conta encerra as sessões de jogo daquele aparelho na hora", async () => {
    await aposentarInstancias();
    const lia = await novoJogador();
    const instancia = await novaInstancia(MORADA);
    const { token, sid } = await entrarNoJogo(lia);
    const inicio = await instancia.cliente.batimento({ mundos: [], cursor: null });

    await encerrarSessaoDeAparelho({
      authSessionId: lia.login.authSessionId,
      contaId: lia.conta.id,
    });
    expect(await sessaoNoBanco(sid)).toMatchObject({ endReason: "signed_out" });
    const aviso = await instancia.cliente.batimento({ mundos: [], cursor: inicio.cursor });
    expect(aviso.sessoesEncerradas).toEqual([{ sid, motivo: "signed_out" }]);
    expect(await renovar(token)).toEqual({
      status: 403,
      corpo: { codigo: "SESSAO_ENCERRADA", motivo: "signed_out" },
    });
  });

  it("login encerrado por outro caminho (sem passar pela saída) derruba a sessão de jogo na renovação", async () => {
    const lia = await novoJogador();
    const { token, sid } = await entrarNoJogo(lia);
    // O que o Bastidores ou a expiração fazem: a sessão de login some, e a
    // linha da sessão de aparelho fica sem `revoked_at`.
    await db.delete(sessions).where(eq(sessions.id, lia.login.authSessionId));
    expect(await renovar(token)).toEqual({
      status: 403,
      corpo: { codigo: "ACESSO_PERDIDO", motivo: "signed_out" },
    });
    expect(await sessaoNoBanco(sid)).toMatchObject({ endReason: "signed_out" });
  });
});

describe("sair do jogo", () => {
  it("encerra a sessão como `left` e repetir não faz nada", async () => {
    const lia = await novoJogador();
    const { token, sid } = await entrarNoJogo(lia);
    expect(await sair(token)).toEqual({ status: 200, corpo: {} });
    const linha = await sessaoNoBanco(sid);
    expect(linha).toMatchObject({ endReason: "left" });
    expect(await sair(token)).toEqual({ status: 200, corpo: {} });
    expect((await sessaoNoBanco(sid))?.endedSeq).toBe(linha?.endedSeq);
    expect(await sair("lixo")).toEqual({ status: 401, corpo: { codigo: "SESSAO_INVALIDA" } });

    // Quem saiu pode abrir de novo sem `continuarAqui`.
    expect((await trocar(await ingressoDe(lia))).status).toBe(200);
  });

  it("os números do cursor saem em ordem mesmo com encerramentos simultâneos", async () => {
    const jogadores = await Promise.all(Array.from({ length: 8 }, () => novoJogador()));
    const abertas = await Promise.all(jogadores.map((jogador) => entrarNoJogo(jogador)));
    await Promise.all(abertas.map((sessao) => sair(sessao.token)));
    const linhas = await Promise.all(abertas.map((sessao) => sessaoNoBanco(sessao.sid)));
    const numeros = linhas.map((linha) => linha?.endedSeq ?? 0);
    expect(new Set(numeros).size).toBe(8);
    // Quem recebeu o número menor terminou antes: a ordem do cursor é a do commit.
    const porNumero = [...linhas].sort((a, b) => (a?.endedSeq ?? 0) - (b?.endedSeq ?? 0));
    const instantes = porNumero.map((linha) => linha?.endedAt?.getTime() ?? 0);
    expect(instantes).toEqual([...instantes].sort((a, b) => a - b));
  });
});
