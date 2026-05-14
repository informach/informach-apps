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
        // Schools são INEP (atualiza 1×/ano) — referência imutável. `public`
        // libera Cache em CDN/edge entre usuários. `s-maxage` controla shared
        // cache (1h), `max-age` o browser local (15min). SWR longo (1d) evita
        // origem em hits frios.
        "Cache-Control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
