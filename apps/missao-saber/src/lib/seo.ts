/**
 * O app continua fora dos buscadores enquanto a família valida o produto
 * (PRODUCAO.md). Ligar aqui vira `index, follow` nos metadados, libera o
 * robots.txt e mantém o sitemap coerente, tudo de uma vez.
 */
export const INDEXAVEL = false;

export const PAGINAS_PUBLICAS = [
  "/",
  "/experimentar",
  "/sobre",
  "/termos",
  "/privacidade",
] as const;
