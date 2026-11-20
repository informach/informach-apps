import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, sql } from "@informach/db";
import {
  recreioAdultDeclarations as declarations,
  recreioGuardianLinks as guardians,
  recreioMinorProfiles as minors,
  recreioMinorPolicies as policies,
  recreioSocialPreferences as preferences,
  type recreioProfiles as profiles,
  recreioMinorProtection as protection,
} from "@informach/db/schema";
import { ErroDoRecreio, type PerfilId } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { configuracaoDaLinha } from "@/features/politicas/repository";
import type { Transacao } from "@/lib/repository";
import { comPerfilPessoal } from "./autoridade-repository";
import type { CopiaDoCadastroPessoal } from "./contrato";

/** Recorte do próprio cadastro. Seleção explícita impede exportar hashes de PIN,
 * gerações de credenciais ou identidade de outro adulto responsável/pagante. */
export function copiarCadastroPessoalNoBanco(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
): Promise<CopiaDoCadastroPessoal> {
  return comPerfilPessoal(autor, perfilId, null, (tx, perfil, conferirPrazo) =>
    lerCadastroPessoalNaTransacao(autor, tx, perfil, conferirPrazo),
  );
}

/** Consome apenas a transação/autoridade já admitida pelo coordenador pessoal. */
export async function lerCadastroPessoalNaTransacao(
  autor: AutorNativoRecente,
  tx: Transacao,
  perfil: typeof profiles.$inferSelect,
  conferirPrazo: () => Promise<Date>,
): Promise<CopiaDoCadastroPessoal> {
  const [preferencia] = await tx
    .select({ presenca: preferences.presenceMode, atualizadaEm: preferences.updatedAt })
    .from(preferences)
    .where(eq(preferences.profileId, perfil.id))
    .for("share");
  let nascimento: CopiaDoCadastroPessoal["nascimento"] = null;
  let responsabilidade: CopiaDoCadastroPessoal["responsabilidadeDeclarada"] = null;
  let supervisao: CopiaDoCadastroPessoal["supervisao"] = null;
  let protecao: CopiaDoCadastroPessoal["protecao"] = null;
  if (perfil.kind === "minor") {
    const [menor] = await tx
      .select({ ano: minors.birthYear, mes: minors.birthMonth })
      .from(minors)
      .where(eq(minors.profileId, perfil.id))
      .for("share");
    const [declaracao] = await tx
      .select({
        versao: declarations.version,
        registradaEm: declarations.createdAt,
        vinculadaEm: guardians.createdAt,
      })
      .from(guardians)
      .innerJoin(
        declarations,
        and(
          eq(declarations.id, guardians.declarationId),
          eq(declarations.userId, guardians.guardianUserId),
        ),
      )
      .where(and(eq(guardians.profileId, perfil.id), eq(guardians.guardianUserId, autor.contaId)));
    if (!menor || !declaracao) throw new ErroDoRecreio("INDISPONIVEL");
    nascimento = menor;
    responsabilidade = {
      versao: declaracao.versao,
      registradaEm: declaracao.registradaEm.toISOString(),
      vinculadaEm: declaracao.vinculadaEm.toISOString(),
    };
    // Conferir tamanho do JSON antes de carregá-lo. Não corrigir silenciosamente legado.
    const [tamanho] = await tx
      .select({
        bytes: sql<number>`coalesce(pg_column_size(${policies.weeklySchedule}),0)`.mapWith(Number),
      })
      .from(policies)
      .where(eq(policies.profileId, perfil.id))
      .for("share");
    if (
      tamanho &&
      (!Number.isSafeInteger(tamanho.bytes) || tamanho.bytes < 0 || tamanho.bytes > 16_384)
    )
      throw new ErroDoRecreio("INDISPONIVEL");
    const [politica] = await tx.select().from(policies).where(eq(policies.profileId, perfil.id));
    if (politica)
      supervisao = {
        configuracao: configuracaoDaLinha(politica),
        versaoEfetiva: politica.effectiveProfileVersion,
        versaoReconhecida: politica.acknowledgedVersion,
        faixaSocial: politica.effectiveSocial,
        faixaDeConteudo: politica.effectiveRating,
        calculadaEm: politica.computedAt?.toISOString() ?? null,
        atualizadaEm: politica.updatedAt.toISOString(),
      };
    const [protegido] = await tx
      .select({
        pinDefinido: sql<boolean>`${protection.pinHash} is not null`,
        atualizadaEm: protection.updatedAt,
      })
      .from(protection)
      .where(eq(protection.profileId, perfil.id))
      .for("share");
    if (protegido)
      protecao = {
        pinDefinido: protegido.pinDefinido,
        atualizadaEm: protegido.atualizadaEm.toISOString(),
      };
  }
  const copia: CopiaDoCadastroPessoal = {
    formato: "recreio-cadastro-pessoal-v1",
    escopo: "cadastro-protecao-supervisao-preferencia-social",
    conferidoEm: "",
    perfil: {
      id: perfil.id,
      tipo: perfil.kind,
      apelido: perfil.nickname,
      avatar: perfil.avatar,
      estado: perfil.status,
      coberturaHabilitada: perfil.coverageEnabled,
      criadoEm: perfil.createdAt.toISOString(),
      atualizadoEm: perfil.updatedAt.toISOString(),
    },
    nascimento,
    responsabilidadeDeclarada: responsabilidade,
    supervisao,
    protecao,
    preferenciaSocial: preferencia
      ? { presenca: preferencia.presenca, atualizadaEm: preferencia.atualizadaEm.toISOString() }
      : null,
  };
  await logAuditEventStrict(
    "recreio.profile_record_copy_prepared",
    autor.contaId,
    { app: "recreio", profileId: perfil.id, kind: perfil.kind },
    { writer: tx },
  );
  copia.conferidoEm = (await conferirPrazo()).toISOString();
  return copia;
}
