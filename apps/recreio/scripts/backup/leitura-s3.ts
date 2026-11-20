import type { S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";

/** Additional code capability boundary, not a claim that the provider issued
 * a read-only IAM key. No list, write or cross-capture GET can be signed by
 * this recovery client. Counters contain no object keys or credentials. */
export function limitarClienteALeituraDaCaptura(
  cliente: S3Client,
  config: { bucket: string; capturaId: string },
) {
  const parsed = z
    .strictObject({
      bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
      capturaId: z.uuid(),
    })
    .safeParse(config);
  if (!parsed.success) throw new Error("BACKUP_READ_BOUNDARY_CONFIGURATION");
  const key = new RegExp(
    `^recreio/v1/backup/${parsed.data.capturaId}/(manifesto[.]json|retirado[.]json|[a-f0-9]{64})$`,
  );
  const Input = z.object({ Bucket: z.literal(parsed.data.bucket), Key: z.string().regex(key) });
  let requisicoes = 0;
  cliente.middlewareStack.add(
    (next, context) => async (args) => {
      if (context.commandName !== "GetObjectCommand" || !Input.safeParse(args.input).success)
        throw new Error("BACKUP_RECOVERY_COMMAND_REFUSED");
      requisicoes++;
      return next(args);
    },
    { step: "initialize", name: "recreioPrivateRecoveryReadBoundary" },
  );
  return Object.freeze({ requisicoes: () => requisicoes });
}
