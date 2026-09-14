import { checkReadiness } from "@/features/operations/service";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await checkReadiness();
    return Response.json(
      { status: "ready", app: "missao-saber" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
