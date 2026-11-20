import { z } from "zod";

export class RecusaDoClusterPrivado extends Error {
  constructor() {
    super("recreio.private_recovery_destination");
  }
}
const Destino = z.strictObject({
  banco: z.string().regex(/^recreio_restore_[a-f0-9]{24}$/),
  porta: z.literal("55432"),
  socket: z.string().regex(/^\/tmp\/recreio-backup-[A-Za-z0-9]+$/),
  rede: z.literal(""),
  versao: z.literal("180006"),
  local: z.literal(true),
});
/** Metadata must come from the actual destination SQL connection, not flags,
 * a requested URL, environment variables or a caller's boolean declaration. */
export function conferirDestinoPrivado(entrada: unknown) {
  const resultado = Destino.safeParse(entrada);
  if (!resultado.success) throw new RecusaDoClusterPrivado();
  return Object.freeze(resultado.data);
}

export const CONSULTA_DESTINO_PRIVADO = `
    select pg_catalog.current_database() as banco,pg_catalog.current_setting('port') as porta,
      pg_catalog.current_setting('unix_socket_directories') as socket,pg_catalog.current_setting('listen_addresses') as rede,
      pg_catalog.current_setting('server_version_num') as versao,pg_catalog.inet_server_addr() is null as local`;

export const CONSULTA_CONVITES_PENDENTES = `select (
      (select count(*) from recreio.friend_codes where consumed_at is null and revoked_at is null)+
      (select count(*) from recreio.friend_requests where state='pending')+
      (select count(*) from recreio.group_invites where state='pending')+
      (select count(*) from recreio.space_invites where state in ('pending_approval','sent'))+
      (select count(*) from recreio.directed_space_invites where state='pending')+
      (select count(*) from recreio.space_visit_invites where state='pending')+
      (select count(*) from recreio.space_stewardship_requests where state='pending')
    )::int as quantidade`;

export const CONSULTA_CAPACIDADES_TEMPORARIAS = `select (
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
    )::int as quantidade`;
