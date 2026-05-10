import { NextResponse } from "next/server";
import { searchSchoolsInCity } from "@/features/turmas/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cityIbge = url.searchParams.get("cityIbge");
  const q = url.searchParams.get("q") ?? undefined;
  if (!cityIbge || !/^\d{4,7}$/.test(cityIbge)) {
    return NextResponse.json({ error: "invalid_city_ibge" }, { status: 400 });
  }
  const schools = await searchSchoolsInCity(cityIbge, q ?? undefined, 50);
  return NextResponse.json(
    { schools },
    {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=900",
      },
    },
  );
}
