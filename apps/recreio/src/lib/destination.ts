/** Destinos internos aceitos depois do login; qualquer outro volta para a estante. */
export function safeDestination(value: unknown, fallback = "/estante") {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return fallback;
  if (value.startsWith("/api/") || value.startsWith("/entrar")) return fallback;
  return value.length > 300 ? fallback : value;
}
