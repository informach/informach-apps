import "server-only";
import { sql } from "@informach/db";
import type { Transacao } from "@/lib/repository";

/** Somente sob lock do perfil minimizado. Um domínio por passagem, até 100
 * pais/linhas; dependentes de convites/pedidos são limitados pelo contrato
 * (aprovações dos dois participantes), não por conteúdo ou fotos. */
export async function expurgarLoteDeReferencias(tx: Transacao, id: string) {
  const [vivos] = await tx.execute<{ pendente: boolean }>(sql`
    select exists(select 1 from recreio.world_visits v join recreio.space_visit_invites c on c.id=v.invite_id
      where (c.origin_profile_id=${id}::uuid or c.target_profile_id=${id}::uuid) and v.ended_at is null) or
      exists(select 1 from recreio.world_visit_sessions s join recreio.world_visits v on v.id=s.visit_id
        join recreio.space_visit_invites c on c.id=v.invite_id join recreio.game_sessions g on g.id=s.session_id
        where (c.origin_profile_id=${id}::uuid or c.target_profile_id=${id}::uuid) and
          (s.state<>'closed' or g.ended_at is null)) as pendente
  `);
  if (vivos?.pendente) return { pendente: true as const, domain: "visitas", count: 0 };
  // Literais fixos de schema, parâmetros tipados. Nunca SQL vindo do pedido.
  const etapas = [
    {
      domain: "convites_dirigidos",
      consulta: sql`with lote as (
      select id from recreio.directed_space_invites where (origin_profile_id=${id}::uuid or target_profile_id=${id}::uuid)
        and retain_until<=clock_timestamp() and state<>'pending' order by id limit 100 for update
    ) delete from recreio.directed_space_invites c using lote l where c.id=l.id returning 1 as removido`,
    },
    {
      domain: "sessoes_visitantes",
      consulta: sql`with lote as (
      select s.id from recreio.world_visit_sessions s join recreio.world_visits v on v.id=s.visit_id
        join recreio.space_visit_invites c on c.id=v.invite_id
      where (c.origin_profile_id=${id}::uuid or c.target_profile_id=${id}::uuid) and c.retain_until<=clock_timestamp()
        and s.state='closed' and v.ended_at is not null order by s.id limit 100 for update of s
    ) delete from recreio.world_visit_sessions s using lote l where s.id=l.id returning 1 as removido`,
    },
    {
      domain: "visitas",
      consulta: sql`with lote as (
      select v.id from recreio.world_visits v join recreio.space_visit_invites c on c.id=v.invite_id
      where (c.origin_profile_id=${id}::uuid or c.target_profile_id=${id}::uuid) and c.retain_until<=clock_timestamp()
        and v.ended_at is not null and not exists(select 1 from recreio.world_visit_sessions s where s.visit_id=v.id)
      order by v.id limit 100 for update of v
    ) delete from recreio.world_visits v using lote l where v.id=l.id returning 1 as removido`,
    },
    {
      domain: "convites_visita",
      consulta: sql`with lote as (
      select c.id from recreio.space_visit_invites c where (c.origin_profile_id=${id}::uuid or c.target_profile_id=${id}::uuid)
        and c.retain_until<=clock_timestamp() and c.state<>'pending' and not exists(select 1 from recreio.world_visits v where v.invite_id=c.id)
      order by c.id limit 100 for update
    ) delete from recreio.space_visit_invites c using lote l where c.id=l.id returning 1 as removido`,
    },
    {
      domain: "presencas",
      consulta: sql`with lote as (
      select p.id from recreio.world_host_presences p where p.host_profile_id=${id}::uuid
        and p.closed_at is not null and p.retain_until<=clock_timestamp()
        and not exists(select 1 from recreio.space_visit_invites c where c.host_presence_id=p.id)
      order by p.id limit 100 for update
    ) delete from recreio.world_host_presences p using lote l where p.id=l.id returning 1 as removido`,
    },
    ...etapasSociais(id),
    {
      domain: "ingressos",
      consulta: sql`with lote as (
      select jti from recreio.game_tickets where profile_id=${id}::uuid order by jti limit 100 for update
    ) delete from recreio.game_tickets t using lote l where t.jti=l.jti returning 1 as removido`,
    },
    {
      domain: "sessoes_jogo",
      consulta: sql`with lote as (
      select g.id from recreio.game_sessions g where g.profile_id=${id}::uuid and g.ended_at is not null and g.expires_at<=clock_timestamp()
        and not exists(select 1 from recreio.world_host_presences p where p.host_session_id=g.id)
        and not exists(select 1 from recreio.world_visit_sessions v where v.session_id=g.id)
      order by g.id limit 100 for update
    ) delete from recreio.game_sessions g using lote l where g.id=l.id returning 1 as removido`,
    },
  ];
  for (const etapa of etapas) {
    const removidos = await tx.execute(etapa.consulta);
    if (removidos.length > 0)
      return { pendente: false as const, domain: etapa.domain, count: removidos.length };
  }
  return { pendente: false as const, domain: "nenhum", count: 0 };
}

/** References with no live-save/visit retention dependency. The caller holds
 * the frozen profile and parent operation locks, after signed scope checks. */
function etapasSociais(id: string) {
  return [
    // Relação antes do pedido, e pedido antes do código, por suas FKs RESTRICT.
    {
      domain: "amizades",
      consulta: sql`with lote as (
      select lower_profile_id,higher_profile_id from recreio.friendships
        where lower_profile_id=${id}::uuid or higher_profile_id=${id}::uuid order by lower_profile_id,higher_profile_id limit 100 for update
    ) delete from recreio.friendships a using lote l where a.lower_profile_id=l.lower_profile_id and a.higher_profile_id=l.higher_profile_id returning 1 as removido`,
    },
    {
      domain: "pedidos_amizade",
      consulta: sql`with lote as (
      select id from recreio.friend_requests where origin_profile_id=${id}::uuid or target_profile_id=${id}::uuid order by id limit 100 for update
    ) delete from recreio.friend_requests c using lote l where c.id=l.id returning 1 as removido`,
    },
    {
      domain: "codigos_amizade",
      consulta: sql`with lote as (
      select id from recreio.friend_codes where profile_id=${id}::uuid order by id limit 100 for update
    ) delete from recreio.friend_codes c using lote l where c.id=l.id returning 1 as removido`,
    },
    {
      domain: "protecao_social",
      consulta: sql`with lote as (
      select actor_profile_id,target_profile_id from recreio.social_blocks
        where actor_profile_id=${id}::uuid or target_profile_id=${id}::uuid order by actor_profile_id,target_profile_id limit 100 for update
    ) delete from recreio.social_blocks b using lote l where b.actor_profile_id=l.actor_profile_id and b.target_profile_id=l.target_profile_id returning 1 as removido`,
    },
    {
      domain: "preferencias_sociais",
      consulta: sql`delete from recreio.social_preferences where profile_id=${id}::uuid returning 1 as removido`,
    },
  ];
}

export async function expurgarLoteDeReferenciasSociais(tx: Transacao, id: string) {
  for (const etapa of etapasSociais(id)) {
    const removidos = await tx.execute(etapa.consulta);
    if (removidos.length > 0) return { domain: etapa.domain, count: removidos.length };
  }
  return { domain: "nenhum", count: 0 };
}
