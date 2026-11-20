import { randomBytes, randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { Jogador } from "./apoio";
import { conexao } from "./backup-arquivos-apoio";
import type { semearCapacidadesDaCaptura } from "./backup-capacidades-apoio";

/** Synthetic invitation records with real FK/CHECKs in the disposable source.
 * These preconditions prove offline revocation, not native approval UX. */
export async function semearConvitesDaCaptura(
  fonte: postgres.Sql,
  jogador: Jogador,
  mundoId: string,
  capacidades: Awaited<ReturnType<typeof semearCapacidadesDaCaptura>>,
) {
  conexao();
  const { familia, conviteId } = capacidades;
  await fonte.begin(async (tx) => {
    const [membro] = await tx<{ id: string }[]>`insert into recreio.space_members
      (space_id,profile_id,role,state) values (${mundoId},${familia.perfil.id},'member','active') returning id`;
    if (!membro) throw new Error("Invitation member fixture absent");
    for (const aberta of [true, false]) {
      await tx`insert into recreio.friend_codes (profile_id,code_hash,created_at,expires_at,revoked_at)
        values (${jogador.perfil.id},${randomBytes(32).toString("hex")},statement_timestamp(),
          statement_timestamp()+interval '10 minutes',case when ${aberta} then null else statement_timestamp() end)`;
      await tx`insert into recreio.friend_requests
        (origin_profile_id,target_profile_id,client_key,request_hash,state,created_at,expires_at,finished_at)
        values (${jogador.perfil.id},${familia.perfil.id},${randomUUID()},${randomBytes(32).toString("hex")},
          ${aberta ? "pending" : "revoked"},statement_timestamp()-interval '1 second',
          statement_timestamp()+interval '1 hour',case when ${aberta} then null else statement_timestamp() end)`;
      await tx`insert into recreio.group_invites
        (group_id,inviter_user_id,inviter_declaration_version,recipient_email,sender_label,state,
          created_at,expires_at,finished_at)
        select g.id,g.owner_user_id,'adulto-2026-11-18',
          ${aberta ? "synthetic-invitation@example.invalid" : null},${aberta ? "Sintetico" : null},
          ${aberta ? "pending" : "revoked"},statement_timestamp()-interval '1 second',
          statement_timestamp()+interval '1 hour',case when ${aberta} then null else statement_timestamp() end
        from recreio.groups g where g.owner_user_id=${jogador.conta.id}`;
      await tx`insert into recreio.space_invites
        (space_id,invited_by_member_id,form,code_hash,state,created_at,expires_at)
        select space_id,id,'member',${randomBytes(32).toString("hex")},${aberta ? "sent" : "revoked"},
          statement_timestamp(),statement_timestamp()+interval '1 hour'
        from recreio.space_members where space_id=${mundoId} and profile_id=${jogador.perfil.id}`;
      await tx`insert into recreio.directed_space_invites
        (space_id,invited_by_member_id,origin_profile_id,target_profile_id,client_key,request_hash,
          state,management_revision,friendship_revision,origin_policy_version,target_policy_version,
          created_at,expires_at,finished_at,retain_until)
        select m.space_id,m.id,m.profile_id,${familia.perfil.id},${randomUUID()},${randomBytes(32).toString("hex")},
          ${aberta ? "pending" : "revoked"},s.management_revision,1,p.policy_version,c.policy_version,
          statement_timestamp()-interval '1 second',statement_timestamp()+interval '1 hour',
          case when ${aberta} then null else statement_timestamp() end,statement_timestamp()-interval '1 second'+interval '30 days'
        from recreio.space_members m join recreio.spaces s on s.id=m.space_id
          join recreio.profiles p on p.id=m.profile_id join recreio.profiles c on c.id=${familia.perfil.id}
        where m.space_id=${mundoId} and m.profile_id=${jogador.perfil.id}`;
      await tx`insert into recreio.space_stewardship_requests
        (space_id,from_member_id,to_member_id,state,created_at,expires_at,completed_at)
        select space_id,id,${membro.id},${aberta ? "pending" : "revoked"},
          statement_timestamp()-interval '1 second',statement_timestamp()+interval '1 hour',case when ${aberta} then null else statement_timestamp() end
        from recreio.space_members where space_id=${mundoId} and profile_id=${jogador.perfil.id}`;
    }
    // Existing accepted invitation is the terminal history witness for visits.
    await tx`insert into recreio.space_visit_invites
      (space_id,host_presence_id,host_session_id,host_member_id,origin_profile_id,target_profile_id,
        client_key,request_hash,state,management_revision,friendship_revision,origin_policy_version,target_policy_version,
        created_at,expires_at,retain_until)
      select space_id,host_presence_id,host_session_id,host_member_id,origin_profile_id,target_profile_id,
        ${randomUUID()},${randomBytes(32).toString("hex")},'pending',management_revision,friendship_revision,
        origin_policy_version,target_policy_version,created_at,expires_at,retain_until
      from recreio.space_visit_invites where id=${conviteId}`;
  });
}
