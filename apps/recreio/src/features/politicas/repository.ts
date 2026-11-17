import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioMinorProfiles as minors,
  recreioMinorPolicies as policies,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import {
  calcularPoliticaDoMenor,
  ErroDoRecreio,
  type PerfilId,
  type Supervisao,
  SupervisaoSchema,
  validarSupervisaoDoMenor,
} from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
  type IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { agoraDoBanco, autoridadeDoMenor } from "@/features/protecao/autoridade-repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { lerUsoRecente } from "./uso-repository";

const calendario = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "numeric",
});
function mesEAno(agora: Date) {
  const partes = calendario.formatToParts(agora);
  const ano = partes.find((p) => p.type === "year")?.value;
  const mes = partes.find((p) => p.type === "month")?.value;
  if (!ano || !mes) throw new ErroDoRecreio("INDISPONIVEL");
  return { ano: Number(ano), mes: Number(mes) };
}

function configuracaoDaLinha(linha: typeof policies.$inferSelect): Supervisao {
  return SupervisaoSchema.parse({
    limiteDeConteudo: linha.contentLimit,
    multiplayer: linha.multiplayerEnabled,
    textoLivre: linha.freeTextEnabled,
    contatos: linha.contactsEnabled,
    presenca: linha.presenceMode,
    pausado: linha.paused,
    minutosPorDia: linha.dailyMinutes,
    horarios: linha.weeklySchedule,
  });
}
function camposDaConfiguracao(configuracao: Supervisao) {
  return {
    contentLimit: configuracao.limiteDeConteudo,
    multiplayerEnabled: configuracao.multiplayer,
    freeTextEnabled: configuracao.textoLivre,
    contactsEnabled: configuracao.contatos,
    presenceMode: configuracao.presenca,
    paused: configuracao.pausado,
    dailyMinutes: configuracao.minutosPorDia,
    weeklySchedule: configuracao.horarios,
  };
}
async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}

/** Chamador trava a identidade antes; o perfil já entra em UPDATE, sem elevar SHARE. */
export async function calcularPoliticaEfetivaSobTrava(tx: Transacao, perfilId: PerfilId) {
  const [perfil] = await tx
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, perfilId), eq(profiles.kind, "minor")))
    .for("update");
  const [nascimento] = await tx
    .select({ ano: minors.birthYear, mes: minors.birthMonth })
    .from(minors)
    .where(eq(minors.profileId, perfilId))
    .for("share");
  if (!perfil || !nascimento || perfil.status !== "active")
    throw new ErroDoRecreio("SESSAO_INVALIDA");
  await tx.insert(policies).values({ profileId: perfilId }).onConflictDoNothing();
  const [linha] = await tx
    .select()
    .from(policies)
    .where(eq(policies.profileId, perfilId))
    .for("update");
  if (!linha) throw new ErroDoRecreio("INDISPONIVEL");
  const agora = await agoraDoBanco(tx);
  const configuracao = configuracaoDaLinha(linha);
  const politica = calcularPoliticaDoMenor(nascimento, mesEAno(agora), configuracao);
  const anterior = linha.computedAt
    ? calcularPoliticaDoMenor(nascimento, mesEAno(linha.computedAt), configuracao)
    : null;
  const mudou =
    linha.effectiveProfileVersion > 0 &&
    (linha.effectiveSocial !== politica.faixaSocial ||
      linha.effectiveRating !== politica.faixa ||
      anterior?.precisaContaAdulta !== politica.precisaContaAdulta);
  if (mudou && perfil.policyVersion >= 2147483646) throw new ErroDoRecreio("INDISPONIVEL");
  const versao = perfil.policyVersion + Number(mudou);
  if (mudou) {
    await tx
      .update(profiles)
      .set({ policyVersion: versao, updatedAt: agora })
      .where(eq(profiles.id, perfilId));
  }
  if (linha.effectiveProfileVersion !== versao || mudou) {
    await tx
      .update(policies)
      .set({
        effectiveProfileVersion: versao,
        effectiveSocial: politica.faixaSocial,
        effectiveRating: politica.faixa,
        computedAt: agora,
        updatedAt: agora,
      })
      .where(eq(policies.profileId, perfilId));
    await logAuditEventStrict(
      "recreio.minor_policy_recalculated",
      null,
      { app: "recreio", profileId: perfilId, revision: versao },
      { writer: tx },
    );
  }
  return {
    perfil,
    nascimento,
    configuracao,
    politica,
    versao,
    reconhecida: linha.acknowledgedVersion === versao,
    agora,
    mudou,
  };
}

