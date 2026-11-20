import "server-only";
import { logAuditEventStrict } from "@informach/auth/audit";
import { sql } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioProfileDataKeys as keys,
} from "@informach/db/schema";
import type { PerfilId } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { comPerfilPessoal } from "./autoridade-repository";
import { JogoPessoalIdSchema } from "./contrato";

/** Descoberta paginada de fontes pessoais persistidas, inclusive jogos retirados.
 * Uma página é uma leitura SQL consistente; várias páginas não são um snapshot
 * congelado da conta. O coordenador da exportação completa ainda deve fixá-lo. */
export function listarJogosPessoaisNoBanco(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  apos: string | null,
) {
  return comPerfilPessoal(autor, perfilId, null, async (tx, perfil, conferirPrazo) => {
    const linhas = await tx.execute<{ jogo: string }>(sql`
      select jogo from (
        select ${keys.gameId} as jogo from ${keys} where ${keys.profileId}=${perfil.id}
        union
        select ${achievements.gameId} as jogo from ${achievements} where ${achievements.profileId}=${perfil.id}
      ) as jogos_pessoais
      where jogo collate "C" > ${apos ?? ""} collate "C"
      order by jogo collate "C" limit 21
    `);
    // Legado fora do formato não pode ser silenciosamente omitido do inventário.
    const ids = linhas.map((linha) => JogoPessoalIdSchema.parse(linha.jogo));
    const itens = ids.slice(0, 20);
    await logAuditEventStrict(
      "recreio.profile_game_inventory_viewed",
      autor.contaId,
      {
        app: "recreio",
        profileId: perfil.id,
        gameCount: itens.length,
        hasMore: ids.length > 20,
      },
      { writer: tx },
    );
    return {
      itens,
      proximo: ids.length > 20 ? (itens.at(-1) ?? null) : null,
      conferidoEm: (await conferirPrazo()).toISOString(),
    };
  });
}
