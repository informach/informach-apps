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
export function safeInternalPath(value: string | string[] | undefined, fallback: string): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return fallback;
  // Rejeita absolutos não-internos: `https://...`, `//...`.
  if (!first.startsWith("/") || first.startsWith("//")) return fallback;
  // Rejeita endpoints sensíveis que causariam loop ou expor estado interno.
  if (first === "/login" || first.startsWith("/api/")) return fallback;
  return first;
}