/** Gestão já admitiu o aparelho antes do perfil alvo. Jogos invalidam depois de admitir o seu. */
export async function atualizarPoliticaEfetiva(tx: Transacao, perfilId: PerfilId) {
  const atual = await calcularPoliticaEfetivaSobTrava(tx, perfilId);
  if (atual.mudou)
    await encerrarSessoesAbertas(tx, sql`${games.profileId}=${perfilId}`, "permissions_changed", {
      porQuem: "recreio",
    });
  return atual;
}

/** Uma espera posterior não pode atravessar mudança etária conservando regras antigas. */
export function politicaConfereNoInstante(
  atual: Awaited<ReturnType<typeof calcularPoliticaEfetivaSobTrava>>,
  instante: Date,
) {
  const vigente = calcularPoliticaDoMenor(atual.nascimento, mesEAno(instante), atual.configuracao);
  return (
    vigente.faixa === atual.politica.faixa &&
    vigente.faixaSocial === atual.politica.faixaSocial &&
    vigente.precisaContaAdulta === atual.politica.precisaContaAdulta
  );
}

function visaoDaSupervisao(atual: Awaited<ReturnType<typeof atualizarPoliticaEfetiva>>) {
  return {
    perfilId: atual.perfil.id,
    apelido: atual.perfil.nickname,
    configuracao: atual.configuracao,
    politica: atual.politica,
    versao: atual.versao,
    reconhecida: atual.reconhecida,
  };
}

export async function lerSupervisao(autor: IdentidadeNativa, perfilId: PerfilId) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const nativa = await autorizarContaNativa(tx, autor);
    const menor = await autoridadeDoMenor(tx, perfilId, autor.contaId, "update");
    const atual = await atualizarPoliticaEfetiva(tx, perfilId);
    const usoRecente = await lerUsoRecente(tx, perfilId, await agoraDoBanco(tx));
    await menor.conferirPrazo();
    await nativa.conferirPrazo();
    return { ...visaoDaSupervisao(atual), usoRecente };
  });
}

export async function gravarSupervisao(
  autor: AutorNativoRecente,
  pedido: { perfilId: PerfilId; versao: number; configuracao: Supervisao },
) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const nativa = await autorizarContaNativa(tx, autor);
    const menor = await autoridadeDoMenor(tx, pedido.perfilId, autor.contaId, "update");
    const atual = await atualizarPoliticaEfetiva(tx, pedido.perfilId);
    assertAllowed(
      atual.versao === pedido.versao,
      "CONFLITO",
      "As regras mudaram. Reabra a supervisão antes de salvar.",
    );
    const configuracao = validarSupervisaoDoMenor(
      atual.nascimento,
      mesEAno(atual.agora),
      pedido.configuracao,
    );
    const mudou = JSON.stringify(configuracao) !== JSON.stringify(atual.configuracao);
    if (mudou && atual.versao >= 2147483646) throw new ErroDoRecreio("INDISPONIVEL");
    const versao = atual.versao + Number(mudou);
    const politica = calcularPoliticaDoMenor(atual.nascimento, mesEAno(atual.agora), configuracao);
    // O prazo é relido depois das travas de domínio e antes da mudança estrita.
    const agora = await nativa.conferirPrazo(autor.login);
    await menor.conferirPrazo();
    if (mudou) {
      await tx
        .update(profiles)
        .set({ policyVersion: versao, updatedAt: agora })
        .where(eq(profiles.id, pedido.perfilId));
      await encerrarSessoesAbertas(
        tx,
        sql`${games.profileId}=${pedido.perfilId}`,
        "permissions_changed",
        { porQuem: "ator", contaId: autor.contaId },
      );
    }
    if (mudou || !atual.reconhecida) {
      await tx
        .update(policies)
        .set({
          ...camposDaConfiguracao(configuracao),
          effectiveProfileVersion: versao,
          acknowledgedVersion: versao,
          effectiveSocial: politica.faixaSocial,
          effectiveRating: politica.faixa,
          computedAt: agora,
          updatedAt: agora,
        })
        .where(eq(policies.profileId, pedido.perfilId));
      await logAuditEventStrict(
        "recreio.minor_supervision_changed",
        autor.contaId,
        { app: "recreio", profileId: pedido.perfilId, revision: versao, changed: mudou },
        { writer: tx },
      );
    }
    // O cursor pode esperar outro encerramento: conferir novamente antes de confirmar.
    await nativa.conferirPrazo(autor.login);
    await menor.conferirPrazo();
    return visaoDaSupervisao({ ...atual, configuracao, politica, versao, reconhecida: true });
  });
}
