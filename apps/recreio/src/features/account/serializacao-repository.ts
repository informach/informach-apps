import "server-only";
import type { ContaId } from "@informach/recreio";
import { type Transacao, travar } from "@/lib/repository";

/** The shared account mutex is not login, identity or permission. Keep SQL
 * jobs on this primitive without loading browser authentication or app env. */
export async function serializarContaNativa(tx: Transacao, contaId: ContaId) {
  await travar(tx, `recreio:autoridade-nativa:${contaId}`);
}
