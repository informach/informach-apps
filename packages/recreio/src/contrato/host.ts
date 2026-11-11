import { z } from "zod";
import {
  InstanciaIdSchema,
  MembroIdSchema,
  MundoIdSchema,
  PerfilIdSchema,
  SessaoDeJogoIdSchema,
} from "../dominio/ids";
import { PAPEIS_NO_MUNDO, PARTICIPACAO_MAX } from "../dominio/mundos";
import { TIPOS_DE_FOTOGRAFIA } from "../dominio/posse";

/**
 * API das instâncias: o que um servidor de jogo pede ao Recreio. O servidor do
 * jogo nunca lê as tabelas do Recreio; ele confere a sessão, reivindica a
 * posse, grava o diário e as fotografias, sempre com a cerca atual.
 *
 * Regras que valem para toda escrita:
 * - a cerca é conferida na mesma transação da escrita; cerca que não é a da
 *   posse aberta devolve `POSSE_PERDIDA` e não muda nada;
 * - o prazo da posse é julgado pelo relógio do Recreio, nunca pelo da instância;
 * - `revisao` conta fotografias; `diarioSeq` é a última entrada do diário, sem
 *   buracos.
 */

export const VERSAO_DA_API_DO_HOST = 1;

const naoNegativo = z.number().int().nonnegative();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

// --- Instância ---

export const RegistroDeInstanciaSchema = z.strictObject({
  jogo: z.string().min(1),
  /** Endereço público do WebSocket. Precisa estar na lista de origens do jogo. */
  urlPublica: z.url(),
  versao: z.string().min(1).max(64),
  /** Quantos mundos a instância aceita ao mesmo tempo. */
  capacidade: z.number().int().positive(),
});
export type RegistroDeInstancia = z.infer<typeof RegistroDeInstanciaSchema>;

export const InstanciaRegistradaSchema = z.strictObject({
  instanciaId: InstanciaIdSchema,
  batimentoMs: z.number().int().positive(),
  posseTtlMs: z.number().int().positive(),
});
export type InstanciaRegistrada = z.infer<typeof InstanciaRegistradaSchema>;

export const BatimentoSchema = z.strictObject({
  mundos: z.array(
    z.strictObject({
      mundoId: MundoIdSchema,
      cerca: naoNegativo,
      jogadores: naoNegativo,
      tick: naoNegativo,
    }),
  ),
  /** Devolvido pelo batimento anterior; `null` no primeiro. */
  cursor: z.string().max(64).nullable(),
});
export type Batimento = z.infer<typeof BatimentoSchema>;

export const MOTIVOS_DE_SESSAO_ENCERRADA = [
  "left",
  "replaced",
  "access_lost",
  "signed_out",
  "expired",
] as const;
export type MotivoDeSessaoEncerrada = (typeof MOTIVOS_DE_SESSAO_ENCERRADA)[number];

export const RespostaDoBatimentoSchema = z.strictObject({
  posses: z.array(
    z.strictObject({
      mundoId: MundoIdSchema,
      /** `perdida`: a instância deve parar aquele mundo e fechar as conexões. */
      estado: z.enum(["ok", "perdida"]),
      expiraEm: naoNegativo,
    }),
  ),
  /** Sessões de jogo que acabaram desde o cursor: caminho rápido da revogação. */
  sessoesEncerradas: z.array(
    z.strictObject({ sid: SessaoDeJogoIdSchema, motivo: z.enum(MOTIVOS_DE_SESSAO_ENCERRADA) }),
  ),
  cursor: z.string().max(64),
  /** O Recreio pediu que a instância não aceite mundos novos. */
  drenar: z.boolean(),
});
export type RespostaDoBatimento = z.infer<typeof RespostaDoBatimentoSchema>;

// --- Posse e leitura ---

export const MetaDeFotografiaSchema = z.strictObject({
  revisao: naoNegativo,
  /** Última entrada do diário que a fotografia já contém. */
  diarioSeq: naoNegativo,
  tick: naoNegativo,
  schemaVersion: z.number().int().positive(),
  tipo: z.enum(TIPOS_DE_FOTOGRAFIA),
  bytes: naoNegativo,
  sha256,
});
export type MetaDeFotografia = z.infer<typeof MetaDeFotografiaSchema>;

export const PosseReivindicadaSchema = z.strictObject({
  cerca: naoNegativo,
  expiraEm: naoNegativo,
  schemaVersion: z.number().int().positive(),
  revisao: naoNegativo,
  diarioSeq: naoNegativo,
  /** `null` em mundo novo: o jogo cria o estado inicial. */
  fotografia: MetaDeFotografiaSchema.nullable(),
});
export type PosseReivindicada = z.infer<typeof PosseReivindicadaSchema>;

export type EntradaDoDiario = {
  seq: number;
  tick: number;
  /** Id determinístico do fato. O mesmo fato nunca entra duas vezes. */
  fatoId: string;
  bytes: Uint8Array;
};

export const NovaEntradaDoDiarioSchema = z.strictObject({
  seq: z.number().int().positive(),
  tick: naoNegativo,
  fatoId: z.string().min(1).max(160),
  /** Conteúdo em base64 no transporte HTTP. */
  bytes: z.base64(),
});

export const AnexarAoDiarioSchema = z.strictObject({
  cerca: naoNegativo,
  entradas: z.array(NovaEntradaDoDiarioSchema).min(1).max(256),
});

