import { randomBytes, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { prepararArquivoPessoal } from "@/features/direitos/exportacao-service";
import { criarCifradorDeObjetos } from "@/features/objetos/criptografia";
import type { Jogador } from "./apoio";
import { conexao } from "./backup-arquivos-apoio";
import { familiaSocial } from "./social-apoio";

/** Data fixture only: original source is the disposable GitHub database.
 * Native registration/pairing/export are real; SQL game records are declared
 * synthetic capabilities, not proof of a running game or a paid entitlement. */
export async function semearCapacidadesDaCaptura(
  fonte: postgres.Sql,
  jogador: Jogador,
  mundoId: string,
) {
  conexao();
  const familia = await familiaSocial(15),
    key = randomBytes(32);
  const cifrador = criarCifradorDeObjetos({
    chaveAtiva: "cold-export",
    chaves: new Map([["cold-export", key]]),
    limiteBytes: 32 * 1024 * 1024,
  });
  key.fill(0);
  try {
    await prepararArquivoPessoal(
      familia.autor,
      { copiaId: randomUUID(), escopo: "account" },
      cifrador,
    );
  } finally {
    cifrador.encerrar();
  }
  const sid = randomUUID(),
    visitanteSid = randomUUID(),
    ticket = randomUUID(),
    instance = randomUUID(),
    presenca = randomUUID(),
    convite = randomUUID(),
    visita = randomUUID();
  await fonte.begin(async (tx) => {
    await tx`insert into recreio.game_sessions (id,profile_id,device_session_id,game_id,space_id,expires_at,supports_visits)
      values (${sid},${jogador.perfil.id},${jogador.ator.sessaoDeAparelhoId},'morada',${mundoId},clock_timestamp()+interval '10 minutes',true),
      (${visitanteSid},${familia.perfil.id},${familia.referencia.sessaoDeAparelhoId},'morada',${mundoId},clock_timestamp()+interval '10 minutes',true)`;
    await tx`insert into recreio.game_sessions
      (profile_id,device_session_id,game_id,space_id,started_at,last_renewed_at,expires_at,ended_at,end_reason,ended_seq)
      values (${jogador.perfil.id},${jogador.ator.sessaoDeAparelhoId},'morada',${mundoId},
        '2020-01-01','2020-01-01','2020-01-02','2020-01-01 01:00:00+00','left',nextval('recreio.game_session_end_seq'))`;
    await tx`insert into recreio.game_tickets (jti,profile_id,device_session_id,game_id,expires_at)
      values (${ticket},${jogador.perfil.id},${jogador.ator.sessaoDeAparelhoId},'morada',clock_timestamp()+interval '1 minute')`;
    await tx`insert into recreio.session_handoffs (profile_id,from_session_id,to_device_session_id,ticket_jti,policy_version,mode,requested_at,expires_at)
      select id,${sid},${jogador.ator.sessaoDeAparelhoId},${ticket},policy_version,'profile',statement_timestamp(),statement_timestamp()+interval '1 minute'
      from recreio.profiles where id=${jogador.perfil.id}`;
    await tx`insert into recreio.session_save_permits (session_id,profile_id,policy_version,mode,cutoff_at,expires_at)
      select ${sid},id,policy_version,'profile',statement_timestamp()+interval '10 minutes',statement_timestamp()+interval '10 minutes 30 seconds'
      from recreio.profiles where id=${jogador.perfil.id}`;
    await tx`insert into recreio.game_instances (id,game_id,public_url,version,capacity)
      values (${instance},'morada','https://fixture.invalid','cold-fixture',1)`;
    await tx`insert into recreio.space_leases (space_id,fence,holder_kind,instance_id,state,expires_at)
      values (${mundoId},1,'server',${instance},'held',clock_timestamp()+interval '1 minute')`;
    await tx`insert into recreio.world_host_presences
      (id,space_id,host_profile_id,host_session_id,host_member_id,instance_id,fence,client_key,request_hash,created_at,updated_at,expires_at,valid_until,retain_until)
      select ${presenca},space_id,profile_id,${sid},id,${instance},1,${randomUUID()},${"a".repeat(64)},
        statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 seconds',
        statement_timestamp()+interval '1 hour',statement_timestamp()+interval '721 hours'
      from recreio.space_members where space_id=${mundoId} and profile_id=${jogador.perfil.id}`;
    await tx`insert into recreio.space_visit_invites
      (id,space_id,host_presence_id,host_session_id,host_member_id,origin_profile_id,target_profile_id,client_key,request_hash,
        management_revision,friendship_revision,origin_policy_version,target_policy_version,state,created_at,expires_at,finished_at,retain_until)
      select ${convite},m.space_id,${presenca},${sid},m.id,m.profile_id,${familia.perfil.id},${randomUUID()},${"b".repeat(64)},
        s.management_revision,1,p.policy_version,c.policy_version,'accepted',statement_timestamp(),
        statement_timestamp()+interval '1 hour',statement_timestamp(),statement_timestamp()+interval '720 hours'
      from recreio.space_members m join recreio.spaces s on s.id=m.space_id
        join recreio.profiles p on p.id=m.profile_id join recreio.profiles c on c.id=${familia.perfil.id}
      where m.space_id=${mundoId} and m.profile_id=${jogador.perfil.id}`;
    await tx`insert into recreio.world_visits (id,invite_id,space_id,visitor_profile_id,host_presence_id,accepted_at,updated_at,expires_at)
      values (${visita},${convite},${mundoId},${familia.perfil.id},${presenca},
        statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '1 hour')`;
    await tx`insert into recreio.world_visit_sessions
      (session_id,visit_id,space_id,profile_id,state,created_at,updated_at,admitted_at,permission_until)
      values (${visitanteSid},${visita},${mundoId},${familia.perfil.id},'active',
        statement_timestamp(),statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 seconds')`;
  });
  return { familia, conviteId: convite };
}
