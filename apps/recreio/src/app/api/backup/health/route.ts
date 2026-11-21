import { conferirAtualidadeDoBackup } from "@/features/backup/monitoramento-repository";
import { configuracaoDoMonitorDeBackup } from "@/lib/backup-monitor-environment";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const config = configuracaoDoMonitorDeBackup(process.env);
    if (!config) return new Response(null, { status: 404, headers });
    if (await conferirAtualidadeDoBackup(config))
      return Response.json({ status: "ready", app: "recreio" }, { headers });
  } catch {
    // Never return storage identities, keys, SQL or financial/family content.
  }
  return Response.json({ status: "unavailable" }, { status: 503, headers });
}
