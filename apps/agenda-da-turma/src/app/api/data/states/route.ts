import { NextResponse } from "next/server";
import { listStates } from "@/features/turmas/repository";

export const runtime = "nodejs";

export async function GET() {
  const states = await listStates();
  return NextResponse.json(
    { states },
    {
      headers: {
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
