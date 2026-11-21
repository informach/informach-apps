import { createHash } from "node:crypto";
import type postgres from "postgres";
import { exigirBancoPrivadoDeRecuperacao } from "./normalizar-fotografias";

export class FalhaDosVinculosAtuais extends Error {
  constructor(
    readonly codigo:
      | "PERFIL_NAO_SUPORTADO"
      | "IDENTIDADE_AUSENTE"
      | "VINCULO_FINANCEIRO"
      | "ORIGEM_INCOMPLETA",
  ) {
    super(codigo);
    this.name = "FalhaDosVinculosAtuais";
  }
}
type Consulta = Pick<postgres.Sql, "unsafe">;
type Destino =
  | "core.users"
  | "core.sessions"
  | "billing.customers"
  | "billing.subscriptions"
  | "billing.subscription_payment_periods";
const COLUNAS: Record<Destino, readonly string[]> = {
  "core.users": ["id"],
  "core.sessions": ["id", "user_id"],
  "billing.customers": ["id"],
  "billing.subscriptions": ["id"],
  "billing.subscription_payment_periods": ["id", "subscription_id", "provider"],
};
const DESTINOS: readonly Destino[] = [
  "core.users",
  "core.sessions",
  "billing.customers",
  "billing.subscriptions",
  "billing.subscription_payment_periods",
];
function destino(value: string): value is Destino {
  return DESTINOS.some((d) => d === value);
}
function identificador(value: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value))
    throw new FalhaDosVinculosAtuais("PERFIL_NAO_SUPORTADO");
  return `"${value}"`;
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const LIMITE = 10_000;

async function referencias(tx: Consulta) {
  const catalogo = await tx.unsafe<
    {
      chave: string;
      tabela: string;
      coluna: string;
      schema: string;
      destino: string;
      alvo: string;
    }[]
  >(`select
    c.oid::text as chave,l.relname as tabela,la.attname as coluna,rn.nspname as schema,r.relname as destino,ra.attname as alvo
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class l on l.oid=c.conrelid join pg_catalog.pg_namespace ln on ln.oid=l.relnamespace
    join pg_catalog.pg_class r on r.oid=c.confrelid join pg_catalog.pg_namespace rn on rn.oid=r.relnamespace
    cross join lateral unnest(c.conkey,c.confkey) as k(coluna_local,coluna_remota)
    join pg_catalog.pg_attribute la on la.attrelid=l.oid and la.attnum=k.coluna_local
    join pg_catalog.pg_attribute ra on ra.attrelid=r.oid and ra.attnum=k.coluna_remota
    where c.contype='f' and ln.nspname='recreio' and rn.nspname<>'recreio'
    order by rn.nspname,r.relname,l.relname,la.attname`);
  if (!catalogo.length || catalogo.length > 128)
    throw new FalhaDosVinculosAtuais("PERFIL_NAO_SUPORTADO");
  const ids = new Map<Destino, Set<string>>(DESTINOS.map((d) => [d, new Set<string>()]));
  for (const fk of catalogo) {
    const alvo = `${fk.schema}.${fk.destino}`;
    if (
      !destino(alvo) ||
      !COLUNAS[alvo].includes(fk.alvo) ||
      !catalogo.some((coluna) => coluna.chave === fk.chave && coluna.alvo === "id")
    )
      throw new FalhaDosVinculosAtuais("PERFIL_NAO_SUPORTADO");
    // Composite financial/session FKs also carry provider/subscription/user;
    // read their ID column once, then compare the complete binding below.
    if (fk.alvo !== "id") continue;
    const linhas = await tx.unsafe<
      { id: string }[]
    >(`select distinct ${identificador(fk.coluna)}::text collate "C" as id
      from recreio.${identificador(fk.tabela)} where ${identificador(fk.coluna)} is not null
      order by 1 limit ${LIMITE + 1}`);
    const conjunto = ids.get(alvo);
    if (!conjunto || linhas.length > LIMITE)
      throw new FalhaDosVinculosAtuais("PERFIL_NAO_SUPORTADO");
    for (const linha of linhas) {
      if (!linha.id || linha.id.length > 256)
        throw new FalhaDosVinculosAtuais("PERFIL_NAO_SUPORTADO");
      conjunto.add(linha.id);
      if (conjunto.size > LIMITE) throw new FalhaDosVinculosAtuais("PERFIL_NAO_SUPORTADO");
    }
  }
  async function incluir(alvo: Destino, tabela: Destino, coluna: string) {
    const referencias = [...(ids.get(tabela) ?? [])].sort();
    if (!referencias.length) return;
    const [schema, nome] = tabela.split(".");
    if (!schema || !nome) throw new FalhaDosVinculosAtuais("PERFIL_NAO_SUPORTADO");
    const linhas = await tx.unsafe<{ id: string }[]>(
      `select distinct ${identificador(coluna)}::text collate "C" as id
      from ${identificador(schema)}.${identificador(nome)}
      where id::text in(select jsonb_array_elements_text($1::jsonb)) order by 1`,
      [JSON.stringify(referencias)],
    );
    const conjunto = ids.get(alvo);
    if (!conjunto) throw new FalhaDosVinculosAtuais("PERFIL_NAO_SUPORTADO");
    for (const linha of linhas) conjunto.add(linha.id);
    if (conjunto.size > LIMITE) throw new FalhaDosVinculosAtuais("PERFIL_NAO_SUPORTADO");
  }
  await incluir("billing.subscriptions", "billing.subscription_payment_periods", "subscription_id");
  await incluir("billing.customers", "billing.subscriptions", "customer_id");
  await incluir("core.users", "core.sessions", "user_id");
  const clientes = [...(ids.get("billing.customers") ?? [])].sort();
  const vinculos = await tx.unsafe<{ id: string; app: string; tipo: string; conta: string }[]>(
    `select
    id::text,app,subject_type as tipo,subject_id as conta from billing.customers
    where id::text in(select jsonb_array_elements_text($1::jsonb)) order by id::text collate "C"`,
    [JSON.stringify(clientes)],
  );
  const contas = ids.get("core.users");
  if (!contas || vinculos.length !== clientes.length)
    throw new FalhaDosVinculosAtuais("ORIGEM_INCOMPLETA");
  for (const c of vinculos) {
    if (c.app !== "recreio" || c.tipo !== "user" || !c.conta || c.conta.length > 256)
      throw new FalhaDosVinculosAtuais("VINCULO_FINANCEIRO");
    contas.add(c.conta);
  }
  if (contas.size > LIMITE) throw new FalhaDosVinculosAtuais("PERFIL_NAO_SUPORTADO");
  return ids;
}

