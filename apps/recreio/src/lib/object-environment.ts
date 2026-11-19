import { z } from "zod";

/** Apenas leitura nesta etapa. Não existe modo que autorize migrar fotografias. */
export const objectEnvironmentSchema = z.object({
  RECREIO_OBJECTS_MODE: z.enum(["off", "read"]).default("off"),
  RECREIO_OBJECTS_SCOPE: z.enum(["qualification", "production"]).optional(),
  RECREIO_OBJECTS_BUCKET_ID: z.uuid().optional(),
  RECREIO_OBJECTS_BUCKET: z.string().optional(),
  RECREIO_OBJECTS_ENDPOINT: z.string().optional(),
  RECREIO_OBJECTS_REGION: z.string().optional(),
  RECREIO_OBJECTS_PATH_STYLE: z.enum(["0", "1"]).optional(),
  RECREIO_OBJECTS_ACCESS_KEY: z.string().optional(),
  RECREIO_OBJECTS_SECRET_KEY: z.string().optional(),
  RECREIO_OBJECTS_ACTIVE_KEY: z.string().optional(),
  RECREIO_OBJECTS_KEYS: z.string().optional(),
});
type Variables = z.infer<typeof objectEnvironmentSchema>;

/** Composição operacional usa só suas variáveis, sem exigir login/e-mail do Next. */
export function configuracaoDosObjetosDoProcesso(
  input: Readonly<Record<string, string | undefined>>,
) {
  const lida = objectEnvironmentSchema.safeParse(input);
  if (!lida.success) throw new Error("Invalid RECREIO_OBJECTS configuration");
  return configuracaoDosObjetos(lida.data);
}

const ConfigSchema = z.strictObject({
  bucketId: z.uuid(),
  bucketName: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  escopo: z.enum(["qualification", "production"]),
  endpoint: z.url().refine((valor) => {
    const url = new URL(valor);
    return (
      url.protocol === "https:" &&
      /^[a-z0-9-]+\.storageapi\.dev$/.test(url.hostname) &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  }),
  region: z.string().regex(/^[a-z0-9-]{1,40}$/),
  pathStyle: z.enum(["0", "1"]),
  accessKeyId: z.string().min(1).max(256),
  secretAccessKey: z.string().min(1).max(256),
  chaveAtiva: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  chaves: z.record(
    z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
    z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
  ),
});

/** Erros sempre constantes: nunca serializar issues/valores de credenciais. */
export function configuracaoDosObjetos(variaveis: Variables) {
  if (variaveis.RECREIO_OBJECTS_MODE === "off") return null;
  const falhar = (): never => {
    throw new Error("Invalid RECREIO_OBJECTS configuration");
  };
  const bruto = variaveis.RECREIO_OBJECTS_KEYS;
  if (!bruto || bruto.length > 4096) return falhar();
  let chaves: unknown;
  try {
    chaves = JSON.parse(bruto);
  } catch {
    return falhar();
  }
  const config = ConfigSchema.safeParse({
    bucketId: variaveis.RECREIO_OBJECTS_BUCKET_ID,
    bucketName: variaveis.RECREIO_OBJECTS_BUCKET,
    escopo: variaveis.RECREIO_OBJECTS_SCOPE,
    endpoint: variaveis.RECREIO_OBJECTS_ENDPOINT,
    region: variaveis.RECREIO_OBJECTS_REGION,
    pathStyle: variaveis.RECREIO_OBJECTS_PATH_STYLE,
    accessKeyId: variaveis.RECREIO_OBJECTS_ACCESS_KEY,
    secretAccessKey: variaveis.RECREIO_OBJECTS_SECRET_KEY,
    chaveAtiva: variaveis.RECREIO_OBJECTS_ACTIVE_KEY,
    chaves,
  });
  if (!config.success) return falhar();
  const valor = config.data;
  const entradas = Object.entries(valor.chaves);
  if (
    entradas.length < 1 ||
    entradas.length > 16 ||
    !Object.hasOwn(valor.chaves, valor.chaveAtiva) ||
    entradas.some(
      ([, v]) =>
        Buffer.from(v, "base64").length !== 32 || Buffer.from(v, "base64").toString("base64") !== v,
    ) ||
    (valor.escopo === "qualification") !== valor.bucketName.startsWith("recreio-homologacao-")
  )
    return falhar();
  return {
    ...valor,
    chaves: new Map(entradas.map(([id, v]) => [id, Buffer.from(v, "base64")])),
    pathStyle: valor.pathStyle === "1",
  };
}
