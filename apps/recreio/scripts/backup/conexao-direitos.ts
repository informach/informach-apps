import { createDatabaseConnection, type Database, sql } from "@informach/db";
import type postgres from "postgres";
import { conferirClienteDaCopiaPrivada } from "./conexao-privada";
import { FalhaDaNormalizacao } from "./normalizar-fotografias";

/** Dedicated native repository connection derived ONLY from the already owned
 * private cluster. Never reads or changes DATABASE_URL, closes the server pool,
 * changes the existing raw client's parsers or falls back to TCP/auth defaults.
 * This connection is not consent, financial proof or admission of F7 effects. */
export async function comConexaoPrivadaDeDireitos<T>(
  copia: postgres.Sql,
  executar: (banco: Database) => Promise<T>,
) {
  const { opcoes, destino } = await conferirClienteDaCopiaPrivada(copia);
  const conexao = createDatabaseConnection(opcoes);
  let resultado: { ok: true; valor: T } | { ok: false; erro: unknown };
  try {
    const [prova] = await conexao.db.execute<{
      banco: string;
      socket: string;
      porta: string;
      rede: string;
      local: boolean;
      versao: string;
    }>(sql`select
      pg_catalog.current_database() as banco,
      pg_catalog.current_setting('unix_socket_directories') as socket,
      pg_catalog.current_setting('port') as porta,
      pg_catalog.current_setting('listen_addresses') as rede,
      pg_catalog.inet_server_addr() is null as local,
      pg_catalog.current_setting('server_version_num') as versao`);
    if (
      !prova ||
      prova.banco !== destino.banco ||
      prova.socket !== destino.socket ||
      prova.porta !== destino.porta ||
      prova.rede !== "" ||
      !prova.local ||
      prova.versao !== destino.versao
    )
      throw new FalhaDaNormalizacao("DESTINO_NAO_PRIVADO");
    resultado = { ok: true, valor: await executar(conexao.db) };
  } catch (erro) {
    resultado = { ok: false, erro };
  }
  try {
    await conexao.close();
  } catch (erro) {
    if (!resultado.ok)
      throw new AggregateError(
        [resultado.erro, erro],
        "Private rights connection and cleanup failed",
      );
    throw erro;
  }
  if (!resultado.ok) throw resultado.erro;
  return resultado.valor;
}
