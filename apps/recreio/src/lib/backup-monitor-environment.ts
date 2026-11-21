import { z } from "zod";
import { DestinoDeCapturaSchema } from "@/features/backup/contrato";
import { conferirContextoDoBackup } from "./backup-storage-environment";

/** Monitoring receives destination identities, never archive credentials or keys. */
export function configuracaoDoMonitorDeBackup(input: Readonly<Record<string, string | undefined>>) {
  const modo = input.RECREIO_BACKUP_MONITOR_MODE;
  if (modo === undefined || modo === "off") return null;
  if (modo !== "on") throw new Error("Invalid backup monitor mode");
  const destino = (prefixo: string) =>
    DestinoDeCapturaSchema.parse({
      bucketId: input[`${prefixo}_BUCKET_ID`],
      bucketName: input[`${prefixo}_BUCKET`],
      escopo: input[`${prefixo}_SCOPE`],
    });
  const fotografias = destino("RECREIO_OBJECTS"),
    arquivos = destino("RECREIO_BACKUP");
  if (fotografias.escopo !== arquivos.escopo || fotografias.bucketId === arquivos.bucketId)
    throw new Error("Invalid backup monitor destinations");
  conferirContextoDoBackup(input, arquivos.escopo);
  return {
    fotografias,
    arquivos,
    idadeMaximaSegundos: z.coerce
      .number()
      .int()
      .min(60)
      .max(86400)
      .parse(input.RECREIO_BACKUP_MONITOR_MAX_AGE_SECONDS),
  };
}
