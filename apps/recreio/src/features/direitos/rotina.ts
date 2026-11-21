import { IdDoLivroSchema } from "./livro/contrato";

/** Stable per custody, never per family/person/request. A heartbeat for another
 * ledger cannot hide an absent executor for the configured one. */
export function nomeDaRotinaDeDireitos(livroId: string) {
  const id = IdDoLivroSchema.safeParse(livroId);
  if (!id.success) throw new Error("Invalid rights job identity");
  return `direitos:${id.data.toLowerCase()}`;
}
