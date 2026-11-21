import { z } from "zod";
import type { configuracaoDosObjetosDoProcesso } from "./object-environment";

export const ConfiguracaoPublicaDoLeitorSchema = z.strictObject({
  status: z.literal("ready"),
  app: z.literal("recreio"),
  source: z.string().regex(/^[a-f0-9]{40}$/),
  reader: z.strictObject({
    scope: z.enum(["qualification", "production"]),
    bucketId: z.uuid(),
    activeKey: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
    keys: z
      .array(z.string().regex(/^[A-Za-z0-9._-]{1,64}$/))
      .min(1)
      .max(16),
  }),
});
/** Configuration evidence only. Never returns key material or an object path. */
export function configuracaoPublicaDoLeitor(
  config: NonNullable<ReturnType<typeof configuracaoDosObjetosDoProcesso>>,
  source: unknown,
) {
  const result = ConfiguracaoPublicaDoLeitorSchema.safeParse({
    status: "ready",
    app: "recreio",
    source,
    reader: {
      scope: config.escopo,
      bucketId: config.bucketId,
      activeKey: config.chaveAtiva,
      keys: [...config.chaves.keys()].sort(),
    },
  });
  if (!result.success) throw new Error("Invalid object reader configuration");
  return result.data;
}
