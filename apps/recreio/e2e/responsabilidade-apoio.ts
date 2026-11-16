import postgres from "postgres";

/** Somente metadados de login de contas sintéticas no banco descartável do E2E. */
export async function envelhecerLogin(email: string) {
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (
    !url ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname) ||
    process.env.RECREIO_ISOLATED_TEST !== "1" ||
    !/^recreio-[a-f0-9-]+@example\.test$/.test(email)
  )
    throw new Error("Fixture de login exige conta e banco descartáveis");
  const client = postgres(url.toString(), { max: 1 });
  try {
    const alteradas =
      await client`update core.sessions s set created_at=clock_timestamp()-interval '11 minutes'
      from core.users u where u.id=s.user_id and u.email=${email} returning s.id`;
    if (alteradas.length === 0) throw new Error("Login de prova ausente");
  } finally {
    await client.end();
  }
}
