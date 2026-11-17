import "server-only";
import { and, eq, gt, or, sql } from "@informach/db";
import {
  recreioSocialBlocks as blocks,
  recreioFriendConsents as consents,
  recreioFriendships as friends,
  recreioSocialPreferences as preferences,
  recreioProfiles as profiles,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import {
  type AprovacaoSocial,
  amizadeDisponivel,
  aprovacaoSocialAtual,
  ContaIdSchema,
  contatoDisponivel,
  type PerfilId,
  PerfilIdSchema,
  presencaSocialVisivel,
} from "@informach/recreio";
import type { ContatoSocial, ListaSocial } from "@informach/recreio/contrato";
import { assertAllowed } from "@/lib/errors";
import { parSocial } from "./amizade-repository";
import { type AutorSocial, comJogadorSocial } from "./autoridade-repository";
import { presencaDePartidaAtual } from "./presenca-repository";

export async function consultarContatoNoBanco(
  autor: AutorSocial,
  perfilId: PerfilId,
): Promise<ContatoSocial | null> {
  assertAllowed(autor.perfilId !== perfilId, "CONTATO", "Contato não disponível.");
  return comJogadorSocial(autor, perfilId, async (tx, atual): Promise<ContatoSocial | null> => {
    const destino = atual.destino;
    assertAllowed(destino, "CONTATO", "Contato não disponível.");
    const [menor, maior] = parSocial(autor.perfilId, perfilId);
    const [amizade] = await tx
      .select()
      .from(friends)
      .where(and(eq(friends.lowerProfileId, menor), eq(friends.higherProfileId, maior)));
    const agora = await atual.conferirPrazo();
    const [pendente] = await tx
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.state, "pending"),
          gt(requests.expiresAt, agora),
          or(
            and(eq(requests.originProfileId, menor), eq(requests.targetProfileId, maior)),
            and(eq(requests.originProfileId, maior), eq(requests.targetProfileId, menor)),
          ),
        ),
      )
      .limit(1);
    const protecoes = await tx
      .select()
      .from(blocks)
      .where(
        or(
          and(eq(blocks.actorProfileId, menor), eq(blocks.targetProfileId, maior)),
          and(eq(blocks.actorProfileId, maior), eq(blocks.targetProfileId, menor)),
        ),
      );
    const propria = protecoes.find((p) => p.actorProfileId === autor.perfilId);
    if (amizade?.state !== "active" && !pendente && !propria) return null;
    const pedidoId = pendente?.id ?? amizade?.requestId;
    const aprovacoes = pedidoId
      ? await tx.select().from(consents).where(eq(consents.requestId, pedidoId))
      : [];
    const aprovacao = (id: PerfilId): AprovacaoSocial | null => {
      const linha = aprovacoes.find((p) => p.profileId === id);
      return linha?.approvedByUserId
        ? {
            perfilId: id,
            contaId: ContaIdSchema.parse(linha.approvedByUserId),
            vinculoId: linha.guardianLinkId,
            geracao: linha.accessGeneration,
          }
        : null;
    };
    const relacao = {
      amizadeAceita: amizade?.state === "active",
      bloqueadoPorUmaDasPartes: protecoes.some((p) => p.blocked),
      aprovacaoDaOrigem: aprovacao(atual.origem.id),
      aprovacaoDoDestino: aprovacao(destino.id),
    };
    const aprovada =
      aprovacaoSocialAtual(atual.origem, relacao.aprovacaoDaOrigem) &&
      aprovacaoSocialAtual(destino, relacao.aprovacaoDoDestino);
    const visivel =
      contatoDisponivel(atual.origem) &&
      contatoDisponivel(destino) &&
      aprovada &&
      !protecoes.some((p) => p.actorProfileId === perfilId && p.blocked);
    const [perfil] = await tx
      .select({ apelido: profiles.nickname, avatar: profiles.avatar })
      .from(profiles)
      .where(eq(profiles.id, perfilId));
    const [preferencia] = await tx
      .select()
      .from(preferences)
      .where(eq(preferences.profileId, perfilId));
    const podeVerPresenca = presencaSocialVisivel({
      observador: atual.origem,
      observado: destino,
      relacao,
      preferenciaDoAdulto: preferencia?.presenceMode ?? "friends",
      membrosDoMesmoMundo: false,
    });
    const online =
      podeVerPresenca && (await presencaDePartidaAtual(tx, perfilId, await atual.conferirPrazo()));
    return {
      perfilId,
      apelido: visivel ? (perfil?.apelido ?? null) : null,
      avatar: visivel ? (perfil?.avatar ?? null) : null,
      amizade: amizadeDisponivel(atual.origem, destino, relacao),
      online,
      bloqueado: propria?.blocked ?? false,
      silenciado: propria?.muted ?? false,
      pedido: pendente
        ? {
            id: pendente.id,
            direcao: pendente.originProfileId === autor.perfilId ? "enviado" : "recebido",
            aceito: pendente.targetAcceptedAt !== null,
            expiraEm: pendente.expiresAt.toISOString(),
            aguardaAprovacao: !aprovada,
          }
        : null,
    };
  });
}

/** Dez relações por página: autorização por par e travas curtas, sem busca pública. */
export async function listarSocialNoBanco(
  autor: AutorSocial,
  apos: PerfilId | null,
): Promise<ListaSocial> {
  const pagina = await comJogadorSocial(autor, null, async (tx): Promise<PerfilId[]> => {
    const ids = await tx.execute<{ perfil_id: string }>(sql`
      select perfil_id from (
        select case when lower_profile_id=${autor.perfilId} then higher_profile_id else lower_profile_id end as perfil_id
          from recreio.friendships where state='active' and (lower_profile_id=${autor.perfilId} or higher_profile_id=${autor.perfilId})
        union select target_profile_id from recreio.social_blocks where actor_profile_id=${autor.perfilId}
        union select case when origin_profile_id=${autor.perfilId} then target_profile_id else origin_profile_id end
          from recreio.friend_requests where state='pending' and expires_at>statement_timestamp()
            and (origin_profile_id=${autor.perfilId} or target_profile_id=${autor.perfilId})
      ) relacoes where (${apos}::uuid is null or perfil_id>${apos}::uuid) order by perfil_id limit 11
    `);
    return ids.map((p) => PerfilIdSchema.parse(p.perfil_id));
  });
  const contatos: ContatoSocial[] = [];
  for (const id of pagina.slice(0, 10)) {
    const contato = await consultarContatoNoBanco(autor, id);
    if (contato) contatos.push(contato);
  }
  const final = await comJogadorSocial(
    autor,
    null,
    async (
      tx,
      atual,
    ): Promise<{ presenca: ListaSocial["presenca"]; contatosDisponiveis: boolean }> => {
      const [preferencia] = await tx
        .select()
        .from(preferences)
        .where(eq(preferences.profileId, autor.perfilId));
      return {
        presenca:
          atual.origem.tipo === "protegido"
            ? atual.origem.politica.presenca
            : (preferencia?.presenceMode ?? "friends"),
        contatosDisponiveis: contatoDisponivel(atual.origem),
      };
    },
  );
  return {
    contatos: final.contatosDisponiveis
      ? contatos
      : contatos.map((c) => ({ ...c, apelido: null, avatar: null, amizade: false, online: false })),
    presenca: final.presenca,
    proximo: pagina.length > 10 ? (pagina[9] ?? null) : null,
  };
}
