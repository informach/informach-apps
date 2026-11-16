import type { Resultado } from "./dominio/tipos";
import type { EventoDeApresentacao } from "./sistemas/contexto";
import type { EdicaoDoCliente, Mudanca, VisaoDoCliente } from "./visao/replicacao";

/**
 * As mensagens entre o cliente e o servidor do Morada. Aqui ficam só as
 * formas; quem transporta é o servidor (WebSocket) e o cliente.
 *
 * O cliente não muda o mundo: manda intenções. O servidor responde a cada uma
 * e, a cada passo, conta o que mudou. Quem entra ou reconecta recebe a visão
 * inteira e segue pelas mudanças.
 */

import type { VersaoDoProtocolo } from "./protocolo-constantes";

export { type MensagemDoCliente, MensagemDoClienteSchema } from "./protocolo-cliente";
export * from "./protocolo-constantes";

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
      v: VersaoDoProtocolo;
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
  | {
      t: "passo";
      seq: number;
      tick: number;
      mudancas: Mudanca[];
      eventos: EventoDeApresentacao[];
      edicao?: EdicaoDoCliente;
    }
  | { t: "resultado"; resultado: Resultado }
  /** Uma vez por segundo, depois do passo: `tick` é o tick em que o mundo está ao enviar. */
  | { t: "pulso"; n: number; tick: number; agoraMs: number }
  | { t: "aviso"; codigo: CodigoDeAviso }
  /** Resposta a `sair`: `salvo` diz se o que é crítico está gravado. */
  | { t: "saiu"; salvo: boolean };
