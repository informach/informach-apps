import { z } from "zod";

/**
 * Cada identificador tem a sua marca. Um `ContaId` nunca passa onde se espera
 * um `PerfilId`, mesmo os dois sendo texto: o jogo só conhece o perfil, e
 * confundir os dois é o primeiro risco crítico da proposta.
 */

/** Usuário do login compartilhado (`core.users.id`). Nunca chega ao jogo. */
export const ContaIdSchema = z.string().min(1).max(128).brand<"ContaId">();
export type ContaId = z.infer<typeof ContaIdSchema>;

export const GrupoIdSchema = z.uuid().brand<"GrupoId">();
export type GrupoId = z.infer<typeof GrupoIdSchema>;

/** Quem joga. Sobrevive a troca de aparelho, apelido, avatar e assinatura. */
export const PerfilIdSchema = z.uuid().brand<"PerfilId">();
export type PerfilId = z.infer<typeof PerfilIdSchema>;

export const SessaoDeAparelhoIdSchema = z.uuid().brand<"SessaoDeAparelhoId">();
export type SessaoDeAparelhoId = z.infer<typeof SessaoDeAparelhoIdSchema>;

/** `sid` da sessão de jogo. */
export const SessaoDeJogoIdSchema = z.uuid().brand<"SessaoDeJogoId">();
export type SessaoDeJogoId = z.infer<typeof SessaoDeJogoIdSchema>;

/** Mundo (GameSpace): opaco e imutável. */
export const MundoIdSchema = z.uuid().brand<"MundoId">();
export type MundoId = z.infer<typeof MundoIdSchema>;

/** Participação de um perfil em um mundo. É por mundo, não por perfil. */
export const MembroIdSchema = z.uuid().brand<"MembroId">();
export type MembroId = z.infer<typeof MembroIdSchema>;

export const InstanciaIdSchema = z.uuid().brand<"InstanciaId">();
export type InstanciaId = z.infer<typeof InstanciaIdSchema>;

export const ConviteIdSchema = z.uuid().brand<"ConviteId">();
export type ConviteId = z.infer<typeof ConviteIdSchema>;
