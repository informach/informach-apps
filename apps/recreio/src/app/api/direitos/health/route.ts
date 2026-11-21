import { comRuntimeDoConsentimento } from "@/features/direitos/consentimento-runtime";
import { conferirAtualidadeDosDireitos } from "@/features/direitos/monitoramento-repository";
import { configuracaoDoMonitorDeDireitos } from "@/lib/rights-monitor-environment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const config = configuracaoDoMonitorDeDireitos(process.env);
    if (!config) return new Response(null, { status: 404, headers });
    if (await conferirAtualidadeDosDireitos(config)) {
      const disponivel = await comRuntimeDoConsentimento(async ({ storage, assinatura }) => {
        if (assinatura.livroId !== config.livroId) return false;
        const atual = await storage.lerCabecalho();
        return atual.documento.estado === "aberto" && atual.chaveId === assinatura.chaveAtiva;
      });
      if (disponivel) return Response.json({ status: "ready", app: "recreio" }, { headers });
    }
  } catch {
    // No identities, keys, provider responses or family/financial data.
  }
  return Response.json({ status: "unavailable" }, { status: 503, headers });
}
