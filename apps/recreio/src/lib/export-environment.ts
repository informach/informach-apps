import { z } from "zod";

const Chave = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);
const Config = z.strictObject({
  chaveAtiva: Chave,
  entradas: z
    .array(z.tuple([Chave, z.string().regex(/^[A-Za-z0-9+/]{43}=$/)]))
    .min(1)
    .max(16),
});

/** Custódia própria do artefato; não reutiliza segredo de login, token do jogo,
 * livro de retirada ou chave de backup. Erros não incluem entrada/valores. */
export function configuracaoDaExportacao(input: Readonly<Record<string, string | undefined>>) {
  const modo = input.RECREIO_EXPORT_MODE ?? "off";
  if (modo === "off") return null;
  const falhar = (): never => {
    throw new Error("Invalid RECREIO_EXPORT configuration");
  };
  if (modo !== "native") return falhar();
  const bruto = input.RECREIO_EXPORT_KEYRING;
  if (!bruto || bruto.length > 4096) return falhar();
  let entradas: unknown;
  try {
    entradas = JSON.parse(bruto);
  } catch {
    return falhar();
  }
  const r = Config.safeParse({ chaveAtiva: input.RECREIO_EXPORT_ACTIVE_KEY, entradas });
  if (!r.success) return falhar();
  const c = r.data;
  if (
    new Set(c.entradas.map(([id]) => id)).size !== c.entradas.length ||
    new Set(c.entradas.map(([, key]) => key)).size !== c.entradas.length ||
    !c.entradas.some(([id]) => id === c.chaveAtiva) ||
    c.entradas.some(([, key]) => Buffer.from(key, "base64").toString("base64") !== key)
  )
    return falhar();
  return {
    chaveAtiva: c.chaveAtiva,
    chaves: new Map(c.entradas.map(([id, key]) => [id, Buffer.from(key, "base64")])),
  };
}
