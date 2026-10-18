/**
 * Helpers de URL/query-string. Mantidos puros + sem dependência de Next pra
 * facilitar unit test (chamados de qualquer feature/auth flow).
 */

/**
 * Valida e devolve um path interno seguro pra redirect após auth. Defesa
 * contra open redirect: aceita só path absolutos (`/...`), rejeita protocol-
 * relative (`//attacker.com/...`) e endpoints sensíveis (`/api/...`, `/login`).
 *
 * O fallback é o destino default (ex: `/dashboard`) quando o input é inválido
 * ou ausente.
 *
 * Uso típico:
 *   const nextPath = safeInternalPath(searchParams.next, "/dashboard");
 *   if (user) redirect(nextPath);
 */
const BACKSLASH = 0x5c;
const DELETE = 0x7f;

/** Caractere de controle (tab, quebra de linha, DEL) ou barra invertida. */
function isUnsafePathChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return code < 0x20 || code === DELETE || code === BACKSLASH;
}

export function safeInternalPath(value: string | string[] | undefined, fallback: string): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return fallback;
  // Rejeita absolutos não-internos: `https://...`, `//...`.
  if (!first.startsWith("/") || first.startsWith("//")) return fallback;
  // O navegador lê a barra invertida como barra e descarta tab e quebra de
  // linha: um `next` com barra invertida ou com `%09` antes da segunda barra
  // vira `//outro-site` na hora de navegar. Nenhum caminho do app tem esses
  // caracteres.
  if ([...first].some(isUnsafePathChar)) return fallback;
  // E a prova final: resolvido contra uma origem qualquer, continua nela.
  const origin = "http://interno.invalid";
  if (new URL(first, origin).origin !== origin) return fallback;
  // Rejeita endpoints sensíveis que causariam loop ou expor estado interno.
  if (first === "/login" || first.startsWith("/api/")) return fallback;
  return first;
}