type Linha = { id: string; vinculo: string; estado: string };
const PROJECOES: Record<Destino, { vinculo: string; estado: string }> = {
  "core.users": {
    vinculo: "jsonb_build_array(id)",
    estado: "jsonb_build_array(id,email_verified,role,banned,ban_expires_at,updated_at)",
  },
  "core.sessions": {
    vinculo: "jsonb_build_array(id,user_id)",
    estado: "jsonb_build_array(id,user_id,expires_at)",
  },
  "billing.customers": {
    vinculo: "jsonb_build_array(id,provider,provider_customer_id,subject_type,subject_id,app)",
    estado: "jsonb_build_array(id,provider,provider_customer_id,subject_type,subject_id,app)",
  },
  "billing.subscriptions": {
    vinculo: "jsonb_build_array(id,customer_id,provider,provider_subscription_id)",
    estado:
      "jsonb_build_array(id,product_id,provider_price_id,status,current_period_start,current_period_end,cancel_at_period_end,canceled_at,confirmed_at,provider_observed_at,trial_end,pending_product_id,pending_price_id,updated_at)",
  },
  "billing.subscription_payment_periods": {
    vinculo:
      "jsonb_build_array(id,subscription_id,provider,provider_invoice_id,provider_line_id,provider_price_id,period_start,period_end,paid_at)",
    estado: "jsonb_build_array(id,fully_refunded,disputed,reconciled_at)",
  },
};
async function ler(tx: Consulta, alvo: Destino, ids: readonly string[]): Promise<Linha[]> {
  if (!ids.length) return [];
  const [schema, tabela] = alvo.split(".");
  if (!schema || !tabela) throw new FalhaDosVinculosAtuais("PERFIL_NAO_SUPORTADO");
  const p = PROJECOES[alvo];
  return tx.unsafe<Linha[]>(
    `select id::text,(${p.vinculo})::text as vinculo,(${p.estado})::text as estado
    from ${identificador(schema)}.${identificador(tabela)} t
    where id::text in(select jsonb_array_elements_text($1::jsonb)) order by id::text collate "C"`,
    [JSON.stringify(ids)],
  );
}

