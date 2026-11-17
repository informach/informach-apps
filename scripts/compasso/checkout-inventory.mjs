/** Read inside the caller's transaction; schemas before 0162 have no receipts. */
export async function countUnresolvedCheckouts(sql, apps) {
  const [relations] = await sql`select
    to_regclass('billing.checkout_intents') is not null as intents,
    to_regclass('billing.legacy_checkout_resolutions') is not null as resolutions`;
  if (!relations.intents) return 0;
  const unresolved = relations.resolutions
    ? sql`not exists (select 1 from billing.legacy_checkout_resolutions r
        where r.provider_session_id = i.provider_session_id and r.customer_id = i.customer_id)`
    : sql`true`;
  const [result] = await sql`select count(*)::int as pending
    from billing.checkout_intents i join billing.customers c on c.id = i.customer_id
    where c.app in ${sql(apps)} and ${unresolved}`;
  return result.pending;
}
