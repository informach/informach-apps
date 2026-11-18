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
import type {
  AtestadoDePresenca,
  ConsultaDePresenca,
  PresencaConsultada,
  PresencaRenovada,
  ReciboDePresenca,
  RenovacaoDePresenca,
} from "./presencas";
import type { EstadoDeSalvamento } from "./salvamento";
import type { ResultadoDeCheckpoint } from "./sdk";
import type {
  EncerramentoDeSessaoDeVisita,
  EntradaDeVisitante,
  PedidoDeEntradaDeVisitaSchema,
  RenovacaoDeVisita,
  SessaoDeVisitaEncerrada,
  VisitaRenovada,
} from "./visitas";

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
  /** Negociação da instância, sem alterar instâncias registradas anteriormente. */
  suportaVisitas: z.literal(true).optional(),
});
export type RegistroDeInstancia = z.infer<typeof RegistroDeInstanciaSchema>;

export const InstanciaRegistradaSchema = z.strictObject({
  instanciaId: InstanciaIdSchema,
  batimentoMs: z.number().int().positive(),
  posseTtlMs: z.number().int().positive(),
  visitas: z.literal(true).optional(),
});
export type InstanciaRegistrada = z.infer<typeof InstanciaRegistradaSchema>;

export const MUNDOS_POR_BATIMENTO_MAX = 1000;
export const BatimentoSchema = z.strictObject({
  mundos: z
    .array(
      z.strictObject({
        mundoId: MundoIdSchema,
        cerca: naoNegativo,
        jogadores: naoNegativo,
        tick: naoNegativo,
      }),
    )
    .max(MUNDOS_POR_BATIMENTO_MAX)
    .refine(
      (mundos) => new Set(mundos.map((mundo) => mundo.mundoId)).size === mundos.length,
      "Mundo repetido no batimento",
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
  "permissions_changed",
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
  /** Versão do formato persistido. Escritas não podem reduzi-la. */
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

// --- Transporte HTTP ---

/**
 * Como a API das instâncias viaja em `/api/interno/v1`. O segredo do jogo vai
 * em `Authorization: Bearer`; o jogo e a instância, nestes cabeçalhos. Bytes
 * do diário vão em base64 dentro do JSON; a fotografia vai crua, como
 * `application/octet-stream`, com os metadados na consulta e nos cabeçalhos.
 */
export const CAMINHO_DA_API_DO_HOST = "/api/interno/v1";
export const CABECALHO_DO_JOGO = "x-recreio-jogo";
export const CABECALHO_DA_INSTANCIA = "x-recreio-instancia";
/** Na leitura da fotografia: `MetaDeFotografia` em JSON, codificado em base64url. */
export const CABECALHO_DA_FOTOGRAFIA = "x-recreio-fotografia";
/** Na gravação da fotografia: `ResumoDoMundo` em JSON, codificado em base64url. Opcional. */
export const CABECALHO_DO_RESUMO = "x-recreio-resumo";

export const DIARIO_PAGINA_MAX_ENTRADAS = 256;
export const DIARIO_PAGINA_MAX_BYTES = 256 * 1024;
export const DIARIO_RECUPERACAO_MAX_ENTRADAS = 128 * 1024;
export const DiarioLidoSchema = z.strictObject({
  entradas: z.array(NovaEntradaDoDiarioSchema).max(DIARIO_PAGINA_MAX_ENTRADAS),
  /** Última sequência entregue quando ainda há entradas; ausente em servidor anterior. */
  proximoApos: naoNegativo.nullable().optional(),
});
export const DiarioConfirmadoSchema = z.strictObject({ confirmadoAte: naoNegativo });
export const FotografiaGravadaSchema = z.strictObject({ revisao: naoNegativo });

const checkpointDoHost = {
  id: z.uuid(),
  sid: SessaoDeJogoIdSchema,
  cerca: z.number().int().min(1).max(2147483647),
};
export const CheckpointDoHostSchema = z.discriminatedUnion("confirmado", [
  z.strictObject({ ...checkpointDoHost, confirmado: z.literal(false) }),
  z.strictObject({
    ...checkpointDoHost,
    confirmado: z.literal(true),
    revisao: naoNegativo.max(2147483647),
    diarioSeq: naoNegativo.max(Number.MAX_SAFE_INTEGER),
  }),
]);
export type CheckpointDoHost = z.infer<typeof CheckpointDoHostSchema>;

const salvamentoDoHost = {
  sid: SessaoDeJogoIdSchema,
  cerca: z.number().int().min(1).max(2147483647),
};
export const SalvamentoDoHostSchema = z.discriminatedUnion("operacao", [
  z.strictObject({ ...salvamentoDoHost, operacao: z.literal("preparar") }),
  z.strictObject({
    ...salvamentoDoHost,
    operacao: z.literal("concluir"),
    revisao: naoNegativo.max(2147483647),
    diarioSeq: naoNegativo.max(2147483647),
  }),
]);
export type SalvamentoDoHost = z.infer<typeof SalvamentoDoHostSchema>;

/** Duas fases: parar o SID antes da fotografia; confirmar somente a prova persistida. */
export interface ClienteDoHostComSalvamento extends ClienteDoHostComCheckpoint {
  salvarSessao(
    pedido: SalvamentoDoHost & { mundoId: z.infer<typeof MundoIdSchema> },
  ): Promise<EstadoDeSalvamento>;
}

/** Extensão explícita: o host básico e seus adapters não prometem oferecer visitas. */
export interface ClienteDoHostComVisitas extends ClienteDoHostComPresencas {
  /** Só este vínculo/SID, inclusive depois da perda de autoridade. Não comprova salvamento. */
  encerrarSessaoDeVisita(
    pedido: EncerramentoDeSessaoDeVisita & {
      mundoId: z.infer<typeof MundoIdSchema>;
    },
  ): Promise<SessaoDeVisitaEncerrada>;
  /** Após posses e presenças; só conexões com admissão confirmada, sem repetir automaticamente. */
  renovarVisitas(visitas: readonly RenovacaoDeVisita[]): Promise<{ visitas: VisitaRenovada[] }>;
  /** Entrada temporária sem membro/papel, com prazo local obrigatório. Não repetir automaticamente. */
  verificarEntradaDeVisita(
    pedido: z.infer<typeof PedidoDeEntradaDeVisitaSchema> & {
      mundoId: z.infer<typeof MundoIdSchema>;
    },
  ): Promise<EntradaDeVisitante>;
}

export interface ClienteDoHostComPresencas extends ClienteDoHostComSalvamento {
  /** Só recibo próprio; nunca cria/renova. `null` não resolve uma escrita ainda em voo. */
  consultarPresenca(
    pedido: ConsultaDePresenca & { mundoId: z.infer<typeof MundoIdSchema> },
  ): Promise<PresencaConsultada>;
  /** Após renovar as posses; somente conexões que continuam ativas na instância. */
  renovarPresencas(
    presencas: readonly RenovacaoDePresenca[],
  ): Promise<{ presencas: PresencaRenovada[] }>;
  /**
   * Entrada somente após a conexão real do membro; saída ao desconectar.
   * Resposta é recibo técnico. Perder a resposta não autoriza repetir a conexão
   * ou admitir visitantes; recuperação exige repetir explicitamente a mesma chave.
   */
  atestarPresenca(
    pedido: AtestadoDePresenca & {
      mundoId: z.infer<typeof MundoIdSchema>;
    },
  ): Promise<ReciboDePresenca>;
}

/** Capacidade adicional; o host básico não promete implementar checkpoint de troca. */
export interface ClienteDoHostComCheckpoint extends ClienteDoHost {
  confirmarCheckpoint(
    pedido: CheckpointDoHost & { mundoId: z.infer<typeof MundoIdSchema> },
  ): Promise<ResultadoDeCheckpoint>;
}

/** Os números que acompanham a fotografia na consulta do `PUT`. */
export const ConsultaDaFotografiaSchema = z.strictObject({
  cerca: naoNegativo,
  revisaoEsperada: naoNegativo,
  diarioSeq: naoNegativo,
  tick: naoNegativo,
  schemaVersion: z.number().int().positive(),
  tipo: z.enum(["checkpoint", "hibernate"]),
});

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
