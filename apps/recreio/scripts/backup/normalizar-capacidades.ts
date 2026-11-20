import type postgres from "postgres";
import { exigirBancoPrivadoDeRecuperacao, FalhaDaNormalizacao } from "./normalizar-fotografias";

const TABELAS = [
  "device_sessions",
  "paired_credentials",
  "pairing_requests",
  "game_tickets",
  "session_handoffs",
  "session_save_permits",
  "game_sessions",
  "game_instances",
  "space_leases",
  "world_host_presences",
  "world_visits",
  "world_visit_sessions",
  "personal_exports",
  "friend_codes",
  "friend_requests",
  "group_invites",
  "space_invites",
  "directed_space_invites",
  "space_visit_invites",
  "space_stewardship_requests",
] as const;

/** ONLY a new private/offline cluster, after the authenticated inventory was
 * compared. This removes transient capabilities, not current identity, F7
 * obligations or financial facts. It never admits restored traffic. The
 * original app/auth databases and their credentials are not inputs. */
export async function normalizarCapacidadesRestauradas(copia: postgres.Sql) {
  await exigirBancoPrivadoDeRecuperacao(copia);
  return copia.begin("isolation level repeatable read read write", async (tx) => {
    await tx.unsafe("set local search_path=pg_catalog");
    await tx.unsafe("set local statement_timeout='5000ms'");
    await tx.unsafe("set local lock_timeout='2000ms'");
    await tx.unsafe("set local transaction_timeout='120000ms'");
    // Literals from this module only; no user/configured table names or SQL.
    for (const tabela of TABELAS) {
      const [perfil] = await tx.unsafe<{ valido: boolean; linhas: number }[]>(
        `select exists(select 1 from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid=c.relnamespace
          where n.nspname='recreio' and c.relname=$1 and c.relkind='r' and not c.relrowsecurity) as valido,
          (select count(*)::int from recreio.${tabela}) as linhas`,
        [tabela],
      );
      if (!perfil?.valido || !Number.isSafeInteger(perfil.linhas) || perfil.linhas > 1_000_000)
        throw new FalhaDaNormalizacao("PERFIL_NAO_SUPORTADO");
    }
    await tx.unsafe(`update recreio.device_sessions set
      revoked_at=greatest(statement_timestamp(),created_at) where revoked_at is null`);
    await tx.unsafe(
      `update recreio.paired_credentials set token_hash=null where token_hash is not null`,
    );
    await tx.unsafe("delete from recreio.pairing_requests");
    await tx.unsafe("delete from recreio.session_save_permits");
    // Handoffs depend on tickets; their FK cascade removes the same ephemeral
    // capability, never profile data/conflict versions/checkpoint photographs.
    await tx.unsafe("delete from recreio.game_tickets");
    await tx.unsafe(`update recreio.game_sessions set
      ended_at=greatest(statement_timestamp(),started_at),end_reason='permissions_changed',
      ended_seq=nextval('recreio.game_session_end_seq') where ended_at is null`);
    await tx.unsafe(`update recreio.space_leases set state='released',
      released_at=greatest(statement_timestamp(),acquired_at),end_reason='error'
      where released_at is null`);
    await tx.unsafe("update recreio.game_instances set state='gone' where state<>'gone'");
    await tx.unsafe(`update recreio.world_host_presences set state='closed',
      closed_at=greatest(statement_timestamp(),updated_at),
      updated_at=greatest(statement_timestamp(),updated_at),close_reason='lease_lost'
      where closed_at is null`);
    await tx.unsafe(`update recreio.world_visits set state='revoked',
      ended_at=greatest(statement_timestamp(),updated_at),
      updated_at=greatest(statement_timestamp(),updated_at),end_reason='permissions_changed'
      where ended_at is null`);
    await tx.unsafe(`update recreio.world_visit_sessions set state='closed',
      closed_at=greatest(statement_timestamp(),updated_at),
      updated_at=greatest(statement_timestamp(),updated_at),close_reason='session_ended'
      where closed_at is null`);
    // Invalidate pending invitations without deleting receipts, changing
    // accepted relationships or extending any original expiry/retention date.
    await tx.unsafe(`update recreio.friend_codes set
      revoked_at=greatest(statement_timestamp(),created_at)
      where consumed_at is null and revoked_at is null`);
    await tx.unsafe(`update recreio.friend_requests set state='revoked',
      finished_at=greatest(statement_timestamp(),created_at) where state='pending'`);
    await tx.unsafe(`update recreio.group_invites set state='revoked',
      finished_at=greatest(statement_timestamp(),created_at),
      recipient_email=null,recipient_user_id=null,sender_label=null where state='pending'`);
    await tx.unsafe(`update recreio.space_invites set state='revoked'
      where state in ('pending_approval','sent')`);
    await tx.unsafe(`update recreio.directed_space_invites set state='revoked',
      finished_at=greatest(statement_timestamp(),created_at) where state='pending'`);
    await tx.unsafe(`update recreio.space_visit_invites set state='revoked',
      finished_at=greatest(statement_timestamp(),created_at) where state='pending'`);
    await tx.unsafe(`update recreio.space_stewardship_requests set state='revoked',
      completed_at=greatest(statement_timestamp(),created_at) where state='pending'`);
    const [convites] = await tx.unsafe<{ quantidade: number }[]>(`select (
      (select count(*) from recreio.friend_codes where consumed_at is null and revoked_at is null)+
      (select count(*) from recreio.friend_requests where state='pending')+
      (select count(*) from recreio.group_invites where state='pending')+
      (select count(*) from recreio.space_invites where state in ('pending_approval','sent'))+
      (select count(*) from recreio.directed_space_invites where state='pending')+
      (select count(*) from recreio.space_visit_invites where state='pending')+
      (select count(*) from recreio.space_stewardship_requests where state='pending')
    )::int as quantidade`);
    if (convites?.quantidade !== 0) throw new FalhaDaNormalizacao("INTEGRIDADE");
    await tx.unsafe(`update recreio.personal_exports set state='revoked',
      encrypted_bytes=null,reference=null,cleared_at=greatest(statement_timestamp(),created_at)
      where state='ready'`);
    const [restantes] = await tx.unsafe<{ quantidade: number }[]>(`select (
      (select count(*) from recreio.device_sessions where revoked_at is null)+
      (select count(*) from recreio.paired_credentials where token_hash is not null)+
      (select count(*) from recreio.pairing_requests)+
      (select count(*) from recreio.game_tickets)+
      (select count(*) from recreio.session_handoffs)+
      (select count(*) from recreio.session_save_permits)+
      (select count(*) from recreio.game_sessions where ended_at is null)+
      (select count(*) from recreio.space_leases where released_at is null or state<>'released')+
      (select count(*) from recreio.game_instances where state<>'gone')+
      (select count(*) from recreio.world_host_presences where closed_at is null)+
      (select count(*) from recreio.world_visits where ended_at is null)+
      (select count(*) from recreio.world_visit_sessions where closed_at is null)+
      (select count(*) from recreio.personal_exports where state='ready' or encrypted_bytes is not null or reference is not null)
    )::int as quantidade`);
    if (restantes?.quantidade !== 0) throw new FalhaDaNormalizacao("INTEGRIDADE");
    return {
      temporaryCapabilitiesRemaining: restantes.quantidade,
      temporaryCapabilitiesRevoked: true as const,
      invitationCapabilitiesRemaining: convites.quantidade,
      pendingInvitationsRevoked: true as const,
      authoritiesNormalizedForTraffic: false as const,
    };
  });
}
