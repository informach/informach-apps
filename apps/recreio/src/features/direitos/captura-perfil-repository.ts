import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, gt, or, sql } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioSocialBlocks as blocks,
  recreioDirectedSpaceInvites as directed,
  recreioFriendships as friendships,
  recreioGameSessions as games,
  recreioGuardianLinks as guardians,
  recreioProfileDataKeys as keys,
  recreioSpaceMembers as members,
  recreioFriendRequests as requests,
  recreioProfileRestrictions as restrictions,
  recreioMinorDailyUsage as usage,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import { type PerfilId, PerfilIdSchema } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { lerParticipacaoDoRecreioLocked } from "@/features/account/participacao-repository";
import { assertAllowed } from "@/lib/errors";
import { comPerfilPessoal } from "./autoridade-repository";
import { lerCadastroPessoalNaTransacao } from "./cadastro-repository";
import { criarArquivoPessoal, LIMITES_DA_COPIA_PESSOAL as limites } from "./captura-contrato";
import { copiarSegurancaPessoalNaTransacao } from "./captura-seguranca-repository";
import { JogoPessoalIdSchema } from "./contrato";
import { lerDadosPessoaisNaTransacao } from "./dados-repository";

/** Fotografia SQL única do cadastro, dados dos jogos e vínculos do perfil.
 * Não confere propriedade de mundo nem exporta bytes compartilhados/denúncias
 * alheias/contratos de outro adulto. Artefato e entrega são etapas separadas. */
