/** Destinos internos aceitos depois do login; qualquer outro volta para a escolha de perfil. */
export function safeDestination(value: string | null | undefined, fallback = "/perfis") {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (value.startsWith("/api/") || value.startsWith("/entrar")) return fallback;
  return value.length > 300 ? fallback : value;
}
