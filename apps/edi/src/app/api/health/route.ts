export function GET() {
  return Response.json({
    app: "edi",
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    time: new Date().toISOString(),
  });
}
