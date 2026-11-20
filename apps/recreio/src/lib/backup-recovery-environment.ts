import { z } from "zod";
import {
  camposDeLimiteDoBackup,
  conferirContextoDoBackup,
  configuracaoDoArquivoDeBackup,
} from "./backup-storage-environment";

export class FalhaDoAmbienteDeRecuperacao extends Error {
  readonly codigo = "CONFIGURACAO";
  constructor() {
    super("recreio.backup_recovery_environment.CONFIGURACAO");
  }
}
const Config = z.strictObject({
  ...camposDeLimiteDoBackup,
  capturaId: z.uuid(),
  rodadas: z.coerce.number().int().min(1).max(2),
});

/** No original DB, object-store, login, mail or payment credentials. Only the
 * selected authenticated archive and an owned private restore are admitted. */
export function configuracaoDaRecuperacaoDoBackup(
  input: Readonly<Record<string, string | undefined>>,
) {
  const modo = input.RECREIO_BACKUP_MODE ?? "off";
  if (modo === "off") return null;
  const recusar = (): never => {
    throw new FalhaDoAmbienteDeRecuperacao();
  };
  if (
    modo !== "restore" ||
    [
      "DATABASE_URL",
      "RECREIO_BACKUP_DATABASE_URL",
      "PGHOST",
      "PGPORT",
      "PGUSER",
      "PGPASSWORD",
      "PGDATABASE",
      "PGSERVICE",
      "PGPASSFILE",
      "BETTER_AUTH_SECRET",
      "SENDGRID_API_KEY",
      "STRIPE_SECRET_KEY",
      "RECREIO_OBJECTS_ACCESS_KEY",
      "RECREIO_OBJECTS_SECRET_KEY",
      "RECREIO_OBJECTS_KEYS",
    ].some((key) => input[key])
  )
    return recusar();
  let arquivo: ReturnType<typeof configuracaoDoArquivoDeBackup> | undefined;
  try {
    arquivo = configuracaoDoArquivoDeBackup(input);
    conferirContextoDoBackup(input, arquivo.escopo);
    const parsed = Config.safeParse({
      capturaId: input.RECREIO_BACKUP_CAPTURE_ID,
      rodadas: input.RECREIO_BACKUP_RESTORE_ROUNDS ?? "1",
      tempoLimiteMs: input.RECREIO_BACKUP_TIMEOUT_MS,
      limiteBytes: input.RECREIO_BACKUP_MAX_BYTES,
      limiteFotografiaBytes: input.RECREIO_BACKUP_PHOTOGRAPH_MAX_BYTES,
    });
    if (!parsed.success || parsed.data.limiteFotografiaBytes > parsed.data.limiteBytes)
      return recusar();
    return { arquivo, ...parsed.data };
  } catch {
    for (const key of arquivo?.chaves.values() ?? []) key.fill(0);
    return recusar();
  }
}
