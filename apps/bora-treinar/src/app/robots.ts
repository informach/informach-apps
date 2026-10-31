import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { INDEXAVEL, PAGINAS_PUBLICAS } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: INDEXAVEL
      ? { userAgent: "*", allow: [...PAGINAS_PUBLICAS], disallow: PRIVADAS }
      : { userAgent: "*", disallow: "/" },
    sitemap: INDEXAVEL ? `${env.NEXT_PUBLIC_APP_URL}/sitemap.xml` : undefined,
  };
}

/* Tudo o que é da família fica fora, indexável ou não. */
const PRIVADAS = [
  "/perfis",
  "/inicio",
  "/exercicios",
  "/treinos",
  "/treinar",
  "/resumo",
  "/progresso",
  "/meus-treinos",
  "/desafios",
  "/conta",
  "/camera",
  "/entrar",
  "/api/",
];
