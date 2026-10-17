/** Origem fictícia: só serve para comparar, e o resultado sai sem ela. */
const BASE = "https://bastidores.invalid";
const HOME = "/";

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Começo que o navegador lê como outro site: `//x`, `/\x` e variações. */
function looksLikeOtherHost(path: string): boolean {
  return path.startsWith("//") || path.startsWith("/\\") || path.startsWith("\\");
}

/**
 * Para onde voltar depois da entrada: só um caminho do próprio Bastidores.
 *
 * O texto passa pelo parser de URL contra uma origem fixa e só sai caminho,
 * busca e âncora, quando a origem continua a mesma. Antes e depois, recusa o que
 * um navegador poderia ler como outro site: caractere de controle (tab e quebra
 * de linha somem antes de o navegador seguir o endereço, e `/\t/x` vira `//x`),
 * barra dupla, barra invertida e as mesmas coisas escondidas em percent-encoding
 * (`/%2F%2Fx`, `/%09/x`). Qualquer dúvida volta para o painel.
 */
export function safeNext(value: string | string[] | null | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || next.length > 2048) return HOME;
  if (hasControlCharacter(next) || !next.startsWith("/") || looksLikeOtherHost(next)) return HOME;

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return HOME;
  }
  if (url.origin !== BASE) return HOME;

  const path = `${url.pathname}${url.search}${url.hash}`;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return HOME;
  }
  if (looksLikeOtherHost(path) || looksLikeOtherHost(decoded) || hasControlCharacter(decoded))
    return HOME;
  return path;
}
