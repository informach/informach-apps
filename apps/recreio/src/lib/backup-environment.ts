import { z } from "zod";
import { configuracaoDosObjetosDoProcesso, objectEnvironmentSchema } from "./object-environment";

const PROJETO = "f4da4285-5b98-48b5-b03e-5be02f4e7c56";
const AMBIENTE = "174b2cb0-e1cd-410c-8764-d913e3af18d3";
export class FalhaDoAmbienteDeBackup extends Error {
  readonly codigo = "CONFIGURACAO";
  constructor() {
    super("recreio.backup_environment.CONFIGURACAO");
  }
}
const Limites = z.strictObject({
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
  intervaloSegundos: z.coerce.number().int().min(60).max(86400),
  retencaoDias: z.coerce.number().int().min(1).max(88),
  source: z.string().regex(/^[a-f0-9]{40}$/),
});
type Objetos = NonNullable<ReturnType<typeof configuracaoDosObjetosDoProcesso>>;

/** Standalone worker configuration. No login, implicit source, caller URL,
 * seed, live migration, key generation, custody bootstrap or default limits.
 * Uses the existing object configuration contract for both namespaces. */
export function configuracaoDoBackupDoProcesso(
  input: Readonly<Record<string, string | undefined>>,
) {
  const modo = input.RECREIO_BACKUP_MODE ?? "off";
  if (modo === "off") return null;
  const falhar = (): never => {
    throw new FalhaDoAmbienteDeBackup();
  };
  if (
    modo !== "native" ||
    input.BETTER_AUTH_SECRET ||
    input.SENDGRID_API_KEY ||
    input.STRIPE_SECRET_KEY
  )
    return falhar();
  let fotos: Objetos | undefined, arquivo: Objetos | undefined;
  try {
    fotos = configuracaoDosObjetosDoProcesso(input) ?? undefined;
    if (!fotos) return falhar();
    // The registered object schema is the single list of fields. Prefix
    // translation cannot accept an arbitrary endpoint/credential namespace.
    const vars = Object.fromEntries(
      Object.keys(objectEnvironmentSchema.shape).map((name) => [
        name,
        input[name.replace(/^RECREIO_OBJECTS_/, "RECREIO_BACKUP_")],
      ]),
    );
    vars.RECREIO_OBJECTS_MODE = "read";
    arquivo = configuracaoDosObjetosDoProcesso(vars) ?? undefined;
    if (!arquivo || fotos.escopo !== arquivo.escopo) return falhar();
    const qualification = arquivo.escopo === "qualification";
    const url = new URL(input.DATABASE_URL ?? "");
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.username ||
      !url.password ||
      url.hash ||
      url.href.length > 8192 ||
      [...url.searchParams.keys()].some((k) => k !== "sslmode") ||
      url.searchParams.get("sslmode") !== (qualification ? "disable" : "require")
    )
      return falhar();
    if (qualification) {
      if (
        input.CI !== "true" ||
        input.GITHUB_ACTIONS !== "true" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname)
      )
        return falhar();
    } else {
      if (
        input.RAILWAY_PROJECT_ID !== PROJETO ||
        input.RAILWAY_ENVIRONMENT_ID !== AMBIENTE ||
        !z.uuid().safeParse(input.RAILWAY_SERVICE_ID).success ||
        !/^[a-z0-9-]+\.railway\.internal$/.test(url.hostname) ||
        url.pathname !== "/railway" ||
        fotos.bucketId === arquivo.bucketId ||
        fotos.bucketName === arquivo.bucketName ||
        fotos.accessKeyId === arquivo.accessKeyId ||
        fotos.secretAccessKey === arquivo.secretAccessKey ||
        [...fotos.chaves.values()].some((a) =>
          [...arquivo.chaves.values()].some((b) => a.equals(b)),
        )
      )
        return falhar();
    }
    const limites = Limites.safeParse({
      tempoLimiteMs: input.RECREIO_BACKUP_TIMEOUT_MS,
      limiteBytes: input.RECREIO_BACKUP_MAX_BYTES,
      limiteFotografiaBytes: input.RECREIO_BACKUP_PHOTOGRAPH_MAX_BYTES,
      intervaloSegundos: input.RECREIO_BACKUP_MIN_INTERVAL_SECONDS,
      retencaoDias: input.RECREIO_BACKUP_RETENTION_DAYS,
      source: qualification ? input.GITHUB_SHA : input.RAILWAY_GIT_COMMIT_SHA,
    });
    if (!limites.success || limites.data.limiteFotografiaBytes > limites.data.limiteBytes)
      return falhar();
    return { ...limites.data, conexao: url.href, fotografias: fotos, arquivo };
  } catch {
    for (const config of [fotos, arquivo])
      for (const key of config?.chaves.values() ?? []) key.fill(0);
    return falhar();
  }
}
