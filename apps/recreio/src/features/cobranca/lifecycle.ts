import "server-only";
import { withDatabaseLockWait } from "@informach/db";

/** Coordena intenções, fatos comerciais e primeira sessão antes da transação.
 * A rede pode ocorrer sob este mutex de ciclo, nunca sob travas de linhas/TX.
 */
export function comCicloDeCobranca<T>(paganteId: string, executar: () => Promise<T>): Promise<T> {
  return withDatabaseLockWait(`recreio:billing:${paganteId}`, executar);
}
