import { z } from "zod";

const KeyId = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);
const Config = z.strictObject({
  scope: z.enum(["qualification", "production"]),
  livroId: z.uuid(),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  endpoint: z.url().refine((value) => {
    let u: URL;
    try {
      u = new URL(value);
    } catch {
      return false;
    }
    return (
      u.protocol === "https:" &&
      !u.port &&
      u.pathname === "/" &&
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password &&
      (/^[a-z0-9-]+\.storageapi\.dev$/.test(u.hostname) ||
        /^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(u.hostname))
    );
  }),
  region: z.string().regex(/^[a-z0-9-]{1,40}$/),
  pathStyle: z.enum(["0", "1"]),
  accessKeyId: z.string().min(1).max(256),
  secretAccessKey: z.string().min(1).max(256),
  chaveAtiva: KeyId,
  keyring: z
    .array(z.tuple([KeyId, z.string().regex(/^[A-Za-z0-9+/]{43}=$/)]))
    .min(1)
    .max(16),
  politica: z.literal("retirar-textos-fundacao-v1"),
});

/** Entrada exclusiva do executor. Erros constantes, sem serializar issues ou
 * valores. Chaves em pares rotulados: JSON não pode ocultar um label duplicado
 * por sobrescrita de propriedade. Nunca inicializa um livro ausente. */
export function configuracaoDosDireitosDoProcesso(
  input: Readonly<Record<string, string | undefined>>,
) {
  const falhar = (): never => {
    throw new Error("Invalid RECREIO_RIGHTS configuration");
  };
  const mode = input.RECREIO_RIGHTS_MODE ?? "off";
  if (mode === "off") return null;
  if (mode !== "process") return falhar();
  const bruto = input.RECREIO_RIGHTS_KEYRING;
  if (!bruto || bruto.length > 4096) return falhar();
  let keyring: unknown;
  try {
    keyring = JSON.parse(bruto);
  } catch {
    return falhar();
  }
  const r = Config.safeParse({
    scope: input.RECREIO_RIGHTS_SCOPE,
    livroId: input.RECREIO_RIGHTS_LEDGER_ID,
    bucket: input.RECREIO_RIGHTS_BUCKET,
    endpoint: input.RECREIO_RIGHTS_ENDPOINT,
    region: input.RECREIO_RIGHTS_REGION,
    pathStyle: input.RECREIO_RIGHTS_PATH_STYLE,
    accessKeyId: input.RECREIO_RIGHTS_ACCESS_KEY,
    secretAccessKey: input.RECREIO_RIGHTS_SECRET_KEY,
    chaveAtiva: input.RECREIO_RIGHTS_ACTIVE_KEY,
    keyring,
    politica: input.RECREIO_RIGHTS_POLICY,
  });
  if (!r.success) return falhar();
  const v = r.data,
    ids = new Set(v.keyring.map(([id]) => id)),
    values = new Set(v.keyring.map(([, value]) => value));
  const qualification =
    v.bucket === "recreio-homologacao" || v.bucket.startsWith("recreio-homologacao-");
  if (
    ids.size !== v.keyring.length ||
    values.size !== v.keyring.length ||
    !ids.has(v.chaveAtiva) ||
    (v.scope === "qualification") !== qualification ||
    v.keyring.some(([, key]) => Buffer.from(key, "base64").toString("base64") !== key)
  )
    return falhar();
  const { keyring: entradas, ...config } = v;
  return {
    ...config,
    pathStyle: v.pathStyle === "1",
    chaves: new Map(entradas.map(([id, value]) => [id, Buffer.from(value, "base64")])),
  };
}
