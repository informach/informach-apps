import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { INDEXAVEL, PAGINAS_PUBLICAS } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!INDEXAVEL) return [];
  return PAGINAS_PUBLICAS.map((caminho) => ({
    url: `${env.NEXT_PUBLIC_APP_URL}${caminho === "/" ? "" : caminho}`,
    changeFrequency: caminho === "/" ? "weekly" : "monthly",
    priority: caminho === "/" ? 1 : 0.5,
  }));
}
