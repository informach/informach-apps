import { NextResponse } from "next/server";
import { searchCitiesInState } from "@/features/turmas/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const q = url.searchParams.get("q") ?? undefined;
  if (!state || !/^[A-Z]{2}$/.test(state)) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }
  const cities = await searchCitiesInState(state, q ?? undefined, 50);
  return NextResponse.json(
    { cities },
    {
      headers: {
        "Cache-Control": "private, max-age=600, stale-while-revalidate=3600",
      },
    },
  );
}
