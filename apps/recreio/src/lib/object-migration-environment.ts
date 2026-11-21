import { z } from "zod";
import { configuracaoDosObjetosDoProcesso } from "./object-environment";
import { contextoDeCustodiaPrivadaPermitido } from "./private-storage-context";

export class FalhaDoAmbienteDeMigracao extends Error {
  constructor() {
    super("Invalid snapshot migration configuration");
  }
}
/** Separate opt-in; read mode alone never grants a migration. */
export function configuracaoDaMigracaoDeFotografias(
  input: Readonly<Record<string, string | undefined>>,
) {
  const modo = input.RECREIO_OBJECTS_MIGRATION_MODE ?? "off";
  if (modo === "off") return null;
  if (modo !== "process") throw new FalhaDoAmbienteDeMigracao();
  const parsed = z
    .strictObject({
      backupId: z.uuid(),
      readerSource: z.string().regex(/^[a-f0-9]{40}$/),
      batch: z.coerce.number().int().min(1).max(100),
      timeoutSeconds: z.coerce.number().int().min(30).max(900),
      readerOrigin: z.url(),
    })
    .safeParse({
      backupId: input.RECREIO_OBJECTS_MIGRATION_BACKUP_ID,
      readerSource: input.RECREIO_OBJECTS_MIGRATION_READER_SOURCE,
      batch: input.RECREIO_OBJECTS_MIGRATION_BATCH ?? "10",
      timeoutSeconds: input.RECREIO_OBJECTS_MIGRATION_TIMEOUT_SECONDS ?? "300",
      readerOrigin: input.RECREIO_OBJECTS_MIGRATION_READER_ORIGIN,
    });
  if (!parsed.success) throw new FalhaDoAmbienteDeMigracao();
  let objetos: ReturnType<typeof configuracaoDosObjetosDoProcesso> | undefined;
  try {
    objetos = configuracaoDosObjetosDoProcesso(input);
    if (!objetos || !contextoDeCustodiaPrivadaPermitido(input, objetos.escopo))
      throw new FalhaDoAmbienteDeMigracao();
    const conexao = new URL(input.DATABASE_URL ?? "");
    if (
      !["postgres:", "postgresql:"].includes(conexao.protocol) ||
      !conexao.username ||
      !conexao.password ||
      conexao.hash ||
      [...conexao.searchParams.keys()].some((k) => k !== "sslmode")
    )
      throw new FalhaDoAmbienteDeMigracao();
    if (objetos.escopo === "qualification") {
      if (
        !["127.0.0.1", "localhost", "[::1]"].includes(conexao.hostname) ||
        !/^\/recreio_review_[a-f0-9]{32}$/.test(conexao.pathname) ||
        ![null, "disable"].includes(conexao.searchParams.get("sslmode"))
      )
        throw new FalhaDoAmbienteDeMigracao();
    } else if (
      !conexao.hostname.endsWith(".railway.internal") ||
      conexao.pathname !== "/railway" ||
      conexao.searchParams.get("sslmode") !== "require"
    )
      throw new FalhaDoAmbienteDeMigracao();
    // Postgres.js forwards non-client URL options in the startup packet. This
    // standalone pool bounds every delivery transaction, including lock waits.
    conexao.searchParams.set(
      "options",
      "-c statement_timeout=5000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=15000 -c transaction_timeout=30000",
    );
    const url = new URL(parsed.data.readerOrigin);
    const origem =
      objetos.escopo === "production"
        ? url.origin === "https://recreio.informach.com.br"
        : url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (!origem || url.pathname !== "/" || url.search || url.hash || url.username || url.password)
      throw new FalhaDoAmbienteDeMigracao();
    return { ...parsed.data, readerOrigin: url.origin, objetos, databaseUrl: conexao.href };
  } catch {
    if (objetos) for (const key of objetos.chaves.values()) key.fill(0);
    throw new FalhaDoAmbienteDeMigracao();
  }
}
