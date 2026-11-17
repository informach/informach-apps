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
import type { DadosDoPerfil } from "./dados";

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
  /** Prova para recuperar a mesma abertura; nunca reabre ou renova outro SID. */
  chaveDeTroca: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
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

/** Estado de controle, sem agenda, nascimento ou identidade da conta. Não renova a sessão. */
export const ControleDaSessaoSchema = z.strictObject({
  agora: instanteIso,
  expiraEm: instanteIso,
  pausada: z.boolean(),
  tempo: z
    .strictObject({
      usadoHojeMs: z.number().int().min(0).max(172800000),
      limiteDiarioMinutos: z.number().int().min(1).max(1440).nullable(),
      saldoMs: z.number().int().min(0).max(86400000).nullable(),
      pausaEm: instanteIso.nullable(),
      motivo: z.enum(["daily_limit", "schedule", "paused", "day_change"]).nullable(),
    })
    .nullable(),
  checkpoint: z
    .strictObject({
      id: z.uuid(),
      estado: z.enum(["requested", "confirmed"]),
      modo: z.enum(["profile", "server"]),
      expiraEm: instanteIso,
    })
    .nullable(),
});
export type ControleDaSessao = z.infer<typeof ControleDaSessaoSchema>;

/** ACK da fila de dados de perfil. Mundos usam a API autenticada das instâncias. */
export const ConfirmacaoDeCheckpointSchema = z.strictObject({
  id: z.uuid(),
  confirmado: z.boolean(),
});
export const ResultadoDeCheckpointSchema = z.strictObject({
  estado: z.enum(["confirmed", "failed", "expired"]),
  pausada: z.boolean(),
});
export type ResultadoDeCheckpoint = z.infer<typeof ResultadoDeCheckpointSchema>;

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
  dados: DadosDoPerfil;
  /** Conquistas declaradas pelo cliente; não concedem dinheiro nem acesso. */
  conquista(id: string, chaveIdem: string): Promise<{ id: string; obtidaEm: string }>;
  perfil: PerfilDoJogo;
  politica: PoliticaDoPerfil;
  sessao: {
    /** Consulta o estado atual sem renovar nem acertar de novo o tempo concedido. */
    controle(): Promise<ControleDaSessao>;
    /** Confirma a fila já salva; não é prova de persistência de um mundo. */
    checkpoint(id: string, confirmado: boolean): Promise<ResultadoDeCheckpoint>;
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