// --- Entrada de um jogador ---

export const PedidoDeEntradaSchema = z.strictObject({
  cerca: naoNegativo,
  sid: SessaoDeJogoIdSchema,
  perfilId: PerfilIdSchema,
});

export const EntradaPermitidaSchema = z.strictObject({
  membroId: MembroIdSchema,
  papel: z.enum(PAPEIS_NO_MUNDO),
  /** Texto do jogo guardado no convite que trouxe este membro; `null` no criador. */
  participacao: z.string().max(PARTICIPACAO_MAX).nullable(),
  apelido: z.string(),
  avatar: z.string(),
  politica: z.strictObject({
    multiplayer: z.boolean(),
    textoLivre: z.boolean(),
    versao: naoNegativo,
  }),
});
export type EntradaPermitida = z.infer<typeof EntradaPermitidaSchema>;

// --- Escritas ---

export const MOTIVOS_PARA_LIBERAR = ["vazio", "drenagem", "erro"] as const;
export type MotivoParaLiberar = (typeof MOTIVOS_PARA_LIBERAR)[number];

export const LiberarPosseSchema = z.strictObject({
  cerca: naoNegativo,
  motivo: z.enum(MOTIVOS_PARA_LIBERAR),
});

/** O que aparece no cartão do mundo no portal. É conteúdo de quem joga. */
export const ResumoDoMundoSchema = z.strictObject({
  titulo: z.string().max(60),
  subtitulo: z.string().max(120),
});
export type ResumoDoMundo = z.infer<typeof ResumoDoMundoSchema>;

export type NovaFotografia = {
  mundoId: z.infer<typeof MundoIdSchema>;
  cerca: number;
  /** A revisão que a instância acredita ser a atual. Divergência é recusada. */
  revisaoEsperada: number;
  diarioSeq: number;
  tick: number;
  schemaVersion: number;
  tipo: "checkpoint" | "hibernate";
  bytes: Uint8Array;
  resumo?: ResumoDoMundo;
};

/**
 * O cliente que o servidor do jogo usa. A implementação real fala HTTP com o
 * Recreio (`@informach/recreio/host`); a de teste roda em memória
 * (`@informach/recreio/testing`) e obedece às mesmas regras.
 *
 * Toda recusa é um `ErroDoRecreio`. Os códigos que a instância precisa tratar:
 * `POSSE_PERDIDA` e `POSSE_DE_OUTRA_INSTANCIA` (parar aquele mundo),
 * `SEQUENCIA`, `FATO_DUPLICADO`, `REVISAO_DIVERGENTE`, `CHECKPOINT_NECESSARIO`,
 * `CHECKPOINT_PENDENTE`, `TAMANHO_EXCEDIDO`, e na entrada `NAO_MEMBRO`,
 * `SESSAO_ENCERRADA`, `POLITICA_INCOMPATIVEL`, `MUNDO_CHEIO`.
 */
export interface ClienteDoHost {
  registrar(registro: Omit<RegistroDeInstancia, "jogo">): Promise<InstanciaRegistrada>;

  /** Renova todas as posses da instância de uma vez. */
  batimento(batimento: Batimento): Promise<RespostaDoBatimento>;

  /** Avisa que a instância vai sair: ela não recebe mundos novos. */
  drenar(): Promise<void>;

  /**
   * Assume a posse que o Recreio atribuiu a esta instância. Idempotente.
   * Se a posse é de outra instância, recusa com `POSSE_DE_OUTRA_INSTANCIA`.
   */
  reivindicarPosse(mundoId: NovaFotografia["mundoId"]): Promise<PosseReivindicada>;

  lerFotografia(pedido: {
    mundoId: NovaFotografia["mundoId"];
    cerca: number;
  }): Promise<{ meta: MetaDeFotografia; bytes: Uint8Array } | null>;

  /** Entradas com `seq > apos`, em ordem. */
  lerDiario(pedido: {
    mundoId: NovaFotografia["mundoId"];
    cerca: number;
    apos: number;
  }): Promise<EntradaDoDiario[]>;

  /** Confere de novo, no Recreio, o direito deste perfil de entrar no mundo. */
  verificarEntrada(pedido: {
    mundoId: NovaFotografia["mundoId"];
    cerca: number;
    sid: z.infer<typeof SessaoDeJogoIdSchema>;
    perfilId: z.infer<typeof PerfilIdSchema>;
  }): Promise<EntradaPermitida>;

  /**
   * Anexa fatos ao diário. As sequências precisam continuar de onde o diário
   * parou; repetir exatamente uma entrada já gravada não faz nada.
   */
  anexarAoDiario(pedido: {
    mundoId: NovaFotografia["mundoId"];
    cerca: number;
    entradas: readonly EntradaDoDiario[];
  }): Promise<{ confirmadoAte: number }>;

  gravarFotografia(fotografia: NovaFotografia): Promise<{ revisao: number }>;

  /**
   * Solta a posse. Com `vazio` ou `drenagem` exige uma fotografia que cubra o
   * diário inteiro, senão recusa com `CHECKPOINT_PENDENTE`.
   */
  liberarPosse(pedido: {
    mundoId: NovaFotografia["mundoId"];
    cerca: number;
    motivo: MotivoParaLiberar;
  }): Promise<void>;
}
