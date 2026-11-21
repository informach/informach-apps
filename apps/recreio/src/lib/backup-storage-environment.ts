import { z } from "zod";
import { configuracaoDosObjetosDoProcesso, objectEnvironmentSchema } from "./object-environment";
import { contextoDeCustodiaPrivadaPermitido } from "./private-storage-context";

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
  if (!contextoDeCustodiaPrivadaPermitido(input, scope))
    throw new Error("Invalid RECREIO_BACKUP process context");
}
