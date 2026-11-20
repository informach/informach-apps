import type postgres from "postgres";
import { exigir } from "./provas-arquivos";

/** Fixed, synthetic cold-proof sources. No SQL/identifiers from the caller.
 * Hashes stay in memory; the public proof contains only boolean conditions. */
export async function testemunharConvitesRecuperados(copia: postgres.Sql) {
  const fontes = [
    {
      nome: "friend_codes",
      terminada: "consumed_at is not null or revoked_at is not null",
      retencao: false,
    },
    { nome: "friend_requests", terminada: "state<>'pending'", retencao: false },
    { nome: "group_invites", terminada: "state<>'pending'", retencao: false },
    {
      nome: "space_invites",
      terminada: "state not in ('pending_approval','sent')",
      retencao: false,
    },
    { nome: "directed_space_invites", terminada: "state<>'pending'", retencao: true },
    { nome: "space_visit_invites", terminada: "state<>'pending'", retencao: true },
    { nome: "space_stewardship_requests", terminada: "state<>'pending'", retencao: false },
  ] as const;
  const testemunhas: {
    terminais: () => Promise<string>;
    prazos: () => Promise<string>;
    terminaisAntes: string;
    prazosAntes: string;
  }[] = [];
  for (const fonte of fontes) {
    const ids = await copia.unsafe<{ id: string; terminada: boolean }[]>(
      `select id,(${fonte.terminada}) as terminada from recreio.${fonte.nome} order by id limit 1001`,
    );
    exigir(
      ids.length >= 2 &&
        ids.length <= 1000 &&
        ids.some((i) => i.terminada) &&
        ids.some((i) => !i.terminada),
      "CONVITES_SINTETICOS_AUSENTES",
    );
    const fechados = ids.filter((i) => i.terminada).map((i) => i.id);
    async function hash(consulta: string, parametros: string[][] = []) {
      const [r] = await copia.unsafe<{ sha: string }[]>(consulta, parametros);
      exigir(r && /^[a-f0-9]{64}$/.test(r.sha), "HISTORICO_DE_CONVITES_INVALIDO");
      return r.sha;
    }
    const terminais = () =>
      hash(
        `select encode(sha256(convert_to(coalesce(
      jsonb_agg(to_jsonb(t) order by id)::text,'[]'),'UTF8')),'hex') as sha
      from recreio.${fonte.nome} t where id=any($1::uuid[])`,
        [fechados],
      );
    const prazos = () =>
      hash(`select encode(sha256(convert_to(coalesce(
      jsonb_agg(jsonb_build_array(id,created_at,expires_at${fonte.retencao ? ",retain_until" : ""}) order by id)::text,'[]'),
      'UTF8')),'hex') as sha from recreio.${fonte.nome}`);
    testemunhas.push({
      terminais,
      prazos,
      terminaisAntes: await terminais(),
      prazosAntes: await prazos(),
    });
  }
  return async () => {
    for (const t of testemunhas)
      exigir(
        (await t.terminais()) === t.terminaisAntes && (await t.prazos()) === t.prazosAntes,
        "HISTORICO_DE_CONVITES_ALTERADO",
      );
  };
}
