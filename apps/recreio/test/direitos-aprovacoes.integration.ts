import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { sessions } from "@informach/db/schema";
import postgres from "postgres";
import { expect, it } from "vitest";
import { z } from "zod";
import { capturarDadosPessoaisDaConta } from "@/features/direitos/captura-conta-repository";
import { capturarDadosPessoaisDoPerfil } from "@/features/direitos/captura-perfil-repository";
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
      for (const f of [familia, outra])
        await tx`insert into recreio.profile_creation_requests (user_id,expires_at)
          select ${f.conta.id},statement_timestamp()+interval '1 hour' from generate_series(1,105)`;
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
      for (const f of [familia, outra])
        await tx`insert into recreio.social_notices
        (guardian_user_id,profile_id,request_id,request_origin_profile_id,request_target_profile_id)
        select ${f.conta.id},r.origin_profile_id,r.id,r.origin_profile_id,r.target_profile_id
        from recreio.friend_requests r where r.origin_profile_id=${f.perfil.id} order by r.id limit 1`;
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
      const [alheio] = await tx<
        { id: string }[]
      >`insert into recreio.space_members (space_id,profile_id,role,state)
        values (${mundo},${outra.perfil.id},'member','active') returning id`;
      if (!alheio) throw new Error("Other member fixture absent");
      for (const emissor of [membro, alheio])
        await tx`insert into recreio.space_invites (space_id,invited_by_member_id,form,code_hash,state,expires_at)
          values (${mundo},${emissor.id},'member',${randomUUID().replaceAll("-", "")},'revoked',statement_timestamp()+interval '1 hour')`;
      await tx`insert into recreio.space_invites (space_id,invited_by_member_id,form,code_hash,state,expires_at)
        select ${mundo},${membro.id},'member',gen_random_uuid()::text,'revoked',statement_timestamp()+interval '1 hour'
        from generate_series(1,105)`;
      // Target and accepted branches must emit the same receipt once.
      await tx`insert into recreio.space_invites
        (space_id,invited_by_member_id,form,code_hash,state,target_profile_id,accepted_by_profile_id,accepted_at,expires_at)
        select ${mundo},${alheio.id},'member',gen_random_uuid()::text,'accepted',${familia.perfil.id},${familia.perfil.id},
          statement_timestamp(),statement_timestamp()+interval '1 hour' from generate_series(1,105)`;
      await tx`insert into recreio.space_invites
        (space_id,invited_by_member_id,form,code_hash,state,target_profile_id,expires_at)
        select ${mundo},${alheio.id},'member',gen_random_uuid()::text,'revoked',${host.perfil.id},
          statement_timestamp()+interval '1 hour' from generate_series(1,8000)`;
      await tx`insert into recreio.space_stewardship_requests
        (space_id,from_member_id,to_member_id,state,expires_at,completed_at)
        select ${mundo},${membro.id},m.id,'revoked',statement_timestamp()+interval '1 hour',statement_timestamp()
        from recreio.space_members m cross join generate_series(1,105)
        where m.space_id=${mundo} and m.profile_id=${host.perfil.id}`;
      await tx`insert into recreio.space_stewardship_requests
        (space_id,from_member_id,to_member_id,state,expires_at,completed_at)
        select ${mundo},m.id,${membro.id},'revoked',statement_timestamp()+interval '1 hour',statement_timestamp()
        from recreio.space_members m cross join generate_series(1,105)
        where m.space_id=${mundo} and m.profile_id=${host.perfil.id}`;
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
    await fonte`analyze recreio.space_invites`;
    const referenciasConvites = await fonte<{ id: string }[]>`select id from recreio.space_invites
      where target_profile_id=${familia.perfil.id} order by id limit 105`;
    const meio = referenciasConvites.at(90);
    if (!meio) throw new Error("Personal invitation cursor absent");
    const [explicacaoConvites] =
      await fonte`explain(analyze,format json) select id from recreio.space_invites
      where target_profile_id=${familia.perfil.id} and id>${meio.id}::uuid order by id limit 10`;
    const planosConvites = z
      .array(z.object({ Plan: PlanoSQLSchema }))
      .parse(explicacaoConvites?.["QUERY PLAN"]);
    const nosConvites = planosConvites.flatMap((p) => nosDoPlano(p.Plan));
    expect(
      nosConvites.some(
        (n) =>
          n["Index Name"] === "recreio_space_invite_target_history" &&
          n["Index Cond"]?.includes("id >"),
      ),
    ).toBe(true);
    expect(nosConvites.some((n) => n["Node Type"] === "Seq Scan")).toBe(false);
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
        expect(
          texto.split("\n").filter((l) => l.startsWith('{"tipo":"aparelho_pareado"')),
        ).toHaveLength(autor.contaId === familia.conta.id ? 1 : 0);
        expect(
          texto.split("\n").filter((l) => l.startsWith('{"tipo":"aviso_social"')),
        ).toHaveLength(autor.contaId === familia.conta.id ? 1 : 0);
        expect(
          texto.split("\n").filter((l) => l.startsWith('{"tipo":"grupo_proprio"')),
        ).toHaveLength(1);
        const criacoes = texto.split("\n").filter((l) => l.startsWith('{"tipo":"criacao_perfil"'));
        if (autor.contaId === familia.conta.id) expect(criacoes.length).toBeGreaterThanOrEqual(105);
        else expect(criacoes).toHaveLength(0);
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
          "tokenHash",
          "pollHash",
          "codeHash",
          "vinculoConfere",
          "fingerprint",
        ])
          expect(texto).not.toContain(privado);
      } finally {
        captura.bytes.fill(0);
      }
    }
    const perfil = await capturarDadosPessoaisDoPerfil(familia.autor, familia.perfil.id);
    try {
      const texto = perfil.bytes.toString("utf8");
      expect(
        texto.split("\n").filter((l) => l.startsWith('{"tipo":"convite_visita"')),
      ).toHaveLength(1);
      expect(texto).toContain(mundo);
      expect(
        texto.split("\n").filter((l) => l.startsWith('{"tipo":"convite_mundo_anterior"')),
      ).toHaveLength(211);
      expect(
        texto.split("\n").filter((l) => l.startsWith('{"tipo":"proposta_responsabilidade_mundo"')),
      ).toHaveLength(211);
      expect(texto).toContain('"coberturaHabilitada":true');
      for (const privado of [
        host.conta.id,
        host.conta.email,
        "hostPresenceId",
        "hostSessionId",
        "accessGeneration",
        "requestHash",
        "codeHash",
      ])
        expect(texto).not.toContain(privado);
    } finally {
      perfil.bytes.fill(0);
    }
    const [pareado] = await fonte<
      {
        device_session_id: string;
        token_hash: string | null;
        code_hash: string;
        poll_hash: string;
      }[]
    >`
      select c.device_session_id,c.token_hash,p.code_hash,p.poll_hash from recreio.paired_credentials c
      join recreio.pairing_requests p on p.device_session_id=c.device_session_id
      where c.guardian_user_id=${familia.conta.id}`;
    if (!pareado) throw new Error("Paired receipt absent");
    const propria = await capturarDadosPessoaisDaConta(familia.autor);
    try {
      const texto = propria.bytes.toString("utf8");
      for (const segredo of [pareado.token_hash, pareado.code_hash, pareado.poll_hash])
        if (segredo !== null) expect(texto).not.toContain(segredo);
    } finally {
      propria.bytes.fill(0);
    }
    await fonte`update recreio.pairing_requests set profile_id=${outra.perfil.id} where device_session_id=${pareado.device_session_id}`;
    try {
      await expect(capturarDadosPessoaisDaConta(familia.autor)).rejects.toMatchObject({
        code: "INTEGRIDADE",
      });
    } finally {
      await fonte`update recreio.pairing_requests set profile_id=${familia.perfil.id} where device_session_id=${pareado.device_session_id}`;
    }
  } finally {
    await fonte.end({ timeout: 5 });
  }
});
