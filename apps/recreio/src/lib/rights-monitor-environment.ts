import { z } from "zod";

/** Operational target and age only. Custody itself uses the normal server-owned
 * runtime and its physical context policy; no HTTP parameter selects a book. */
export function configuracaoDoMonitorDeDireitos(
  input: Readonly<Record<string, string | undefined>>,
) {
  const mode = input.RECREIO_RIGHTS_MONITOR_MODE ?? "off";
  if (mode === "off") return null;
  if (mode !== "on") throw new Error("Invalid rights monitor configuration");
  const result = z
    .strictObject({
      livroId: z.uuid(),
      idadeMaximaSegundos: z.coerce.number().int().min(60).max(86400),
    })
    .safeParse({
      livroId: input.RECREIO_RIGHTS_LEDGER_ID,
      idadeMaximaSegundos: input.RECREIO_RIGHTS_MONITOR_MAX_AGE_SECONDS,
    });
  if (!result.success) throw new Error("Invalid rights monitor configuration");
  return result.data;
}
