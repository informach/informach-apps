import { z } from "zod";

/**
 * Cada identificador tem a sua marca. Um `ContaId` nunca passa onde se espera
 * um `PerfilId`, mesmo os dois sendo texto: o jogo só conhece o perfil, e
 * confundir os dois é o primeiro risco crítico da proposta.
 */

/** Usuário do login compartilhado (`core.users.id`). Nunca chega ao jogo. */
export const ContaIdSchema = z.string().min(1).max(128).brand<"ContaId">();
export type ContaId = z.infer<typeof ContaIdSchema>;

/** UUID tem a mesma identidade nas duas caixas; PostgreSQL o devolve em minúsculas. */
export const UuidSchema = z.uuid().transform((id) => id.toLowerCase());

export const GrupoIdSchema = UuidSchema.brand<"GrupoId">();
export type GrupoId = z.infer<typeof GrupoIdSchema>;

/** Quem joga. Sobrevive a troca de aparelho, apelido, avatar e assinatura. */
export const PerfilIdSchema = UuidSchema.brand<"PerfilId">();
export type PerfilId = z.infer<typeof PerfilIdSchema>;

export const SessaoDeAparelhoIdSchema = UuidSchema.brand<"SessaoDeAparelhoId">();
export type SessaoDeAparelhoId = z.infer<typeof SessaoDeAparelhoIdSchema>;

/** `sid` da sessão de jogo. */
export const SessaoDeJogoIdSchema = UuidSchema.brand<"SessaoDeJogoId">();
export type SessaoDeJogoId = z.infer<typeof SessaoDeJogoIdSchema>;

/** Mundo (GameSpace): opaco e imutável. */
export const MundoIdSchema = UuidSchema.brand<"MundoId">();
export type MundoId = z.infer<typeof MundoIdSchema>;

/** Participação de um perfil em um mundo. É por mundo, não por perfil. */
export const MembroIdSchema = UuidSchema.brand<"MembroId">();
export type MembroId = z.infer<typeof MembroIdSchema>;

export const InstanciaIdSchema = UuidSchema.brand<"InstanciaId">();
export type InstanciaId = z.infer<typeof InstanciaIdSchema>;

export const ConviteIdSchema = UuidSchema.brand<"ConviteId">();
export type ConviteId = z.infer<typeof ConviteIdSchema>;
