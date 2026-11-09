/**
 * O app fica fora dos buscadores até a validação com as famílias (PRODUCAO.md).
 * Ligar aqui vira `index, follow` nos metadados, libera o robots.txt e mantém o
 * sitemap coerente, tudo de uma vez.
 */
export const INDEXAVEL = false;

export const PAGINAS_PUBLICAS = ["/", "/termos", "/privacidade"] as const;
