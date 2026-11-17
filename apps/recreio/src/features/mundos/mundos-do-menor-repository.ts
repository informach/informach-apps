import "server-only";
import { and, db, eq, gt, ne, sql } from "@informach/db";
import { recreioSpaceMembers as members, recreioSpaces as spaces } from "@informach/db/schema";
import { MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
} from "@/features/account/autoridade-repository";
import {
  ComposicaoSocialMudou,
  travarComposicaoSocial,
} from "@/features/social/composicao-repository";
import { assertAllowed } from "@/lib/errors";

export async function mundosSobResponsabilidadeDoMenor(
  autor: AutorNativoRecente,
  perfil: unknown,
  apos: unknown,
) {
  const perfilId = PerfilIdSchema.parse(perfil),
    cursor = MundoIdSchema.nullish().parse(apos);
  const tentar = () =>
    db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='1s'`);
      await tx.execute(sql`set local transaction_timeout='15s'`);
      const composicao = await travarComposicaoSocial(
        tx,
        { tipo: "responsavel", contaId: autor.contaId },
        [perfilId],
      );
      const nativa = await autorizarContaNativa(tx, autor);
      const atual = composicao.perfis.find((p) => p.id === perfilId);
      assertAllowed(
        atual?.kind === "minor" &&
          composicao.vinculos.some(
            (v) => v.profileId === perfilId && v.guardianUserId === autor.contaId,
          ),
        "PERFIL",
        "Perfil indisponível para esta conta.",
      );
      const linhas = await tx
        .select({
          id: spaces.id,
          nome: spaces.name,
          estado: spaces.status,
          podeGerir: sql<boolean>`coalesce(${members.role}='steward' and ${spaces.stewardProfileId}=${perfilId},false)`,
        })
        .from(members)
        .innerJoin(spaces, eq(spaces.id, members.spaceId))
        .where(
          and(
            eq(members.profileId, perfilId),
            ne(members.state, "former"),
            ne(spaces.status, "deleted"),
            cursor ? gt(spaces.id, cursor) : undefined,
          ),
        )
        .orderBy(spaces.id)
        .limit(21);
      await nativa.conferirPrazo();
      const itens = linhas.slice(0, 20);
      return {
        perfilId,
        apelido: atual.nickname,
        itens,
        proximo: linhas.length > 20 ? (itens.at(-1)?.id ?? null) : null,
      };
    });
  try {
    return await tentar();
  } catch (erro) {
    if (!(erro instanceof ComposicaoSocialMudou)) throw erro;
    return tentar();
  }
}
