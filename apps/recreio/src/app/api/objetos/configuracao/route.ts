import { configuracaoDosObjetosDoProcesso } from "@/lib/object-environment";
import { configuracaoPublicaDoLeitor } from "@/lib/object-reader-configuration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Reader deployment evidence, not a bucket/world health or access endpoint. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  let config: ReturnType<typeof configuracaoDosObjetosDoProcesso> | undefined;
  try {
    config = configuracaoDosObjetosDoProcesso(process.env);
    if (!config) return new Response(null, { status: 404, headers });
    return Response.json(
      configuracaoPublicaDoLeitor(config, process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA),
      { headers },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  } finally {
    if (config) for (const key of config.chaves.values()) key.fill(0);
  }
}
