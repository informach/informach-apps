import type postgres from "postgres";
import { z } from "zod";
import { exigirBancoPrivadoDeRecuperacao, FalhaDaNormalizacao } from "./normalizar-fotografias";

/** Only derives a second owned connection from an actual verified private
 * Unix-socket cluster. Never accepts a URL, host or password from a caller and
 * never reads/changes DATABASE_URL or the source/default application's pool. */
export async function conferirClienteDaCopiaPrivada(copia: postgres.Sql) {
  const destino = await exigirBancoPrivadoDeRecuperacao(copia);
  const opcoes = z
    .object({
      host: z.tuple([z.string().regex(/^\/tmp\/recreio-backup-[A-Za-z0-9]+$/)]),
      port: z.tuple([z.literal(55432)]),
      database: z.string().regex(/^recreio_restore_[a-f0-9]{24}$/),
      user: z.string().min(1).max(63),
      pass: z.string().min(1),
    })
    .parse(copia.options);
  if (destino.banco !== opcoes.database || destino.socket !== opcoes.host[0])
    throw new FalhaDaNormalizacao("DESTINO_NAO_PRIVADO");
  return {
    destino,
    opcoes: Object.freeze({
      host: opcoes.host[0],
      port: opcoes.port[0],
      database: opcoes.database,
      username: opcoes.user,
      password: opcoes.pass,
      ssl: false as const,
    }),
  };
}
