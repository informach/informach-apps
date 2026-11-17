import { z } from "zod";

/** Only the account screen and its bounded selections survive a fresh login. */
export const accountQuerySchema = z.object({
  familia: z.uuid().optional(),
  pagamento: z.uuid().optional(),
  contratos: z.uuid().optional(),
  extrato: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  plano: z.enum(["mensal", "anual"]).optional(),
  privacidade: z.enum(["recente", "limite", "erro"]).optional(),
});
export function accountPath(query: z.infer<typeof accountQuerySchema>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  return params.size ? `/?${params}` : "/";
}
export function accountReturnDestination(value: unknown) {
  if (value === "/privacidade/encerramento") return value;
  if (typeof value !== "string" || value.length > 2048 || !/^\/(?:\?|#|$)/.test(value)) return "/";
  const url = new URL(value, "https://account.invalid");
  if (
    url.origin !== "https://account.invalid" ||
    url.pathname !== "/" ||
    (url.hash && !["#compasso", "#privacidade"].includes(url.hash))
  )
    return "/";
  if (
    [...new Set(url.searchParams.keys())].some((key) => url.searchParams.getAll(key).length !== 1)
  )
    return "/";
  const query = accountQuerySchema.strict().safeParse(Object.fromEntries(url.searchParams));
  return query.success ? `${accountPath(query.data)}${url.hash}` : "/";
}
