/**
 * O Recreio fica fora dos buscadores enquanto o acesso é fechado. Ligar aqui
 * vira `index, follow` nos metadados, libera o robots.txt e mantém o sitemap
 * coerente, tudo de uma vez. É uma decisão separada de `RECREIO_ACCESS_MODE`:
 * abrir o acesso não publica o site nos buscadores sozinho.
 */
export const INDEXAVEL = false;

export const PAGINAS_PUBLICAS = ["/", "/termos", "/privacidade"] as const;
