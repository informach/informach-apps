import { createHash } from "node:crypto";
import type postgres from "postgres";
import { estruturaAdicional, permissoesAdicionais, recursosNaoSuportados } from "./catalogo";

type Leitor = Pick<postgres.Sql, "unsafe">;
type Resumo = { linhas: number; sha256: string };
export type InventarioDoBackup = {
  metodo: "recreio-inventario-v2";
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
  constructor(
    readonly codigo:
      | "FORMATO_DIVERGENTE"
      | "VERSAO_DIVERGENTE"
      | "ESTRUTURA_DIVERGENTE"
      | "DADOS_DIVERGENTES"
      | "CATALOGO_NAO_SUPORTADO",
  ) {
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
async function conjunto(
  leitor: Leitor,
  partes: readonly (readonly [string, string])[],
): Promise<Resumo> {
  const hash = createHash("sha256");
  let linhas = 0;
  for (const [tipo, consulta] of partes) {
    const r = await resumir(leitor, consultaResumida(consulta));
    hash.update(JSON.stringify([tipo, r]));
    linhas += r.linhas;
  }
  return { linhas, sha256: hash.digest("hex") };
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
  if (Math.floor(servidor.versao / 10000) !== 18) throw new FalhaDeInventario("VERSAO_DIVERGENTE");
  const [foraDoPerfil] = await leitor.unsafe<{ quantidade: number }[]>(recursosNaoSuportados);
  if (foraDoPerfil?.quantidade !== 0) throw new FalhaDeInventario("CATALOGO_NAO_SUPORTADO");
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
  const estrutura = await conjunto(leitor, [
    [
      "relations",
      `
      select n.nspname as schema, c.relname as nome, c.relkind,
        pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity,c.relpersistence,c.relreplident,c.relispartition,
        pg_get_partkeydef(c.oid) as partition_key,pg_get_expr(c.relpartbound,c.oid) as partition_bound,
        (select jsonb_agg(v order by v collate "C") from unnest(c.reloptions) v) as options,
        (select jsonb_agg(jsonb_build_array(i.inhseqno,pn.nspname,p.relname) order by i.inhseqno)
          from pg_inherits i join pg_class p on p.oid=i.inhparent join pg_namespace pn on pn.oid=p.relnamespace where i.inhrelid=c.oid) as parents,
        (select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),
            a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid),
            case when a.attcollation<>0 then (select jsonb_build_array(cn.nspname,cl.collname) from pg_collation cl join pg_namespace cn on cn.oid=cl.collnamespace where cl.oid=a.attcollation) end)
          order by a.attnum)
         from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
         where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
        (select jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid,true)) order by k.conname)
         from pg_constraint k where k.conrelid=c.oid) as constraints,
        (select jsonb_agg(jsonb_build_array(pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive,i.indisreplident) order by ci.relname)
         from pg_index i join pg_class ci on ci.oid=i.indexrelid
         where i.indrelid=c.oid) as indexes,
        (select jsonb_agg(jsonb_build_array(p.polname,p.polcmd,p.polpermissive,
            array(select case when role_id=0 then 'PUBLIC' else pg_get_userbyid(role_id) end
              from unnest(p.polroles) role_id order by 1),
            pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
         from pg_policy p where p.polrelid=c.oid) as policies
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind in ('r','p','m','v','S','c') and n.nspname !~ '^pg_'
        and n.nspname <> 'information_schema'`,
    ],
    ...estruturaAdicional,
  ]);
  const permissoes = await conjunto(leitor, [
    [
      "tables",
      `select grantor,grantee,table_schema,table_name,privilege_type,
        is_grantable,with_hierarchy from information_schema.table_privileges
      where table_schema !~ '^pg_' and table_schema <> 'information_schema'`,
    ],
    ["other-acls", permissoesAdicionais],
  ]);
  return {
    metodo: "recreio-inventario-v2",
    versao: servidor.versao,
    banco,
    tabelas,
    estrutura,
    permissoes,
  };
}

/** Nunca devolve conteúdo ou fingerprints no erro operacional. */
export function conferirInventarios(origem: InventarioDoBackup, copia: InventarioDoBackup): void {
  if (origem.metodo !== "recreio-inventario-v2" || origem.metodo !== copia.metodo)
    throw new FalhaDeInventario("FORMATO_DIVERGENTE");
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
