import "server-only";
import { faixaPermite } from "@informach/config/jogos";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioPairedCredentials as credentials,
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioGuardianLinks as guardians,
  recreioProfiles as profiles,
  recreioMinorProtection as protection,
  recreioMinorDailyUsage as usage,
  users,
} from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import { decidirFatosLidos } from "@/features/acesso/decisao";
import { lerFatosDeAcesso } from "@/features/acesso/repository";
import { jogosProtegidosDisponiveis } from "@/features/familia/disponibilidade";
import { jogoQueAbre } from "@/features/jogos/config";
import {
  calcularPoliticaEfetivaSobTrava,
  politicaConfereNoInstante,
} from "@/features/politicas/repository";
import { calendarioDeBrasilia } from "@/features/politicas/tempo-repository";
import { agoraDoBanco } from "@/features/protecao/autoridade-repository";
import { sessaoDeLoginViva } from "@/features/sessao/login";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import type { Transacao } from "@/lib/repository";

/** Pistas não autorizam a operação: a admissão relê cada relação sob suas travas. */
async function prepararIdentidade(tx: Transacao, sessao: SessaoDeJogoAtiva) {
  const [referencia] = await tx
    .select({ perfil: profiles, aparelhoId: games.deviceSessionId })
    .from(profiles)
    .innerJoin(games, and(eq(games.profileId, profiles.id), eq(games.id, sessao.sid)))
    .where(eq(profiles.id, sessao.perfilId));
  if (!referencia) throw new ErroDoRecreio("SESSAO_INVALIDA");
  const [aparelho] = await tx.select().from(devices).where(eq(devices.id, referencia.aparelhoId));
  const [pareado] =
    aparelho?.kind === "paired_device"
      ? await tx
          .select({ responsavelId: credentials.guardianUserId })
          .from(credentials)
          .where(eq(credentials.deviceSessionId, aparelho.id))
      : [];
  const contaId = aparelho?.kind === "account" ? aparelho.userId : pareado?.responsavelId;
  if (!contaId) throw new ErroDoRecreio("SESSAO_INVALIDA");
  const [conta] = await tx.select().from(users).where(eq(users.id, contaId)).for("share");
  if (!conta?.emailVerified) throw new ErroDoRecreio("SESSAO_INVALIDA");
  return { conta, aparelhoId: referencia.aparelhoId, tipo: referencia.perfil.kind };
}

type IdentidadePreparada = Awaited<ReturnType<typeof prepararIdentidade>>;
type Recusa = { admitida: false; erro: ErroDoRecreio };
const recusar = (erro = new ErroDoRecreio("SESSAO_INVALIDA")): Recusa => ({
  admitida: false,
  erro,
});

