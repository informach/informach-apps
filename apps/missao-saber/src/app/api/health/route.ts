export function GET() {
  return Response.json({
    app: "missao-saber",
    status: "ok",
    deployment: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
  });
}