export async function capturarDadosPessoaisDoPerfil(autor: AutorNativoRecente, perfilId: PerfilId) {
  const arquivo = criarArquivoPessoal();
  try {
    const captura = await comPerfilPessoal(
      autor,
      perfilId,
      null,
      async (tx, perfil, conferirPrazo) => {
        const participacao = await lerParticipacaoDoRecreioLocked(tx, autor.contaId);
        assertAllowed(
          perfil.rightsOperationId === null,
          "DIREITOS",
          "A retirada deste perfil está em andamento.",
        );
        const [responsavel] = await tx
          .select({ id: guardians.id })
          .from(guardians)
          .where(
            and(eq(guardians.profileId, perfil.id), eq(guardians.guardianUserId, autor.contaId)),
          );
        const cadastro = await lerCadastroPessoalNaTransacao(autor, tx, perfil, conferirPrazo);
        arquivo.adicionar("manifesto", {
          formato: "recreio-copia-pessoal-perfil-v1",
          perfilId: perfil.id,
          capturadaEm: cadastro.conferidoEm,
          secoes: [
            "cadastro",
            "dados_jogo",
            "participacao",
            "visita",
            "uso_diario",
            "sessao_jogo",
            "pedido_amizade",
            "amizade",
            "bloqueio_proprio",
            "convite_mundo",
            "restricao",
            "denuncia_propria",
            "recurso_restricao",
          ],
          conteudoCompartilhadoIncluido: false,
          financeiroIncluido: false,
          identidadeGlobalIncluida: false,
        });
        arquivo.adicionar("cadastro", cadastro);
        const encontrados = await tx.execute<{ jogo: string }>(sql`
        select jogo from (
          select ${keys.gameId} as jogo from ${keys} where ${keys.profileId}=${perfil.id}
          union select ${achievements.gameId} as jogo from ${achievements} where ${achievements.profileId}=${perfil.id}
        ) as fontes order by jogo collate "C" limit ${limites.jogos + 1}
      `);
        assertAllowed(
          encontrados.length <= limites.jogos,
          "LIMITE",
          "A cópia precisa ser preparada com o suporte.",
        );
        for (const f of encontrados) {
          const jogo = JogoPessoalIdSchema.parse(f.jogo);
          arquivo.adicionar(
            "dados_jogo",
            await lerDadosPessoaisNaTransacao(
              autor,
              tx,
              perfil,
              { perfilId: PerfilIdSchema.parse(perfil.id), jogo },
              conferirPrazo,
            ),
          );
        }
        async function paginas<T extends { cursor: string }>(
          tipo: string,
          buscar: (apos: string | null) => Promise<T[]>,
        ) {
          let apos: string | null = null;
          while (true) {
            const linhas = await buscar(apos);
            for (const { cursor, ...dados } of linhas) {
              assertAllowed(
                apos === null || cursor > apos,
                "INTEGRIDADE",
                "Não foi possível preparar a cópia.",
              );
              arquivo.adicionar(tipo, dados);
              apos = cursor;
            }
            await conferirPrazo();
            if (linhas.length < limites.pagina) return;
          }
        }
        await paginas("participacao", (apos) =>
          tx
            .select({
              cursor: members.id,
              mundoId: members.spaceId,
              papel: members.role,
              estado: members.state,
              participacao: members.participation,
              entradaEm: members.joinedAt,
              saidaEm: members.leftAt,
            })
            .from(members)
            .where(and(eq(members.profileId, perfil.id), apos ? gt(members.id, apos) : undefined))
            .orderBy(members.id)
            .limit(limites.pagina),
        );
        await paginas("visita", (apos) =>
          tx
            .select({
              cursor: visits.id,
              mundoId: visits.spaceId,
              estado: visits.state,
              aceitaEm: visits.acceptedAt,
              expiraEm: visits.expiresAt,
              encerradaEm: visits.endedAt,
              motivo: visits.endReason,
            })
            .from(visits)
            .where(
              and(eq(visits.visitorProfileId, perfil.id), apos ? gt(visits.id, apos) : undefined),
            )
            .orderBy(visits.id)
            .limit(limites.pagina),
        );
        await paginas("uso_diario", (apos) =>
          tx
            .select({
              cursor: usage.localDay,
              dia: usage.localDay,
              usoMilissegundos: usage.usedMilliseconds,
              salvamentoMilissegundos: usage.savingMilliseconds,
              atualizadoEm: usage.updatedAt,
            })
            .from(usage)
            .where(and(eq(usage.profileId, perfil.id), apos ? gt(usage.localDay, apos) : undefined))
            .orderBy(usage.localDay)
            .limit(limites.pagina),
        );
        // O SID e o aparelho são capacidades técnicas: só o cursor interno lê o
        // UUID para paginar; ele não é incorporado ao arquivo entregue.
        await paginas("sessao_jogo", (apos) =>
          tx
            .select({
              cursor: games.id,
              jogo: games.gameId,
              mundoId: games.spaceId,
              iniciadaEm: games.startedAt,
              encerradaEm: games.endedAt,
              motivo: games.endReason,
            })
            .from(games)
            .where(and(eq(games.profileId, perfil.id), apos ? gt(games.id, apos) : undefined))
            .orderBy(games.id)
            .limit(limites.pagina),
        );
        await paginas("pedido_amizade", (apos) =>
          tx
            .select({
              cursor: requests.id,
              origemPerfilId: requests.originProfileId,
              destinoPerfilId: requests.targetProfileId,
              estado: requests.state,
              criadaEm: requests.createdAt,
              expiraEm: requests.expiresAt,
              aceitaEm: requests.targetAcceptedAt,
              encerradaEm: requests.finishedAt,
            })
            .from(requests)
            .where(
              and(
                or(
                  eq(requests.originProfileId, perfil.id),
                  eq(requests.targetProfileId, perfil.id),
                ),
                apos ? gt(requests.id, apos) : undefined,
              ),
            )
            .orderBy(requests.id)
            .limit(limites.pagina),
        );
        await paginas("bloqueio_proprio", (apos) =>
          tx
            .select({
              cursor: blocks.targetProfileId,
              destinoPerfilId: blocks.targetProfileId,
              bloqueado: blocks.blocked,
              silenciado: blocks.muted,
              criadoEm: blocks.createdAt,
              atualizadoEm: blocks.updatedAt,
            })
            .from(blocks)
            .where(
              and(
                eq(blocks.actorProfileId, perfil.id),
                apos ? gt(blocks.targetProfileId, apos) : undefined,
              ),
            )
            .orderBy(blocks.targetProfileId)
            .limit(limites.pagina),
        );
        await paginas("convite_mundo", (apos) =>
          tx
            .select({
              cursor: directed.id,
              mundoId: directed.spaceId,
              origemPerfilId: directed.originProfileId,
              destinoPerfilId: directed.targetProfileId,
              estado: directed.state,
              criadoEm: directed.createdAt,
              expiraEm: directed.expiresAt,
              encerradoEm: directed.finishedAt,
            })
            .from(directed)
            .where(
              and(
                or(
                  eq(directed.originProfileId, perfil.id),
                  eq(directed.targetProfileId, perfil.id),
                ),
                apos ? gt(directed.id, apos) : undefined,
              ),
            )
            .orderBy(directed.id)
            .limit(limites.pagina),
        );
        const outro = sql<string>`case when ${friendships.lowerProfileId}=${perfil.id}::uuid then ${friendships.higherProfileId} else ${friendships.lowerProfileId} end`;
        await paginas("amizade", (apos) =>
          tx
            .select({
              cursor: outro,
              outroPerfilId: outro,
              estado: friendships.state,
              criadaEm: friendships.createdAt,
              atualizadaEm: friendships.updatedAt,
              removidaEm: friendships.removedAt,
            })
            .from(friendships)
            .where(
              and(
                or(
                  eq(friendships.lowerProfileId, perfil.id),
                  eq(friendships.higherProfileId, perfil.id),
                ),
                apos ? sql`${outro}>${apos}::uuid` : undefined,
              ),
            )
            .orderBy(outro)
            .limit(limites.pagina),
        );
        const [restricao] = await tx
          .select({
            estado: restrictions.state,
            motivo: restrictions.reason,
            criadaEm: restrictions.createdAt,
            atualizadaEm: restrictions.updatedAt,
            encerradaEm: restrictions.releasedAt,
          })
          .from(restrictions)
          .where(eq(restrictions.profileId, perfil.id));
        if (restricao) arquivo.adicionar("restricao", restricao);
        await copiarSegurancaPessoalNaTransacao(
          tx,
          { contaId: autor.contaId, perfilId: perfil.id },
          arquivo,
          conferirPrazo,
        );
        await logAuditEventStrict(
          "recreio.profile_personal_capture_prepared",
          autor.contaId,
          { app: "recreio", profileId: perfil.id, gameCount: encontrados.length },
          { writer: tx },
        );
        await conferirPrazo();
        return {
          perfilId: PerfilIdSchema.parse(perfil.id),
          escopo: "profile" as const,
          tipo: perfil.kind,
          versaoDaPolitica: perfil.policyVersion,
          responsabilidadeId: responsavel?.id ?? null,
          revisaoDaParticipacao: participacao.revisao,
          capturadaEm: cadastro.conferidoEm,
        };
      },
      true,
    );
    return { ...captura, bytes: arquivo.concluir() };
  } finally {
    arquivo.encerrar();
  }
}
