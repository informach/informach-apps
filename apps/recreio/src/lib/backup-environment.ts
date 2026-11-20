import { z } from "zod";
import {
  camposDeLimiteDoBackup,
  conferirContextoDoBackup,
  configuracaoDoArquivoDeBackup,
} from "./backup-storage-environment";
import { configuracaoDosObjetosDoProcesso } from "./object-environment";

export class FalhaDoAmbienteDeBackup extends Error {
  readonly codigo = "CONFIGURACAO";
  constructor() {
    super("recreio.backup_environment.CONFIGURACAO");
  }
}
const Limites = z.strictObject({
  ...camposDeLimiteDoBackup,
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
    arquivo = configuracaoDoArquivoDeBackup(input);
    if (!arquivo || fotos.escopo !== arquivo.escopo) return falhar();
    const materiaisDoArquivo = [...arquivo.chaves.values()];
    conferirContextoDoBackup(input, arquivo.escopo);
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
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname)
      )
        return falhar();
    } else {
      if (
        !/^[a-z0-9-]+\.railway\.internal$/.test(url.hostname) ||
        url.pathname !== "/railway" ||
        fotos.bucketId === arquivo.bucketId ||
        fotos.bucketName === arquivo.bucketName ||
        fotos.accessKeyId === arquivo.accessKeyId ||
        fotos.secretAccessKey === arquivo.secretAccessKey ||
        [...fotos.chaves.values()].some((a) => materiaisDoArquivo.some((b) => a.equals(b)))
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
