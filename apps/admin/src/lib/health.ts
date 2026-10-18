import { checkSchemaReadiness } from "@informach/db";
import { envSchema } from "./env";

/** Configuração válida e banco pelo menos tão novo quanto este build. */
export async function readiness() {
  if (!envSchema.safeParse(process.env).success)
    return { ok: false, reason: "configuration_invalid" };
  return checkSchemaReadiness();
}
