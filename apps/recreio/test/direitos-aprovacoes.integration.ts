import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { sessions } from "@informach/db/schema";
import postgres from "postgres";
import { expect, it } from "vitest";
import { z } from "zod";
import { capturarDadosPessoaisDaConta } from "@/features/direitos/captura-conta-repository";
import { novoJogador } from "./apoio";
import { conexao } from "./backup-arquivos-apoio";
import { semearCapacidadesDaCaptura } from "./backup-capacidades-apoio";
import { mundoDe } from "./jogo-apoio";
import { familiaSocial } from "./social-apoio";

type PlanoSQL = {
  "Node Type": string;
  "Index Name"?: string;
  "Index Cond"?: string;
  Plans?: PlanoSQL[];
};
const PlanoSQLSchema: z.ZodType<PlanoSQL> = z.object({
  "Node Type": z.string(),
  "Index Name": z.string().optional(),
  "Index Cond": z.string().optional(),
  Plans: z.lazy(() => z.array(PlanoSQLSchema)).optional(),
});
function nosDoPlano(plano: PlanoSQL): PlanoSQL[] {
  return [plano, ...(plano.Plans ?? []).flatMap(nosDoPlano)];
}

it("exporta seis origens de aprovações próprias, mais de uma página, sem herdar os atos das outras contas", async () => {
  const fonte = postgres(conexao().href, { max: 1, prepare: false });
  try {
    const host = await novoJogador(),
      mundo = await mundoDe(host);
    const { familia, conviteId } = await semearCapacidadesDaCaptura(fonte, host, mundo);
    const outra = await familiaSocial();
    // These are explicit historical record fixtures, not proof of native
    // approval/transfer UX. FK/CHECKs remain active and all six sources are read.
    await fonte.begin(async (tx) => {
      await tx`insert into recreio.friend_requests
        (origin_profile_id,target_profile_id,client_key,request_hash,state,created_at,expires_at,finished_at)
        select ${familia.perfil.id},${host.perfil.id},gen_random_uuid(),${"a".repeat(64)},'rejected',
          statement_timestamp()-interval '1 second',statement_timestamp()+interval '1 hour',statement_timestamp()
        from generate_series(1,205)`;
      await tx`insert into recreio.friend_consents
        (request_id,request_origin_profile_id,request_target_profile_id,profile_id,guardian_link_id,approved_by_user_id,access_generation)
        select r.id,r.origin_profile_id,r.target_profile_id,r.origin_profile_id,g.id,g.guardian_user_id,p.access_generation
        from recreio.friend_requests r join recreio.guardian_links g on g.profile_id=r.origin_profile_id
        join recreio.minor_protection p on p.profile_id=g.profile_id
        where r.origin_profile_id=${familia.perfil.id}`;
      await tx`insert into recreio.friend_requests
        (origin_profile_id,target_profile_id,client_key,request_hash,state,created_at,expires_at,finished_at)
        select ${outra.perfil.id},${host.perfil.id},gen_random_uuid(),${"f".repeat(64)},'rejected',
          statement_timestamp()-interval '1 second',statement_timestamp()+interval '1 hour',statement_timestamp()
        from generate_series(1,8000)`;
      await tx`insert into recreio.friend_consents
        (request_id,request_origin_profile_id,request_target_profile_id,profile_id,guardian_link_id,approved_by_user_id,access_generation)
        select r.id,r.origin_profile_id,r.target_profile_id,r.origin_profile_id,g.id,g.guardian_user_id,p.access_generation
        from recreio.friend_requests r join recreio.guardian_links g on g.profile_id=r.origin_profile_id
        join recreio.minor_protection p on p.profile_id=g.profile_id where r.origin_profile_id=${outra.perfil.id}`;
      const dirigido = randomUUID(),
        sucessao = randomUUID();
      await tx`insert into recreio.directed_space_invites
        (id,space_id,invited_by_member_id,origin_profile_id,target_profile_id,client_key,request_hash,management_revision,friendship_revision,origin_policy_version,target_policy_version,created_at,expires_at,retain_until)
        select ${dirigido},m.space_id,m.id,m.profile_id,c.id,${randomUUID()},${"b".repeat(64)},s.management_revision,1,p.policy_version,c.policy_version,
          statement_timestamp(),statement_timestamp()+interval '1 hour',statement_timestamp()+interval '30 days'
        from recreio.space_members m join recreio.spaces s on s.id=m.space_id join recreio.profiles p on p.id=m.profile_id
        join recreio.profiles c on c.id=${familia.perfil.id} where m.space_id=${mundo} and m.profile_id=${host.perfil.id}`;
      await tx`insert into recreio.directed_invite_guardian_approvals
        (invite_id,origin_profile_id,target_profile_id,profile_id,guardian_link_id,approved_by_user_id,access_generation,policy_version)
        select c.id,c.origin_profile_id,c.target_profile_id,g.profile_id,g.id,g.guardian_user_id,p.access_generation,a.policy_version
        from recreio.directed_space_invites c join recreio.guardian_links g on g.profile_id=c.target_profile_id
        join recreio.minor_protection p on p.profile_id=g.profile_id join recreio.profiles a on a.id=g.profile_id where c.id=${dirigido}`;
      await tx`insert into recreio.directed_invite_world_approvals (invite_id,space_id,approved_by_member_id,approved_by_user_id,actor_kind,management_revision)
        select id,space_id,invited_by_member_id,${host.conta.id},'jogador',management_revision
        from recreio.directed_space_invites where id=${dirigido}`;
      await tx`insert into recreio.visit_invite_guardian_approvals
        (invite_id,origin_profile_id,target_profile_id,profile_id,guardian_link_id,approved_by_user_id,access_generation,policy_version)
        select c.id,c.origin_profile_id,c.target_profile_id,g.profile_id,g.id,g.guardian_user_id,p.access_generation,a.policy_version
        from recreio.space_visit_invites c join recreio.guardian_links g on g.profile_id=c.target_profile_id
        join recreio.minor_protection p on p.profile_id=g.profile_id join recreio.profiles a on a.id=g.profile_id where c.id=${conviteId}`;
      await tx`insert into recreio.visit_invite_world_approvals (invite_id,space_id,approved_by_member_id,approved_by_user_id,actor_kind,management_revision)
        select id,space_id,host_member_id,${host.conta.id},'jogador',management_revision
        from recreio.space_visit_invites where id=${conviteId}`;
      const [membro] = await tx<
        { id: string }[]
      >`insert into recreio.space_members (space_id,profile_id,role,state)
        values (${mundo},${familia.perfil.id},'member','active') returning id`;
      if (!membro) throw new Error("Member fixture absent");
      await tx`insert into recreio.space_stewardship_requests
        (id,space_id,from_member_id,to_member_id,state,expires_at,completed_at)
        select ${sucessao},space_id,${membro.id},id,'accepted',statement_timestamp()+interval '1 hour',statement_timestamp()
        from recreio.space_members where space_id=${mundo} and profile_id=${host.perfil.id}`;
      await tx`insert into recreio.stewardship_guardian_approvals
        (request_id,profile_id,guardian_link_id,approved_by_user_id,access_generation,policy_version,management_revision)
        select ${sucessao},g.profile_id,g.id,g.guardian_user_id,p.access_generation,a.policy_version,1
        from recreio.guardian_links g join recreio.minor_protection p on p.profile_id=g.profile_id
        join recreio.profiles a on a.id=g.profile_id where g.profile_id=${familia.perfil.id}`;
    });
    // Real optimizer/statistics, without disabling sequential scans or changing
    // planner costs. Foreign rows must not make each own page scan the table.
    await fonte`analyze recreio.friend_consents`;
    const referencias = await fonte<{ request_id: string; profile_id: string }[]>`
      select request_id,profile_id from recreio.friend_consents
      where approved_by_user_id=${familia.conta.id} order by request_id,profile_id limit 205`;
    expect(referencias).toHaveLength(205);
    const corte = referencias.at(-11);
    if (!corte) throw new Error("Cursor fixture absent");
    const [explicacao] = await fonte<
      { "QUERY PLAN": unknown }[]
    >`explain (format json,analyze true,buffers true)
      select request_id,profile_id,created_at from recreio.friend_consents
      where approved_by_user_id=${familia.conta.id}
        and (request_id,profile_id)>(${corte.request_id}::uuid,${corte.profile_id}::uuid)
      order by request_id,profile_id limit 100`;
    const [plano] = z.array(z.object({ Plan: PlanoSQLSchema })).parse(explicacao?.["QUERY PLAN"]);
    if (!plano) throw new Error("Query plan absent");
    const nos = nosDoPlano(plano.Plan);
    const indice = nos.find((n) => n["Index Name"] === "recreio_friend_consent_actor_history");
    expect(indice?.["Index Cond"]).toContain("request_id");
    expect(indice?.["Index Cond"]).toContain("profile_id");
    expect(nos.some((n) => n["Node Type"] === "Seq Scan")).toBe(false);
    // The host's recent account authority is reconstructed from its real login.
    const [login] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, host.login.authSessionId));
    if (!login) throw new Error("Native login absent");
    for (const [autor, quantidade, atos, ocultos] of [
      [
        familia.autor,
        208,
        ["aprovar_amizade", "aprovar_convite_mundo", "aprovar_visita", "propor_sucessao_do_menor"],
        [host.conta.id, host.conta.email, host.perfil.id],
      ],
      [
        {
          ...host.ator,
          login: { authSessionId: login.id, criadoEm: login.createdAt, expiraEm: login.expiresAt },
        },
        2,
        ["autorizar_convite_no_mundo", "autorizar_visita_no_mundo"],
        [familia.conta.id, familia.conta.email, familia.perfil.id],
      ],
    ] as const) {
      const captura = await capturarDadosPessoaisDaConta(autor);
      try {
        const texto = captura.bytes.toString("utf8"),
          linhas = texto.split("\n").filter((l) => l.startsWith('{"tipo":"aprovacao_propria"'));
        expect(linhas).toHaveLength(quantidade);
        for (const ato of atos) expect(linhas.some((l) => l.includes(ato))).toBe(true);
        for (const privado of [
          ...ocultos,
          outra.conta.id,
          outra.conta.email,
          outra.perfil.id,
          "accessGeneration",
          "guardianLinkId",
          "approvedByUserId",
          "requestHash",
          "a".repeat(64),
          "f".repeat(64),
        ])
          expect(texto).not.toContain(privado);
      } finally {
        captura.bytes.fill(0);
      }
    }
  } finally {
    await fonte.end({ timeout: 5 });
  }
});