/** Read-only preflight for a selective import. The restored shared schemas are
 * historical and NEVER copied to the current target. Current bans/status and
 * financial observations enter the fingerprint; they are not overwritten by
 * the archive. This descriptor does not authorize traffic or settle Stripe. */
export async function conferirVinculosGlobaisAtuais(restaurado: postgres.Sql, atual: postgres.Sql) {
  await exigirBancoPrivadoDeRecuperacao(restaurado);
  const fonte = await restaurado.begin("isolation level repeatable read read only", async (tx) => {
    await tx.unsafe("set local timezone='UTC'");
    await tx.unsafe("set local statement_timeout='5000ms'");
    await tx.unsafe("set local transaction_timeout='30000ms'");
    const refs = await referencias(tx);
    const dados = new Map<Destino, Linha[]>();
    for (const alvo of DESTINOS) {
      const ids = [...(refs.get(alvo) ?? [])].sort();
      const linhas = await ler(tx, alvo, ids);
      if (linhas.length !== ids.length) throw new FalhaDosVinculosAtuais("ORIGEM_INCOMPLETA");
      dados.set(alvo, linhas);
    }
    return { refs, dados };
  });
  return atual.begin("isolation level repeatable read read only", async (tx) => {
    await tx.unsafe("set local timezone='UTC'");
    await tx.unsafe("set local statement_timeout='5000ms'");
    await tx.unsafe("set local transaction_timeout='30000ms'");
    const observadas: { alvo: Destino; linhas: Linha[] }[] = [];
    let sessoesAusentes = 0,
      identidadesAlteradas = 0,
      fatosFinanceirosAlterados = 0;
    const quantidades: Record<string, number> = {};
    for (const alvo of DESTINOS) {
      const ids = [...(fonte.refs.get(alvo) ?? [])].sort();
      const linhas = await ler(tx, alvo, ids),
        antigas = fonte.dados.get(alvo) ?? [];
      quantidades[alvo] = ids.length;
      if (alvo === "core.sessions") sessoesAusentes = ids.length - linhas.length;
      else if (linhas.length !== ids.length)
        throw new FalhaDosVinculosAtuais(
          alvo === "core.users" ? "IDENTIDADE_AUSENTE" : "VINCULO_FINANCEIRO",
        );
      const porId = new Map(antigas.map((l) => [l.id, l]));
      for (const linha of linhas) {
        const antiga = porId.get(linha.id);
        if (!antiga || antiga.vinculo !== linha.vinculo)
          throw new FalhaDosVinculosAtuais("VINCULO_FINANCEIRO");
        if (antiga.estado !== linha.estado) {
          if (alvo === "core.users") identidadesAlteradas++;
          else if (alvo.startsWith("billing.")) fatosFinanceirosAlterados++;
        }
      }
      observadas.push({ alvo, linhas });
    }
    const contas = [...(fonte.refs.get("core.users") ?? [])].sort();
    const clientesAtuais = await tx.unsafe<{ id: string; vinculo: string }[]>(
      `select id::text,
      jsonb_build_array(id,provider,provider_customer_id,subject_type,subject_id,app)::text as vinculo
      from billing.customers where app='recreio' and subject_type='user'
      and subject_id in(select jsonb_array_elements_text($1::jsonb)) order by id::text collate "C" limit ${LIMITE + 1}`,
      [JSON.stringify(contas)],
    );
    if (clientesAtuais.length > LIMITE) throw new FalhaDosVinculosAtuais("PERFIL_NAO_SUPORTADO");
    return Object.freeze({
      formato: "recreio-vinculos-globais-atuais-v1" as const,
      referencias: Object.freeze(quantidades),
      sha256: hash({
        fonte: [...fonte.refs].map(([alvo, ids]) => [alvo, [...ids].sort()]),
        observadas,
        clientesAtuais,
      }),
      identidadesAlteradas,
      fatosFinanceirosAlterados,
      sessoesAusentes,
      clientesAtuais: clientesAtuais.length,
      exigeConciliacaoFinanceira:
        clientesAtuais.length > 0 || (quantidades["billing.subscriptions"] ?? 0) > 0,
      exigeLimpezaDeExportacoes: sessoesAusentes > 0,
      trafegoAutorizado: false as const,
    });
  });
}
