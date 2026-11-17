import "server-only";
import { and, db, eq, sql } from "@informach/db";
import { recreioGroups as groups, recreioProfiles as profiles } from "@informach/db/schema";
import { GrupoIdSchema, PerfilIdSchema } from "@informach/recreio";
import {
  autorizarContaNativa,
  type IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { decidirFatosLidos, decidirPlanoLido } from "@/features/acesso/decisao";
import { lerFatosDeAcesso, lerFatosDoGrupo } from "@/features/acesso/repository";

/** Projeção exclusiva do próprio adulto. Não apresenta membros ou finanças de terceiro. */
export async function lerMinhaParticipacao(autor: IdentidadeNativa) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const nativa = await autorizarContaNativa(tx, autor);
    const [perfil] = await tx
      .select()
      .from(profiles)
      .where(and(eq(profiles.userId, autor.contaId), eq(profiles.kind, "adult")));
    if (!perfil) {
      await nativa.conferirPrazo();
      return null;
    }
    const [proprio] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.ownerUserId, autor.contaId));
    const fatosProprios = proprio
      ? await lerFatosDoGrupo(GrupoIdSchema.parse(proprio.id), tx)
      : null;
    const perfilId = PerfilIdSchema.parse(perfil.id);
    const fatos = await lerFatosDeAcesso(perfilId, tx);
    const agora = await nativa.conferirPrazo();
    return {
      perfilId,
      apelido: perfil.nickname,
      versao: perfil.policyVersion,
      grupoId: perfil.groupId === null ? null : GrupoIdSchema.parse(perfil.groupId),
      grupoProprio: proprio?.id === perfil.groupId,
      selecionado: perfil.coverageEnabled,
      efetivo: decidirFatosLidos(fatos, agora).podeJogar,
      limiteProprio: fatosProprios ? decidirPlanoLido(fatosProprios, agora).limiteDePerfis : 0,
    };
  });
}
export type MinhaParticipacao = NonNullable<Awaited<ReturnType<typeof lerMinhaParticipacao>>>;
