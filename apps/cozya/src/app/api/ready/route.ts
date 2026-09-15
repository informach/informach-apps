import { NextResponse } from "next/server";
import { checkReadiness } from "@/features/operations/service";

/**
 * O portão de deploy: este processo pode receber tráfego?
 *
 * Separado de `/api/health` de propósito. O health responde qual commit está
 * servindo, e precisa responder justamente quando um deploy dá errado — se ele
 * falhasse junto, a informação sumiria na hora em que ela é necessária. Quem o
 * Railway consulta para liberar a instância é este.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const schema = await checkReadiness();
  const body = {
    status: schema.ok ? "ready" : "unavailable",
    app: "cozya",
    ...(schema.ok ? {} : { reason: schema.reason }),
    schema: { expected: schema.expected, applied: schema.applied },
  };
  return NextResponse.json(body, {
    status: schema.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
