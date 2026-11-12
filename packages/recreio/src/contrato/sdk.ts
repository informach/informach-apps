import { z } from "zod";
import { MembroIdSchema, MundoIdSchema, PerfilIdSchema } from "../dominio/ids";
import {
  ESTADOS_DE_MUNDO,
  FORMAS_DE_CONVITE,
  NOME_DE_MUNDO,
  PAPEIS_NO_MUNDO,
  PARTICIPACAO_MAX,
} from "../dominio/mundos";
import { ESTADOS_DE_ACESSO_LISTA } from "./acesso";

/**
 * API do SDK: o que o cliente de um jogo pede ao Recreio, do navegador. O SDK
 * não impõe React, Three.js nem WebSocket; serve a um jogo 2D de uma pessoa e
 * a um mundo 3D compartilhado.
 */

export const VERSAO_DA_API_DO_SDK = 1;
export const VERSAO_DO_SDK = "0.1.0";

const faixa = z.enum(["em_analise", "L", "6", "10", "12", "14", "16", "18"]);
const instanteIso = z.iso.datetime();

// --- Sessão ---

export const PedidoDeIngressoSchema = z.strictObject({ jogo: z.string().min(1).max(40) });
export const IngressoEmitidoSchema = z.strictObject({
  ingresso: z.string().min(1),
  expiraEm: instanteIso,
});

export const PerfilDoJogoSchema = z.strictObject({
  profileId: PerfilIdSchema,
  apelido: z.string(),
  avatar: z.string(),
});
export type PerfilDoJogo = z.infer<typeof PerfilDoJogoSchema>;

/** Para a interface do jogo. O servidor confere tudo de novo. */
export const PoliticaDoPerfilSchema = z.strictObject({
  multiplayer: z.boolean(),
  textoLivre: z.boolean(),
  faixa,
  versao: z.number().int().nonnegative(),
});
export type PoliticaDoPerfil = z.infer<typeof PoliticaDoPerfilSchema>;

export const TrocaDeIngressoSchema = z.strictObject({
  ingresso: z.string().min(1),
  /** Encerra a sessão aberta em outro aparelho e continua aqui. */
  continuarAqui: z.boolean().optional(),
});

export const SessaoAbertaSchema = z.strictObject({
  token: z.string().min(1),
  expiraEm: instanteIso,
  perfil: PerfilDoJogoSchema,
  politica: PoliticaDoPerfilSchema,
});
export type SessaoAberta = z.infer<typeof SessaoAbertaSchema>;

export const SessaoRenovadaSchema = z.strictObject({
  token: z.string().min(1),
  expiraEm: instanteIso,
});

export const RespostaDeErroSchema = z.object({
  codigo: z.string(),
  estado: z.enum(ESTADOS_DE_ACESSO_LISTA).optional(),
  motivo: z.string().optional(),
  detalhe: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});
export type RespostaDeErro = z.infer<typeof RespostaDeErroSchema>;

// --- Mundos ---

export const ResumoDeMundoSchema = z.strictObject({
  id: MundoIdSchema,
  nome: z.string(),
  papel: z.enum(PAPEIS_NO_MUNDO),
  estado: z.enum(ESTADOS_DE_MUNDO),
  membros: z.number().int().nonnegative(),
  politicaDeConteudo: z.string(),
  /** Alguém está jogando agora. */
  abertoAgora: z.boolean(),
  /** Definido pelo jogo na última fotografia; `null` em mundo que nunca abriu. */
  resumo: z.strictObject({ titulo: z.string(), subtitulo: z.string() }).nullable(),
  criadoEm: instanteIso,
});
export type ResumoDeMundo = z.infer<typeof ResumoDeMundoSchema>;

export const ListaDeMundosSchema = z.strictObject({ mundos: z.array(ResumoDeMundoSchema) });

export const NovoMundoSchema = z.strictObject({
  nome: z.string().trim().min(NOME_DE_MUNDO.min).max(NOME_DE_MUNDO.max),
  politicaDeConteudo: z.string().min(1).max(40).optional(),
});
export type NovoMundo = z.infer<typeof NovoMundoSchema>;

export const MundoRefSchema = z.strictObject({ id: MundoIdSchema, nome: z.string() });
export type MundoRef = z.infer<typeof MundoRefSchema>;

export const MundoAbertoSchema = z.strictObject({
  mundoId: MundoIdSchema,
  membroId: MembroIdSchema,
  papel: z.enum(PAPEIS_NO_MUNDO),
  onde: z.literal("servidor"),
  /** Endereço da instância que executa o mundo. */
  endereco: z.url(),
  schemaVersion: z.number().int().positive(),
  revisao: z.number().int().nonnegative(),
});
export type MundoAberto = z.infer<typeof MundoAbertoSchema>;

export const NovoConviteSchema = z.strictObject({
  forma: z.enum(FORMAS_DE_CONVITE),
  participacao: z.string().max(PARTICIPACAO_MAX).optional(),
});
export type NovoConvite = z.infer<typeof NovoConviteSchema>;

export const ConviteCriadoSchema = z.strictObject({
  /** Mostrado uma vez; o Recreio guarda só o resumo. */
  codigo: z.string(),
  expiraEm: instanteIso,
});
export type ConviteCriado = z.infer<typeof ConviteCriadoSchema>;

export const AceiteDeConviteSchema = z.strictObject({ codigo: z.string().min(1).max(32) });

// --- Contexto entregue ao jogo ---

export type MudancaDeAcesso = {
  /** O acesso caiu: o jogo salva o que puder e volta ao Recreio. */
  tipo: "perdido";
  codigo: string;
  estado?: string;
  motivo?: string;
};

export interface RecreioGameContext {
  perfil: PerfilDoJogo;
  politica: PoliticaDoPerfil;
  sessao: {
    /** Prazo da sessão atual, em ISO 8601. Muda a cada renovação. */
    readonly expiraEm: string;
    /** O token vigente, para o jogo levar ao próprio servidor. Nunca vai em URL. */
    token(): string;
    /** Avisa a cada renovação silenciosa. Devolve a função que cancela. */
    aoRenovar(ouvinte: (token: string) => void): () => void;
    aoMudarAcesso(ouvinte: (mudanca: MudancaDeAcesso) => void): () => void;
    /** Encerra a sessão de jogo. O jogo faz o checkpoint antes de chamar. */
    sair(): Promise<void>;
  };
  mundos: {
    listar(): Promise<ResumoDeMundo[]>;
    criar(opcoes: NovoMundo): Promise<MundoRef>;
    /** Obtém ou entra na posse do mundo e devolve onde ele está rodando. */
    abrir(id: string): Promise<MundoAberto>;
    convidar(id: string, convite: NovoConvite): Promise<ConviteCriado>;
  };
}
