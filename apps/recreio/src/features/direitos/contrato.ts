import { PerfilIdSchema, type Supervisao } from "@informach/recreio";
import type { VersaoDeDadosHttp } from "@informach/recreio/contrato";
import { z } from "zod";

/** Recorte pessoal por jogo, inclusive um título que já saiu do catálogo. */
export const JogoPessoalIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const PedidoDeCopiaDoJogoSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  jogo: JogoPessoalIdSchema,
});
export const PedidoDeInventarioPessoalSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  apos: JogoPessoalIdSchema.nullable().default(null),
});
export type PedidoDeCopiaDoJogo = z.infer<typeof PedidoDeCopiaDoJogoSchema>;
export const PedidoDeCadastroPessoalSchema = z.strictObject({ perfilId: PerfilIdSchema });

export interface CopiaDoCadastroPessoal {
  formato: "recreio-cadastro-pessoal-v1";
  escopo: "cadastro-protecao-supervisao-preferencia-social";
  conferidoEm: string;
  perfil: {
    id: string;
    tipo: "adult" | "minor";
    apelido: string;
    avatar: string;
    estado: "active" | "suspended";
    criadoEm: string;
    atualizadoEm: string;
  };
  nascimento: { ano: number; mes: number } | null;
  responsabilidadeDeclarada: { versao: string; registradaEm: string; vinculadaEm: string } | null;
  supervisao: {
    configuracao: Supervisao;
    versaoEfetiva: number;
    versaoReconhecida: number;
    faixaSocial: string | null;
    faixaDeConteudo: string | null;
    calculadaEm: string | null;
    atualizadaEm: string;
  } | null;
  protecao: { pinDefinido: boolean; atualizadaEm: string } | null;
  preferenciaSocial: { presenca: "online" | "friends" | "invisible"; atualizadaEm: string } | null;
}

/** Este recorte não representa a exportação completa da conta ou de um mundo. */
export interface CopiaPessoalDoJogo {
  formato: "recreio-dados-pessoais-do-jogo-v1";
  escopo: "progresso-versoes-conflitos-conquistas";
  perfilId: string;
  jogo: string;
  conferidoEm: string;
  chaves: {
    chave: string;
    revisaoAtual: number;
    versoes: (VersaoDeDadosHttp & { sha256: string })[];
  }[];
  conquistas: { id: string; obtidaEm: string }[];
}
