export function GET() {
  return Response.json(
    { ok: true, app: "conta", commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
