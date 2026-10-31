export function GET() {
  return Response.json({
    app: "bora-treinar",
    status: "ok",
    deployment: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
  });
}
