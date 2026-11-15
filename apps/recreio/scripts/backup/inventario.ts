import { createHash } from "node:crypto";
import type postgres from "postgres";

type Leitor = Pick<postgres.Sql, "unsafe">;
type Resumo = { linhas: number; sha256: string };
export type InventarioDoBackup = {
  versao: number;
  banco: {
    encoding: string;
    datcollate: string;
    datctype: string;
    datlocprovider: string;
    datlocale: string | null;
    datcollversion: string | null;
  };
  tabelas: { schema: string; nome: string; resumo: Resumo }[];
  estrutura: Resumo;
  permissoes: Resumo;
};

export class FalhaDeInventario extends Error {
  constructor(readonly codigo: "VERSAO_DIVERGENTE" | "ESTRUTURA_DIVERGENTE" | "DADOS_DIVERGENTES") {
    super(codigo);
    this.name = "FalhaDeInventario";
  }
}

/** Identificadores vêm do catálogo, mas continuam sendo citados como SQL. */
function identificador(valor: string): string {
  return `"${valor.replaceAll('"', '""')}"`;
}

/** Só hashes de tamanho fixo saem do banco; nunca linhas de famílias. */
async function resumir(leitor: Leitor, consulta: string): Promise<Resumo> {
  const hash = createHash("sha256");
  let linhas = 0;
  const cursor = leitor.unsafe<{ linha: string }[]>(consulta).cursor(256);
  for await (const lote of cursor) {
    for (const { linha } of lote) {
      if (!/^[a-f0-9]{64}$/.test(linha)) throw new Error("RESUMO_INVALIDO");
      hash.update(linha, "ascii");
      linhas++;
    }
  }
  return { linhas, sha256: hash.digest("hex") };
}

function consultaResumida(consulta: string): string {
  return `select encode(sha256(convert_to(row_to_json(registro)::text, 'UTF8')), 'hex') as linha
    from (${consulta}) registro order by linha`;
}

/** O chamador mantém o mesmo snapshot READ ONLY usado pelo pg_dump. */
export async function inventariarBackup(leitor: Leitor): Promise<InventarioDoBackup> {
  await leitor.unsafe("set local search_path = pg_catalog");
  await leitor.unsafe("set local timezone = 'UTC'");
  await leitor.unsafe("set local datestyle = 'ISO, MDY'");
  await leitor.unsafe("set local intervalstyle = 'postgres'");
  await leitor.unsafe("set local extra_float_digits = 3");
  await leitor.unsafe("set local bytea_output = 'hex'");
  await leitor.unsafe("set local statement_timeout = '15000ms'");
  await leitor.unsafe("set local lock_timeout = '2000ms'");
  await leitor.unsafe("set local work_mem = '16MB'");
  const [servidor] = await leitor.unsafe<{ versao: number }[]>(
    "select current_setting('server_version_num')::int as versao",
  );
  if (!servidor) throw new Error("VERSAO_AUSENTE");
  const [banco] = await leitor.unsafe<InventarioDoBackup["banco"][]>(`
    select pg_encoding_to_char(encoding) as encoding,datcollate,datctype,
      datlocprovider,datlocale,datcollversion
    from pg_database where datname=current_database()`);
  if (!banco) throw new Error("BANCO_AUSENTE");
  const catalogo = await leitor.unsafe<{ schema: string; nome: string }[]>(`
    select n.nspname as schema, c.relname as nome
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p','m') and n.nspname !~ '^pg_'
      and n.nspname <> 'information_schema'
    order by n.nspname collate "C", c.relname collate "C"`);
  const tabelas: InventarioDoBackup["tabelas"] = [];
  for (const tabela of catalogo) {
    const nome = `${identificador(tabela.schema)}.${identificador(tabela.nome)}`;
    const resumo = await resumir(leitor, consultaResumida(`select * from ${nome}`));
    tabelas.push({ ...tabela, resumo });
  }
  // Dados iguais não bastam: índices, constraints, defaults, proprietário e
  // políticas precisam continuar existindo depois da restauração.
  const estrutura = await resumir(
    leitor,
    consultaResumida(`
      select n.nspname as schema, c.relname as nome, c.relkind,
        pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity,
        (select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),
            a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))
          order by a.attnum)
         from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
         where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
        (select jsonb_agg(pg_get_constraintdef(k.oid,true) order by k.conname)
         from pg_constraint k where k.conrelid=c.oid) as constraints,
        (select jsonb_agg(pg_get_indexdef(i.indexrelid) order by ci.relname)
         from pg_index i join pg_class ci on ci.oid=i.indexrelid
         where i.indrelid=c.oid) as indexes,
        (select jsonb_agg(jsonb_build_array(p.polname,p.polcmd,p.polpermissive,
            array(select case when role_id=0 then 'PUBLIC' else pg_get_userbyid(role_id) end
              from unnest(p.polroles) role_id order by 1),
            pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
         from pg_policy p where p.polrelid=c.oid) as policies
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind in ('r','p','m') and n.nspname !~ '^pg_'
        and n.nspname <> 'information_schema'`),
  );
  const permissoes = await resumir(
    leitor,
    consultaResumida(`select grantor,grantee,table_schema,table_name,privilege_type,
        is_grantable,with_hierarchy from information_schema.table_privileges
      where table_schema !~ '^pg_' and table_schema <> 'information_schema'`),
  );
  return { versao: servidor.versao, banco, tabelas, estrutura, permissoes };
}

/** Nunca devolve conteúdo ou fingerprints no erro operacional. */
export function conferirInventarios(origem: InventarioDoBackup, copia: InventarioDoBackup): void {
  if (origem.versao !== copia.versao) throw new FalhaDeInventario("VERSAO_DIVERGENTE");
  if (
    JSON.stringify(origem.banco) !== JSON.stringify(copia.banco) ||
    JSON.stringify(origem.estrutura) !== JSON.stringify(copia.estrutura) ||
    JSON.stringify(origem.permissoes) !== JSON.stringify(copia.permissoes)
  )
    throw new FalhaDeInventario("ESTRUTURA_DIVERGENTE");
  if (JSON.stringify(origem.tabelas) !== JSON.stringify(copia.tabelas))
    throw new FalhaDeInventario("DADOS_DIVERGENTES");
}
