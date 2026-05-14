import { NextResponse } from "next/server";
import { listStates } from "@/features/turmas/repository";

export const runtime = "nodejs";

export async function GET() {
  const states = await listStates();
  return NextResponse.json(
    { states },
    {
      headers: {
        // States é IBGE (27 rows fixas) — referência praticamente imutável.
        // Cache mais longo: browser 1d, shared 1d, SWR 7d.
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
