import { z } from "zod";
import { configuracaoDosObjetosDoProcesso, objectEnvironmentSchema } from "./object-environment";

export const camposDeLimiteDoBackup = {
  tempoLimiteMs: z.coerce.number().int().min(1000).max(900000),
  limiteBytes: z.coerce
    .number()
    .int()
    .min(1024)
    .max(4 * 1024 ** 3 - 65536),
  limiteFotografiaBytes: z.coerce
    .number()
    .int()
    .min(1)
    .max(4 * 1024 ** 2),
};
/** Same registered storage contract in a separate credential namespace. */
export function configuracaoDoArquivoDeBackup(input: Readonly<Record<string, string | undefined>>) {
  const vars = Object.fromEntries(
    Object.keys(objectEnvironmentSchema.shape).map((name) => [
      name,
      input[name.replace(/^RECREIO_OBJECTS_/, "RECREIO_BACKUP_")],
    ]),
  );
  vars.RECREIO_OBJECTS_MODE = "read";
  const config = configuracaoDosObjetosDoProcesso(vars);
  if (!config) throw new Error("Invalid RECREIO_BACKUP storage configuration");
  return config;
}

export function conferirContextoDoBackup(
  input: Readonly<Record<string, string | undefined>>,
  scope: "production" | "qualification",
) {
  const permitido =
    scope === "qualification"
      ? input.CI === "true" && input.GITHUB_ACTIONS === "true"
      : input.RAILWAY_PROJECT_ID === "f4da4285-5b98-48b5-b03e-5be02f4e7c56" &&
        input.RAILWAY_ENVIRONMENT_ID === "174b2cb0-e1cd-410c-8764-d913e3af18d3" &&
        z.uuid().safeParse(input.RAILWAY_SERVICE_ID).success;
  if (!permitido) throw new Error("Invalid RECREIO_BACKUP process context");
}
