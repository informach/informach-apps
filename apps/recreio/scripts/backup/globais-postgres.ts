import type postgres from "postgres";
import { z } from "zod";

const Nome = z
  .string()
  .min(1)
  .max(63)
  .refine((v) => !v.includes("\0"));
const Configuracao = z.strictObject({
  nome: z.enum([
    "search_path",
    "statement_timeout",
    "lock_timeout",
    "idle_in_transaction_session_timeout",
    "default_transaction_read_only",
    "work_mem",
    "maintenance_work_mem",
    "idle_session_timeout",
    "transaction_timeout",
  ]),
  valor: z
    .string()
    .max(1024)
    .refine((v) => !v.includes("\0")),
});
export const GlobaisPostgresSchema = z
  .strictObject({
    formato: z.literal("recreio-globais-postgres-v1"),
    operador: Nome,
    papeis: z
      .array(
        z.strictObject({
          nome: Nome,
          superuser: z.boolean(),
          herdar: z.boolean(),
          criarPapel: z.boolean(),
          criarBanco: z.boolean(),
          login: z.boolean(),
          replicacao: z.boolean(),
          ignorarRls: z.boolean(),
          conexoes: z.number().int().min(-1).max(2147483647),
          validade: z
            .string()
            .min(1)
            .max(64)
            .refine((v) => !v.includes("\0"))
            .nullable(),
          configuracoes: z.array(Configuracao).max(32),
        }),
      )
      .min(1)
      .max(1024),
    membros: z
      .array(
        z.strictObject({
          papel: Nome,
          membro: Nome,
          concedente: Nome,
          admin: z.boolean(),
          herdar: z.boolean(),
          assumir: z.boolean(),
        }),
      )
      .max(4096),
  })
  .superRefine((v, ctx) => {
    const nomes = new Set(v.papeis.map((p) => p.nome));
    if (
      nomes.size !== v.papeis.length ||
      !v.papeis.some((p) => p.nome === v.operador && p.superuser)
    )
      ctx.addIssue({ code: "custom", message: "unsupported role profile" });
    for (const p of v.papeis)
      if (
        p.nome.startsWith("pg_") ||
        new Set(p.configuracoes.map((c) => c.nome)).size !== p.configuracoes.length
      )
        ctx.addIssue({ code: "custom", message: "invalid role" });
    const identidades = new Set<string>();
    for (const m of v.membros) {
      const id = JSON.stringify([m.papel, m.membro, m.concedente]);
      if (
        identidades.has(id) ||
        m.concedente !== v.operador ||
        ![m.papel, m.membro].every((n) => nomes.has(n) || /^pg_[a-z0-9_]+$/.test(n))
      )
        ctx.addIssue({ code: "custom", message: "unsupported membership profile" });
      identidades.add(id);
    }
  });
export type GlobaisPostgres = z.infer<typeof GlobaisPostgresSchema>;
export class FalhaDosGlobaisPostgres extends Error {
  constructor(
    readonly codigo: "PERFIL_NAO_SUPORTADO" | "ALVO_NAO_ISOLADO" | "RECRIACAO_DIVERGENTE",
  ) {
    super(`recreio.backup_globals.${codigo}`);
  }
}
type Leitor = Pick<postgres.Sql, "unsafe">;

/** Material técnico privado dentro do arquivo cifrado. Nunca selecionar senha
 * ou hash de senha. Perfil atual: operador superuser/dono, sem settings por
 * banco; memberships concedidas pelo operador. Fora dele, falhar explicitamente. */
export async function inventariarGlobaisPostgres(sql: Leitor): Promise<GlobaisPostgres> {
  const [origem] = await sql.unsafe<
    { operador: string; suportado: boolean }[]
  >(`select current_user::text as operador,
    (d.datdba=(select oid from pg_roles where rolname=current_user) and d.datconnlimit=-1 and d.datallowconn
      and d.datacl is null and not exists(select 1 from pg_db_role_setting where setdatabase=d.oid)
      and not exists(select 1 from pg_tablespace where spcname not in ('pg_default','pg_global'))) as suportado
    from pg_database d where d.datname=current_database()`);
  if (!origem?.suportado) throw new FalhaDosGlobaisPostgres("PERFIL_NAO_SUPORTADO");
  const papeis =
    await sql.unsafe(`select rolname::text as nome,rolsuper as superuser,rolinherit as herdar,
    rolcreaterole as "criarPapel",rolcreatedb as "criarBanco",rolcanlogin as login,rolreplication as replicacao,
    rolbypassrls as "ignorarRls",rolconnlimit as conexoes,rolvaliduntil::text as validade,
    coalesce((select jsonb_agg(jsonb_build_object('nome',split_part(c,'=',1),'valor',substr(c,strpos(c,'=')+1)) order by c collate "C") from unnest(rolconfig) c),'[]'::jsonb) as configuracoes
    from pg_roles where rolname !~ '^pg_' order by rolname collate "C"`);
  const membros =
    await sql.unsafe(`select pg_get_userbyid(roleid) as papel,pg_get_userbyid(member) as membro,
    pg_get_userbyid(grantor) as concedente,admin_option as admin,inherit_option as herdar,set_option as assumir
    from pg_auth_members order by pg_get_userbyid(roleid) collate "C",pg_get_userbyid(member) collate "C",pg_get_userbyid(grantor) collate "C"`);
  const r = GlobaisPostgresSchema.safeParse({
    formato: "recreio-globais-postgres-v1",
    operador: origem.operador,
    papeis,
    membros,
  });
  if (!r.success) throw new FalhaDosGlobaisPostgres("PERFIL_NAO_SUPORTADO");
  return r.data;
}
const identificador = (v: string) => `"${v.replaceAll('"', '""')}"`;
const literal = (v: string) => `'${v.replaceAll("'", "''")}'`;

