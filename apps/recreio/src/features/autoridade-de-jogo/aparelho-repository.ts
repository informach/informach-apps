import "server-only";
import { faixaPermite } from "@informach/config/jogos";
import { and, eq, sql } from "@informach/db";
import {
  recreioPairedCredentials as credentials,
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioGuardianLinks as guardians,
  recreioProfiles as profiles,
  recreioMinorProtection as protection,
  users,
} from "@informach/db/schema";
import { ErroDoRecreio, type PerfilId, type SessaoDeAparelhoId } from "@informach/recreio";
import { decidirFatosLidos } from "@/features/acesso/decisao";
import { lerFatosDeAcesso } from "@/features/acesso/repository";
import { jogosProtegidosDisponiveis } from "@/features/familia/disponibilidade";
import { jogoQueAbre } from "@/features/jogos/config";
import {
  calcularPoliticaEfetivaSobTrava,
  politicaConfereNoInstante,
} from "@/features/politicas/repository";
import { agoraDoBanco } from "@/features/protecao/autoridade-repository";
import { sessaoDeLoginViva } from "@/features/sessao/login";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import type { Transacao } from "@/lib/repository";

export type ReferenciaDeJogador = { perfilId: PerfilId; sessaoDeAparelhoId: SessaoDeAparelhoId };
/** Recusa no prazo da credencial; não comprova logout ou revogação física. */
export class PrazoDaCredencialVencido extends ErroDoRecreio {
  constructor() {
    super("SESSAO_INVALIDA");
  }
}
export type RecusaDeAutoridade = { admitida: false; erro: ErroDoRecreio };
export const recusarAutoridade = (
  erro = new ErroDoRecreio("SESSAO_INVALIDA"),
): RecusaDeAutoridade => ({ admitida: false, erro });

/** Só trava identidade. Mundos tomam suas travas antes de admitir o perfil/aparelho. */
export async function prepararIdentidadeDoJogo(tx: Transacao, referencia: ReferenciaDeJogador) {
  const [perfil] = await tx
    .select({ kind: profiles.kind })
    .from(profiles)
    .where(eq(profiles.id, referencia.perfilId));
  const [aparelho] = await tx
    .select()
    .from(devices)
    .where(eq(devices.id, referencia.sessaoDeAparelhoId));
  const [pareado] =
    aparelho?.kind === "paired_device"
      ? await tx
          .select({ responsavelId: credentials.guardianUserId })
          .from(credentials)
          .where(eq(credentials.deviceSessionId, aparelho.id))
      : [];
  const contaId = aparelho?.kind === "account" ? aparelho.userId : pareado?.responsavelId;
  if (!contaId || !perfil) throw new ErroDoRecreio("SESSAO_INVALIDA");
  const [conta] = await tx.select().from(users).where(eq(users.id, contaId)).for("share");
  if (!conta?.emailVerified) throw new ErroDoRecreio("SESSAO_INVALIDA");
  return { conta, tipo: perfil.kind };
}

/** Só identidade/aparelho atuais. O chamador ainda precisa autorizar a operação de domínio. */
export async function admitirAparelhoAtual(
  tx: Transacao,
  pedido: ReferenciaDeJogador & { expiraEm: number | null },
  identidade: Awaited<ReturnType<typeof prepararIdentidadeDoJogo>>,
  antesDoAparelho: (tx: Transacao) => Promise<void>,
) {
  const [perfil] = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.id, pedido.perfilId))
    .for(identidade.tipo === "minor" ? "update" : "share");
  if (
    !perfil ||
    perfil.kind !== identidade.tipo ||
    perfil.status !== "active" ||
    (perfil.kind === "adult" ? perfil.userId !== identidade.conta.id : perfil.userId !== null)
  )
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
  await antesDoAparelho(tx);
  const [aparelho] = await tx
    .select()
    .from(devices)
    .where(eq(devices.id, pedido.sessaoDeAparelhoId))
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
      (identidade.conta.banned &&
        (!identidade.conta.banExpiresAt || identidade.conta.banExpiresAt > agora))
    )
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    if (pedido.expiraEm !== null && pedido.expiraEm <= agora.getTime())
      throw new PrazoDaCredencialVencido();
    return agora;
  };
  await conferirIdentidadeAtual();
  const politica =
    perfil.kind === "minor" ? await calcularPoliticaEfetivaSobTrava(tx, pedido.perfilId) : null;
  if (politica?.mudou) {
    await encerrarSessoesAbertas(tx, sql`${games.profileId}=${perfil.id}`, "permissions_changed", {
      porQuem: "recreio",
    });
    await conferirIdentidadeAtual();
    return recusarAutoridade(
      new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "permissions_changed" }),
    );
  }
  const conferirPrazo = async () => {
    const instante = await conferirIdentidadeAtual();
    if (politica && !politicaConfereNoInstante(politica, instante))
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    return instante;
  };
  return {
    admitida: true as const,
    perfil,
    aparelho,
    politica,
    versaoDaPolitica: politica?.versao ?? perfil.policyVersion,
    contaId: perfil.kind === "adult" ? identidade.conta.id : null,
    conferirPrazo,
  };
}

/** Concessão de gameplay: soma direito comercial, conteúdo e política à identidade atual. */
export async function admitirAparelhoDeJogo(
  tx: Transacao,
  pedido: ReferenciaDeJogador & { jogo: string; expiraEm: number | null },
  identidade: Awaited<ReturnType<typeof prepararIdentidadeDoJogo>>,
  antesDoAparelho: (tx: Transacao) => Promise<void>,
) {
  if (identidade.tipo === "minor" && !jogosProtegidosDisponiveis)
    throw new ErroDoRecreio("SESSAO_INVALIDA");
  const contexto = await admitirAparelhoAtual(tx, pedido, identidade, antesDoAparelho);
  if (!contexto.admitida) return contexto;
  const { politica } = contexto;
  const manifesto = jogoQueAbre(pedido.jogo);
  const fatos = await lerFatosDeAcesso(pedido.perfilId, tx);
  const agora = await contexto.conferirPrazo();
  const decisao = decidirFatosLidos(fatos, agora);
  if (!decisao.podeJogar)
    return recusarAutoridade(
      new ErroDoRecreio("ACESSO_PERDIDO", { estado: decisao.estado, motivo: decisao.motivo }),
    );
  if (
    politica &&
    (!politicaConfereNoInstante(politica, agora) ||
      !politica.reconhecida ||
      politica.politica.pausado ||
      !faixaPermite(politica.politica.faixa, manifesto.classificacao.faixa))
  )
    return recusarAutoridade(new ErroDoRecreio("POLITICA_INCOMPATIVEL"));
  const conferirPrazo = async () => {
    const instante = await contexto.conferirPrazo();
    const vigente = decidirFatosLidos(fatos, instante);
    if (!vigente.podeJogar)
      throw new ErroDoRecreio("ACESSO_PERDIDO", { estado: vigente.estado, motivo: vigente.motivo });
    return instante;
  };
  return {
    ...contexto,
    decisao,
    agora,
    conferirPrazo,
  };
}
