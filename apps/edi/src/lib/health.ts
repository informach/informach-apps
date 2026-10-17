import { checkSchemaReadiness } from "@informach/db";
import { envSchema } from "./env";
export async function readiness() {
  if (!envSchema.safeParse(process.env).success)
    return { ok: false, reason: "configuration_invalid" };
  return checkSchemaReadiness();
}
