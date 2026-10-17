/** Origem fictícia: só serve para comparar, e o resultado sai sem ela. */
const BASE = "https://bastidores.invalid";
const HOME = "/";
/** Para onde vai um `next` que apontava para uma rota de API. */
const AUDIT = "/auditoria";

/**
 * Marca da ficha aberta pelo `next` da entrada. A navegação depois da senha e
 * do código sai da própria tela de entrada (`Sec-Fetch-Site: same-origin`), mas
 * quem escolheu o destino foi o link de fora que levou até ela; a página da
 * ficha trata a marca como navegação de fora e pergunta antes de gravar.
 */
export const FICHA_CONFIRM_PARAM = "confirmar";

/** Ficha de uma pessoa: `/pessoas/<id>`, com ou sem barra no fim. */
const FICHA_PATH = /^\/pessoas\/[^/]+\/?$/;

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
 *
 * Duas regras a mais, porque a navegação depois da entrada sai de dentro do
 * Bastidores e passaria pelas travas de `Sec-Fetch-Site`: rota de API nunca é
 * destino (um link para `/api/auditoria/export` exportaria e gravaria sem
 * clique), e volta para a tela da Auditoria; a ficha ganha a marca
 * `FICHA_CONFIRM_PARAM`, e a página pergunta antes de abrir e gravar a consulta.
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

  // O roteamento compara o caminho já decodificado: `/%61pi/...` também é API.
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    return HOME;
  }
  if (pathname === "/api" || pathname.startsWith("/api/")) return AUDIT;
  if (FICHA_PATH.test(pathname)) {
    url.searchParams.set(FICHA_CONFIRM_PARAM, "1");
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return path;
}

/** A ficha chegou pelo `next` da entrada, e não por um clique de dentro. */
export function cameFromSignInNext(
  searchParams: Record<string, string | string[] | undefined>,
): boolean {
  return searchParams[FICHA_CONFIRM_PARAM] !== undefined;
}
