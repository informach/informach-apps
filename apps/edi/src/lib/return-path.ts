/**
 * Internal destinations accepted after sign-in. Only exact known paths pass, so a
 * crafted `next` can never send someone to another site or an unexpected route.
 */
const RETURN_PATHS = [
  "/conta",
  "/conta?plano=mensal",
  "/conta?plano=anual",
  "/conectar",
  "/downloads",
] as const;

export type ReturnPath = (typeof RETURN_PATHS)[number];

export function safeReturnPath(value: unknown): ReturnPath {
  return RETURN_PATHS.find((path) => path === value) ?? "/conta";
}
