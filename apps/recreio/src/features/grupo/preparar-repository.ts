import "server-only";
import { eq } from "@informach/db";
import { recreioGroups as groups } from "@informach/db/schema";
import { GrupoIdSchema } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
  serializarContaNativa,
} from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { admitirGrupoDoTitular } from "./autoridade-repository";

/** A tentativa seguinte precisa descobrir todos os mutexes antes de tomá-los. */
export class GrupoCriadoDuranteEspera extends Error {
  constructor() {
    super("recreio.group.created_while_waiting");
  }
}

/** Preparar um grupo não cadastra jogador nem inicia teste/cobrança. */
export async function prepararGrupoParaConvite(tx: Transacao, autor: AutorNativoRecente) {
  const [pista] = await tx
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.ownerUserId, autor.contaId));
  if (pista) {
    const atual = await admitirGrupoDoTitular(tx, autor, GrupoIdSchema.parse(pista.id), "share");
    await atual.nativa.conferirPrazo(autor.login);
    return { nativa: atual.nativa, grupoId: GrupoIdSchema.parse(atual.grupo.id) };
  }
  await serializarContaNativa(tx, autor.contaId);
  const nativa = await autorizarContaNativa(tx, autor);
  const [criadoEnquantoEsperava] = await tx
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.ownerUserId, autor.contaId));
  if (criadoEnquantoEsperava) throw new GrupoCriadoDuranteEspera();
  await nativa.conferirPrazo(autor.login);
  const [grupo] = await tx
    .insert(groups)
    .values({ ownerUserId: autor.contaId })
    .returning({ id: groups.id });
  assertAllowed(grupo, "GRUPO", "Não foi possível preparar o grupo.");
  // O criador conserva o mutex nativo: ninguém pode anexar membros neste intervalo.
  return { nativa, grupoId: GrupoIdSchema.parse(grupo.id) };
}
