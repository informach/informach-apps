import { pgSchema } from "drizzle-orm/pg-core";

/** Namespace sem dependências de tabelas: mantém os contratos de FK acíclicos. */
export const recreio = pgSchema("recreio");