/** Identidade → perfil → mutex de domínio → proteção/aparelho → cursor se necessário → jogo. */
async function admitirSessao(
  tx: Transacao,
  sessao: SessaoDeJogoAtiva,
  identidade: IdentidadePreparada,
  antesDoAparelho: (tx: Transacao) => Promise<void>,
) {
  const [perfil] = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.id, sessao.perfilId))
    .for(identidade.tipo === "minor" ? "update" : "share");
  if (!perfil || perfil.kind !== identidade.tipo || perfil.status !== "active")
    throw new ErroDoRecreio("SESSAO_INVALIDA");
  if (perfil.kind === "adult" && perfil.userId !== identidade.conta.id)
    throw new ErroDoRecreio("SESSAO_INVALIDA");
  if (perfil.kind === "minor" && (!jogosProtegidosDisponiveis || perfil.userId !== null))
    throw new ErroDoRecreio("SESSAO_INVALIDA");
  const [vinculo] =
    perfil.kind === "minor"
      ? await tx
          .select()
          .from(guardians)
          .where(
            and(
              eq(guardians.profileId, perfil.id),
              eq(guardians.guardianUserId, identidade.conta.id),
            ),
          )
          .for("share")
      : [];
  const [protecao] =
    perfil.kind === "minor"
      ? await tx.select().from(protection).where(eq(protection.profileId, perfil.id)).for("share")
      : [];
  if (perfil.kind === "minor" && (!vinculo || protecao?.guardianLinkId !== vinculo.id))
    throw new ErroDoRecreio("SESSAO_INVALIDA");
  const politica =
    perfil.kind === "minor" ? await calcularPoliticaEfetivaSobTrava(tx, sessao.perfilId) : null;
  await antesDoAparelho(tx);
  const [aparelho] = await tx
    .select()
    .from(devices)
    .where(eq(devices.id, identidade.aparelhoId))
    .for("share");
  if (!aparelho || aparelho.revokedAt || aparelho.activeProfileId !== perfil.id)
    throw new ErroDoRecreio("SESSAO_INVALIDA");
  if (aparelho.kind === "account") {
    if (
      aparelho.userId !== identidade.conta.id ||
      !aparelho.authSessionId ||
      (perfil.kind === "adult"
        ? aparelho.minorContextGeneration !== null
        : aparelho.minorContextGeneration !== protecao?.accessGeneration)
    )
      throw new ErroDoRecreio("SESSAO_INVALIDA");
  } else {
    const [credencial] = await tx
      .select()
      .from(credentials)
      .where(eq(credentials.deviceSessionId, aparelho.id))
      .for("share");
    if (
      perfil.kind !== "minor" ||
      aparelho.userId !== null ||
      aparelho.authSessionId !== null ||
      !credencial?.tokenHash ||
      credencial.profileId !== perfil.id ||
      credencial.guardianUserId !== identidade.conta.id ||
      credencial.accessGeneration !== protecao?.accessGeneration
    )
      throw new ErroDoRecreio("SESSAO_INVALIDA");
  }
  const conferirIdentidadeAtual = async () => {
    if (
      aparelho.kind === "account" &&
      (!aparelho.authSessionId ||
        !(await sessaoDeLoginViva(
          { authSessionId: aparelho.authSessionId, contaId: identidade.conta.id },
          tx,
        )))
    )
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    const agora = await agoraDoBanco(tx);
    if (
      aparelho.expiresAt <= agora ||
      sessao.expiraEm <= agora.getTime() ||
      (identidade.conta.banned &&
        (!identidade.conta.banExpiresAt || identidade.conta.banExpiresAt > agora))
    )
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    return agora;
  };
  // Nunca pedir o cursor depois de segurar game_sessions, nem antes de admitir o aparelho.
  if (politica?.mudou) {
    await conferirIdentidadeAtual();
    await encerrarSessoesAbertas(tx, sql`${games.profileId}=${perfil.id}`, "permissions_changed", {
      porQuem: "recreio",
    });
    await conferirIdentidadeAtual();
    return recusar(new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "permissions_changed" }));
  }
  const [jogo] = await tx.select().from(games).where(eq(games.id, sessao.sid)).for("share");
  const fatos = await lerFatosDeAcesso(sessao.perfilId, tx);
  const agora = await conferirIdentidadeAtual();
  if (
    !jogo ||
    jogo.profileId !== perfil.id ||
    jogo.deviceSessionId !== aparelho.id ||
    jogo.gameId !== sessao.jogo ||
    jogo.endedAt !== null ||
    jogo.expiresAt <= agora ||
    aparelho.expiresAt <= agora ||
    sessao.expiraEm <= agora.getTime() ||
    (politica?.versao ?? perfil.policyVersion) !== sessao.versaoDaPolitica ||
    (identidade.conta.banned &&
      (!identidade.conta.banExpiresAt || identidade.conta.banExpiresAt > agora))
  )
    return recusar();
  const decisao = decidirFatosLidos(fatos, agora);
  if (!decisao.podeJogar)
    return recusar(
      new ErroDoRecreio("ACESSO_PERDIDO", { estado: decisao.estado, motivo: decisao.motivo }),
    );
  if (politica) {
    if (!politicaConfereNoInstante(politica, agora)) return recusar();
    const manifesto = jogoQueAbre(sessao.jogo);
    if (
      !politica.reconhecida ||
      politica.politica.pausado ||
      !faixaPermite(politica.politica.faixa, manifesto.classificacao.faixa)
    )
      return recusar(new ErroDoRecreio("POLITICA_INCOMPATIVEL"));
    const calendario = await calendarioDeBrasilia(tx, agora);
    const [concessao] = await tx
      .select({ fim: usage.leaseUntil })
      .from(usage)
      .where(
        and(
          eq(usage.profileId, perfil.id),
          eq(usage.localDay, calendario.dia),
          eq(usage.sessionId, jogo.id),
        ),
      );
    if (!concessao?.fim || concessao.fim <= agora || jogo.expiresAt > concessao.fim)
      return recusar();
  }
  const conferirPrazoFinal = async () => {
    const fim = await conferirIdentidadeAtual();
    if (
      jogo.expiresAt <= fim ||
      aparelho.expiresAt <= fim ||
      sessao.expiraEm <= fim.getTime() ||
      (politica !== null && !politicaConfereNoInstante(politica, fim)) ||
      (identidade.conta.banned &&
        (!identidade.conta.banExpiresAt || identidade.conta.banExpiresAt > fim))
    )
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    const acessoFinal = decidirFatosLidos(fatos, fim);
    if (!acessoFinal.podeJogar)
      throw new ErroDoRecreio("ACESSO_PERDIDO", {
        estado: acessoFinal.estado,
        motivo: acessoFinal.motivo,
      });
  };
  return {
    admitida: true as const,
    contaId: perfil.kind === "adult" ? identidade.conta.id : null,
    conferirPrazoFinal,
  };
}

/** Recusas após recalcular a política confirmam a invalidação antes de virar erro HTTP. */
export async function comSessaoDeJogoAutoritativa<T>(
  sessao: SessaoDeJogoAtiva,
  antesDoAparelho: (tx: Transacao) => Promise<void>,
  executar: (tx: Transacao, contaId: string | null) => Promise<T>,
): Promise<T> {
  const resultado = await db.transaction(async (tx) => {
    await tx.execute(sql`set local transaction_timeout='10s'`);
    await tx.execute(sql`set local lock_timeout='5s'`);
    const identidade = await prepararIdentidade(tx, sessao);
    const admissao = await admitirSessao(tx, sessao, identidade, antesDoAparelho);
    if (!admissao.admitida) return admissao;
    const valor = await executar(tx, admissao.contaId);
    // Uma espera em chave ou auditoria também pode atravessar o prazo de autoridade.
    await admissao.conferirPrazoFinal();
    return { admitida: true as const, valor };
  });
  if (!resultado.admitida) throw resultado.erro;
  return resultado.valor;
}
