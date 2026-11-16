import postgres from "postgres";

/** Estado anterior da jornada, somente no banco descartável obrigatório do E2E. */
export async function prepararParticipacoesAfastadas(email: string, mundos: string[]) {
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (
    !url ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname) ||
    process.env.RECREIO_ISOLATED_TEST !== "1" ||
    !/^recreio-[a-f0-9-]+@example\.test$/.test(email)
  )
    throw new Error("Fixture de participações exige conta e banco descartáveis");
  const client = postgres(url.toString(), { max: 1 });
  try {
    for (const mundo of mundos) {
      const linhas = await client`insert into recreio.space_members
        (space_id, profile_id, role, state, invited_by_member_id)
        select ${mundo}::uuid, p.id, 'member', 'away', responsavel.id
        from recreio.profiles p join core.users u on u.id=p.user_id
        cross join recreio.space_members responsavel
        where u.email=${email} and p.kind='adult' and p.status='active'
          and responsavel.space_id=${mundo}::uuid and responsavel.role='steward'
          and responsavel.state='active'
        returning id`;
      if (linhas.length !== 1) throw new Error("Participação de prova não foi preparada");
    }
  } finally {
    await client.end();
  }
}
