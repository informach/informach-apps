import postgres from "postgres";

/** Só agregados de prova, no PostgreSQL descartável do ensaio; não prepara presença. */
export async function observarPresencas(mundo: string) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.RECREIO_ISOLATED_TEST !== "1" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(mundo)
  )
    throw new Error("Observação de presença exige mundo e banco descartáveis");
  const db = postgres(url.toString(), { max: 1 });
  try {
    const [resultado] = await db<
      {
        ativas: number;
        fechadas: number;
        renovadas: number;
        membros: number;
        sessoes_abertas: number;
        visitas_ativas: number;
        visitas_encerradas: number;
        visitantes_admitidos: number;
      }[]
    >`select
      count(*) filter (where state='active')::int as ativas,
      count(*) filter (where state='closed')::int as fechadas,
      count(*) filter (where state='active' and updated_at>created_at+interval '1 second')::int as renovadas,
      (select count(*)::int from recreio.space_members where space_id=${mundo}::uuid) as membros,
      (select count(*)::int from recreio.game_sessions where space_id=${mundo}::uuid and ended_at is null) as sessoes_abertas,
      (select count(*)::int from recreio.world_visits where space_id=${mundo}::uuid and state='active') as visitas_ativas,
      (select count(*)::int from recreio.world_visits where space_id=${mundo}::uuid and state<>'active') as visitas_encerradas,
      (select count(*)::int from recreio.world_visit_sessions where space_id=${mundo}::uuid and admitted_at is not null and state='active') as visitantes_admitidos
      from recreio.world_host_presences where space_id=${mundo}::uuid`;
    if (!resultado) throw new Error("Agregação de presença não retornou resultado");
    return resultado;
  } finally {
    await db.end();
  }
}