/** Apenas o cluster novo do executor, sem TCP, socket privado e sem banco de
 * aplicação. Não deve ser usado em outro banco do cluster de produção.
 * Mantém a senha NOVA do operador e não copia senhas das outras identidades. */
export async function recriarGlobaisPostgres(
  controle: postgres.Sql,
  bruto: unknown,
  socket: string,
  porta: number,
) {
  const lido = GlobaisPostgresSchema.safeParse(bruto);
  if (!lido.success) throw new FalhaDosGlobaisPostgres("PERFIL_NAO_SUPORTADO");
  const contexto = lido.data;
  if (!/^\/tmp\/recreio-backup-[a-zA-Z0-9]+$/.test(socket) || porta !== 55432)
    throw new FalhaDosGlobaisPostgres("ALVO_NAO_ISOLADO");
  await controle.begin(async (tx) => {
    await tx.unsafe("set local statement_timeout='15000ms'");
    await tx.unsafe("set local lock_timeout='5000ms'");
    await tx.unsafe("set local transaction_timeout='120000ms'");
    await tx.unsafe("set local standard_conforming_strings=on");
    await tx.unsafe("set local search_path=pg_catalog");
    await tx.unsafe("set local timezone='UTC'");
    await tx.unsafe("set local datestyle='ISO, MDY'");
    const [alvo] = await tx.unsafe<
      {
        banco: string;
        operador: string;
        escuta: string;
        socket: string;
        porta: number;
        outros: number;
      }[]
    >(`select current_database()::text as banco,current_user::text as operador,
      current_setting('listen_addresses') as escuta,current_setting('unix_socket_directories') as socket,current_setting('port')::int as porta,
      (select count(*)::int from pg_database where datname not in ('postgres','template0','template1')) as outros`);
    if (
      alvo?.banco !== "postgres" ||
      alvo.operador !== contexto.operador ||
      alvo.escuta !== "" ||
      alvo.socket !== socket ||
      alvo.porta !== porta ||
      alvo.outros !== 0
    )
      throw new FalhaDosGlobaisPostgres("ALVO_NAO_ISOLADO");
    const existentes = await tx.unsafe<{ nome: string }[]>(
      "select rolname::text as nome from pg_roles where rolname !~ '^pg_'",
    );
    if (existentes.some((p) => !contexto.papeis.some((v) => v.nome === p.nome)))
      throw new FalhaDosGlobaisPostgres("ALVO_NAO_ISOLADO");
    for (const p of contexto.papeis)
      if (!existentes.some((r) => r.nome === p.nome))
        await tx.unsafe(`create role ${identificador(p.nome)} nologin`);
    for (const p of contexto.papeis) {
      const atributos = [
        p.superuser ? "SUPERUSER" : "NOSUPERUSER",
        p.herdar ? "INHERIT" : "NOINHERIT",
        p.criarPapel ? "CREATEROLE" : "NOCREATEROLE",
        p.criarBanco ? "CREATEDB" : "NOCREATEDB",
        p.login ? "LOGIN" : "NOLOGIN",
        p.replicacao ? "REPLICATION" : "NOREPLICATION",
        p.ignorarRls ? "BYPASSRLS" : "NOBYPASSRLS",
        `CONNECTION LIMIT ${p.conexoes}`,
        p.validade === null ? "" : `VALID UNTIL ${literal(p.validade)}`,
      ];
      await tx.unsafe(`alter role ${identificador(p.nome)} with ${atributos.join(" ")}`);
      await tx.unsafe(`alter role ${identificador(p.nome)} reset all`);
      for (const c of p.configuracoes)
        await tx.unsafe(
          `alter role ${identificador(p.nome)} set ${identificador(c.nome)} = ${literal(c.valor)}`,
        );
    }
    for (const m of contexto.membros) {
      for (const [opcao, campo] of [
        ["ADMIN", "admin"],
        ["INHERIT", "herdar"],
        ["SET", "assumir"],
      ] as const) {
        const atual = (await inventariarGlobaisPostgres(tx)).membros.find(
          (r) => r.papel === m.papel && r.membro === m.membro && r.concedente === m.concedente,
        );
        if (!atual || atual[campo] !== m[campo])
          await tx.unsafe(
            `grant ${identificador(m.papel)} to ${identificador(m.membro)} with ${opcao} ${m[campo] ? "TRUE" : "FALSE"} granted by ${identificador(m.concedente)}`,
          );
      }
    }
    const restaurado = await inventariarGlobaisPostgres(tx);
    if (JSON.stringify(restaurado) !== JSON.stringify(contexto))
      throw new FalhaDosGlobaisPostgres("RECRIACAO_DIVERGENTE");
  });
}
