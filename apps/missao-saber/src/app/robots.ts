import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { INDEXAVEL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: INDEXAVEL
      ? { userAgent: "*", allow: PUBLICAS, disallow: PRIVADAS }
      : { userAgent: "*", disallow: "/" },
    sitemap: INDEXAVEL ? `${env.NEXT_PUBLIC_APP_URL}/sitemap.xml` : undefined,
  };
}

const PUBLICAS = ["/", "/experimentar", "/sobre", "/termos", "/privacidade"];
/* Tudo o que é da família ou da criança fica fora, indexável ou não. */
const PRIVADAS = [
  "/hoje",
  "/jornada",
  "/missao/",
  "/caderno",
  "/historico",
  "/laboratorio",
  "/revisao",
  "/simulados",
  "/familia",
  "/manutencao",
  "/entrar",
  "/api/",
];
