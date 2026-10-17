/** Não toca o banco de propósito: responde qual versão está servindo mesmo num deploy ruim. */
export function GET() {
  return Response.json(
    {
      app: "admin",
      commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
