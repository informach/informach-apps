import { z } from "zod";
import { IntencaoSchema } from "./comandos/intencao";
import type { Resultado } from "./dominio/tipos";
import type { EventoDeApresentacao } from "./sistemas/contexto";
import type { Mudanca, VisaoDoCliente } from "./visao/replicacao";

/**
 * As mensagens entre o cliente e o servidor do Morada. Aqui ficam só as
 * formas; quem transporta é o servidor (WebSocket) e o cliente.
 *
 * O cliente não muda o mundo: manda intenções. O servidor responde a cada uma
 * e, a cada passo, conta o que mudou. Quem entra ou reconecta recebe a visão
 * inteira e segue pelas mudanças.
 */

export const VERSAO_DO_PROTOCOLO = 1;
/** Subprotocolo do WebSocket. Outro formato de quadro ganha outro nome. */
export const SUBPROTOCOLO = "morada.v1.json";
/** Tamanho máximo de um quadro vindo do cliente. */
export const QUADRO_MAXIMO_BYTES = 16 * 1024;
/** Quanto o servidor espera o primeiro quadro, com a sessão, antes de desistir. */
export const PRAZO_PARA_ENTRAR_MS = 5000;

/** Por que o servidor fechou a conexão. O cliente decide por aqui se tenta de novo. */
export const FECHAMENTO = {
  /** O cliente pediu para sair. */
  normal: 1000,
  /** Sessão de jogo ausente, vencida ou que não confere. */
  sessao: 4001,
  /** A sessão vale, mas não dá direito a este mundo. */
  semAcesso: 4003,
  /** Quadro fora do formato ou comandos demais. */
  protocolo: 4008,
  /** Esta instância perdeu a posse do mundo: reabra pelo Recreio. */
  posse: 4009,
  /** O servidor está reiniciando: reabra pelo Recreio. */
  reiniciando: 4010,
  /** O cliente não acompanhou o ritmo: reconecte para receber a visão inteira. */
  atrasado: 4011,
  /** O mesmo perfil entrou por outra conexão. */
  substituida: 4012,
  /** O servidor não aceita mais mundos agora. */
  cheio: 4013,
} as const;

export type CodigoDeFechamento = (typeof FECHAMENTO)[keyof typeof FECHAMENTO];

/** Depois destes fechamentos o cliente pode reabrir o mundo sozinho. */
export const FECHAMENTOS_QUE_REABREM: readonly number[] = [
  FECHAMENTO.posse,
  FECHAMENTO.reiniciando,
  FECHAMENTO.atrasado,
];

// --- Do cliente para o servidor ---

export const MensagemDoClienteSchema = z.discriminatedUnion("t", [
  /** Sempre o primeiro quadro. A sessão vai aqui, nunca no endereço. */
  z.strictObject({
    t: z.literal("entrar"),
    v: z.literal(VERSAO_DO_PROTOCOLO),
    sessao: z.string().min(1).max(4096),
    mundoId: z.string().min(1).max(64),
  }),
  z.strictObject({ t: z.literal("intencao"), intencao: IntencaoSchema }),
  /** A sessão foi renovada no Recreio: o servidor passa a valer pelo prazo novo. */
  z.strictObject({ t: z.literal("renovar_sessao"), sessao: z.string().min(1).max(4096) }),
  z.strictObject({ t: z.literal("pulso"), n: z.number().int().nonnegative() }),
  /** Sair de propósito: o servidor salva e confirma antes de fechar. */
  z.strictObject({ t: z.literal("sair") }),
]);
export type MensagemDoCliente = z.infer<typeof MensagemDoClienteSchema>;

// --- Do servidor para o cliente ---

export type CodigoDeAviso =
  /** O mundo está sendo aberto por outra instância; tente em instantes. */
  | "aguarde"
  | "servidor_reiniciando"
  /** O direito de jogar acabou: o jogo salva o que puder e volta ao Recreio. */
  | "acesso_encerrado";

export type MensagemDoServidor =
  | {
      t: "bem_vindo";
      v: typeof VERSAO_DO_PROTOCOLO;
      /** Quem você é dentro deste mundo. Não é o id do perfil no Recreio. */
      jogadorId: string;
      apelido: string;
      papel: string;
      tick: number;
      passoMs: number;
      janelaDeGracaMs: number;
    }
  /** A visão inteira. Chega ao entrar e a cada reconexão. */
  | { t: "fotografia"; seq: number; visao: VisaoDoCliente }
  /** O que mudou em um passo, depois de gravado o que era crítico. */
  | { t: "passo"; seq: number; tick: number; mudancas: Mudanca[]; eventos: EventoDeApresentacao[] }
  | { t: "resultado"; resultado: Resultado }
  /** Uma vez por segundo, depois do passo: `tick` é o tick em que o mundo está ao enviar. */
  | { t: "pulso"; n: number; tick: number; agoraMs: number }
  | { t: "aviso"; codigo: CodigoDeAviso }
  /** Resposta a `sair`: `salvo` diz se o que é crítico está gravado. */
  | { t: "saiu"; salvo: boolean };
