import "server-only";
import { sql } from "@informach/db";
import type { Transacao } from "@/lib/repository";

/** Caller holds native identity UPDATE, original operation UPDATE and its
 * verified financial/participation fence. One domain, <=100 rows, no BLOBs
 * loaded. All source identifiers are server owned; no arbitrary table/SQL. */
export async function retirarLoteDaContaEncerrada(
  tx: Transacao,
  conta: { id: string; email: string },
) {
  const id = conta.id,
    email = conta.email.trim().toLowerCase();
  const etapas = [
    {
      domain: "pin_conta",
      consulta: sql`delete from recreio.native_pins where user_id=${id} returning 1`,
    },
    {
      domain: "intencoes_cadastro",
      consulta: sql`with lote as (
      select id from recreio.profile_creation_requests where user_id=${id} order by id limit 100 for update
    ) delete from recreio.profile_creation_requests p using lote l where p.id=l.id returning 1`,
    },
    {
      domain: "avisos_sociais",
      consulta: sql`with lote as (
      select id from recreio.social_notices where guardian_user_id=${id} order by id limit 100 for update
    ) delete from recreio.social_notices p using lote l where p.id=l.id returning 1`,
    },
    {
      domain: "declaracoes_sem_responsabilidade",
      consulta: sql`with lote as (
      select d.id from recreio.adult_declarations d where d.user_id=${id}
        and not exists(select 1 from recreio.guardian_links g where g.declaration_id=d.id)
      order by d.id limit 100 for update
    ) delete from recreio.adult_declarations p using lote l where p.id=l.id returning 1`,
    },
    {
      domain: "previas_sem_consentimento",
      consulta: sql`with lote as (
      select p.id from recreio.rights_preparations p where p.requester_user_id=${id}
        and not exists(select 1 from recreio.rights_operations o where o.preparation_id=p.id)
      order by p.id limit 100 for update
    ) delete from recreio.rights_preparations p using lote l where p.id=l.id returning 1`,
    },
    {
      domain: "convites_pendentes",
      consulta: sql`with lote as (
      select id from recreio.group_invites where state='pending'
        and (inviter_user_id=${id} or recipient_user_id=${id} or recipient_email=${email})
      order by id limit 100 for update
    ) update recreio.group_invites p set state='revoked',recipient_email=null,sender_label=null,
        recipient_user_id=null,finished_at=clock_timestamp()
      from lote l where p.id=l.id and p.state='pending' returning 1`,
    },
    {
      domain: "copias_temporarias",
      consulta: sql`with lote as (
      select id from recreio.personal_exports where requester_user_id=${id} order by id limit 100 for update
    ) delete from recreio.personal_exports p using lote l where p.id=l.id returning 1`,
    },
  ];
  for (const etapa of etapas) {
    const removidas = await tx.execute(etapa.consulta);
    if (removidas.length > 0) return { domain: etapa.domain, count: removidas.length };
  }
  return { domain: "nenhum", count: 0 };
}
