export function GET() {
  return Response.json({
    app: "missao-saber",
    status: "ok",
    deployment: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
  });
}
