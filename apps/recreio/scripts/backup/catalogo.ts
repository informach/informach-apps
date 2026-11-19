/** Consultas de catálogo, sem dados de famílias. A origem mantém search_path
 * pg_catalog e snapshot READ ONLY. Só fingerprints de tamanho fixo saem dessas
 * consultas; OIDs são resolvidos por identidades estáveis antes do resumo. */
export const estruturaAdicional = [
  [
    "schemas",
    `select nspname as schema,pg_get_userbyid(nspowner) as owner
    from pg_namespace where nspname !~ '^pg_' and nspname<>'information_schema'`,
  ],
  [
    "views",
    `select n.nspname as schema,c.relname,pg_get_viewdef(c.oid,true) as definition
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('v','m') and n.nspname !~ '^pg_' and n.nspname<>'information_schema'`,
  ],
  [
    "routines",
    `select n.nspname as schema,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
      pg_get_userbyid(p.proowner) as owner,pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prokind in ('f','p','w') and n.nspname !~ '^pg_' and n.nspname<>'information_schema'`,
  ],
  [
    "triggers",
    `select n.nspname as schema,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) as definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname !~ '^pg_' and n.nspname<>'information_schema'`,
  ],
  [
    "rules",
    `select n.nspname as schema,c.relname,r.rulename,pg_get_ruledef(r.oid,true) as definition
    from pg_rewrite r join pg_class c on c.oid=r.ev_class join pg_namespace n on n.oid=c.relnamespace
    where r.rulename<>'_RETURN' and n.nspname !~ '^pg_' and n.nspname<>'information_schema'`,
  ],
  [
    "types",
    `select n.nspname as schema,t.typname,t.typtype,t.typcategory,t.typnotnull,
      pg_get_userbyid(t.typowner) as owner,t.typlen,t.typbyval,t.typalign,t.typstorage,t.typdelim,
      case when t.typbasetype<>0 then format_type(t.typbasetype,t.typtypmod) end as base,
      case when t.typelem<>0 then format_type(t.typelem,null) end as element,
      t.typdefault,t.typinput::regproc::text as input,t.typoutput::regproc::text as output,
      (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid) as labels,
      (select jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid,true)) order by k.conname) from pg_constraint k where k.contypid=t.oid) as constraints
    from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname !~ '^pg_' and n.nspname<>'information_schema'`,
  ],
  [
    "sequences",
    `select n.nspname as schema,c.relname,format_type(s.seqtypid,null) as datatype,
      s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle,
      (select jsonb_agg(jsonb_build_array(d.deptype,pn.nspname,p.relname,a.attname) order by pn.nspname,p.relname,a.attname)
        from pg_depend d join pg_class p on p.oid=d.refobjid join pg_namespace pn on pn.oid=p.relnamespace
        join pg_attribute a on a.attrelid=p.oid and a.attnum=d.refobjsubid
        where d.classid='pg_class'::regclass and d.objid=c.oid and d.refclassid='pg_class'::regclass and d.deptype in ('a','i')) as owned_by
    from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname !~ '^pg_' and n.nspname<>'information_schema'`,
  ],
  [
    "extensions",
    `select e.extname,e.extversion,e.extrelocatable,n.nspname as schema,pg_get_userbyid(e.extowner) as owner,
      (select jsonb_agg(jsonb_build_array(cn.nspname,c.relname) order by u.ord)
        from unnest(e.extconfig) with ordinality u(id,ord) join pg_class c on c.oid=u.id join pg_namespace cn on cn.oid=c.relnamespace) as config,
      e.extcondition from pg_extension e join pg_namespace n on n.oid=e.extnamespace`,
  ],
  [
    "statistics",
    `select n.nspname as schema,s.stxname,pg_get_userbyid(s.stxowner) as owner,
      s.stxstattarget,pg_get_statisticsobjdef(s.oid) as definition
    from pg_statistic_ext s join pg_namespace n on n.oid=s.stxnamespace
    where n.nspname !~ '^pg_' and n.nspname<>'information_schema'`,
  ],
] as const;

/** ACLs efetivas: NULL equivale ao default do objeto, não à ausência de
 * permissão. Conservar grantor, destinatário, privilégio e grant option. */
export const permissoesAdicionais = `with objetos as (
  select 'schema'::text as kind,n.nspname as schema,''::text as name,''::text as detail,coalesce(n.nspacl,acldefault('n',n.nspowner)) as acl
    from pg_namespace n where n.nspname !~ '^pg_' and n.nspname<>'information_schema'
  union all
  select 'routine',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),coalesce(p.proacl,acldefault('f',p.proowner))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname !~ '^pg_' and n.nspname<>'information_schema'
  union all
  select 'type',n.nspname,t.typname,'',coalesce(t.typacl,acldefault('T',t.typowner))
    from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname !~ '^pg_' and n.nspname<>'information_schema'
  union all
  select 'sequence',n.nspname,c.relname,'',coalesce(c.relacl,acldefault('S',c.relowner))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname !~ '^pg_' and n.nspname<>'information_schema'
  union all
  select 'column',n.nspname,c.relname,a.attname,a.attacl
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    where a.attnum>0 and not a.attisdropped and a.attacl is not null and n.nspname !~ '^pg_' and n.nspname<>'information_schema'
  union all
  select 'default',coalesce(n.nspname,''),pg_get_userbyid(d.defaclrole),d.defaclobjtype::text,d.defaclacl
    from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    where d.defaclnamespace=0 or (n.nspname !~ '^pg_' and n.nspname<>'information_schema')
)
select o.kind,o.schema,o.name,o.detail,pg_get_userbyid(a.grantor) as grantor,
  case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,a.privilege_type,a.is_grantable
from objetos o cross join lateral aclexplode(o.acl) a`;

/** Não omitir silenciosamente recursos ainda sem perfil de conferência. */
export const recursosNaoSuportados = `select (
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='f' and n.nspname !~ '^pg_' and n.nspname<>'information_schema') +
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='a' and n.nspname !~ '^pg_' and n.nspname<>'information_schema') +
  (select count(*) from pg_foreign_data_wrapper) + (select count(*) from pg_foreign_server) + (select count(*) from pg_event_trigger) +
  (select count(*) from pg_largeobject_metadata) + (select count(*) from pg_parameter_acl) +
  (select count(*) from pg_collation c join pg_namespace n on n.oid=c.collnamespace where n.nspname !~ '^pg_' and n.nspname<>'information_schema') +
  (select count(*) from pg_conversion c join pg_namespace n on n.oid=c.connamespace where n.nspname !~ '^pg_' and n.nspname<>'information_schema') +
  (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typtype in ('r','m') and n.nspname !~ '^pg_' and n.nspname<>'information_schema')
)::int as quantidade`;
