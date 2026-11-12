import type {
  FamiliaId,
  GravidezId,
  LoteId,
  MemoriaId,
  MoradorId,
  PedidoId,
  PerfilId,
} from "./ids";
import type { Permissao } from "./permissoes";
import type {
  Centavos,
  EstadoDoCasal,
  Fase,
  Gravidez,
  Morador,
  Pedido,
  Relacao,
  Tick,
} from "./tipos";

/**
 * Fatos: o que não pode se perder nem acontecer duas vezes. Dinheiro, família,
 * casal, parentesco, gravidez, nascimento, fase e permissões só mudam por um
 * fato, e o fato vai para o diário antes de qualquer cliente ficar sabendo.
 *
 * Um fato guarda o resultado, não a intenção: valores absolutos e a entidade
 * inteira quando ela nasce. Aplicar o mesmo fato de novo não muda nada.
 */

export type DadosDoFato =
  | { tipo: "AcessoConcedido"; perfilId: PerfilId; familiaId: FamiliaId; permissoes: Permissao[] }
  | { tipo: "AcessoRevogado"; perfilId: PerfilId; familiaId: FamiliaId }
  | { tipo: "PreferidoDefinido"; moradorId: MoradorId; perfilId: PerfilId | null }
  | {
      tipo: "CasalMudou";
      a: MoradorId;
      b: MoradorId;
      casal: EstadoDoCasal;
      memoriaId: MemoriaId | null;
    }
  | {
      tipo: "FamiliaMudou";
      moradorId: MoradorId;
      de: FamiliaId | null;
      para: FamiliaId | null;
      loteId: LoteId | null;
      memoriaId: MemoriaId | null;
    }
  | { tipo: "GravidezIniciada"; gravidez: Gravidez; memoriaId: MemoriaId }
  | {
      tipo: "NascimentoRegistrado";
      gravidezId: GravidezId;
      /** O bebê inteiro, como nasce. */
      bebe: Morador;
      /** Os vínculos de parentesco que nascem com ele. */
      relacoes: Relacao[];
      memoriaId: MemoriaId;
    }
  | {
      tipo: "FaseMudou";
      moradorId: MoradorId;
      de: Fase;
      para: Fase;
      corpo: string;
      memoriaId: MemoriaId;
    }
  | {
      tipo: "FundoMovimentado";
      familiaId: FamiliaId;
      delta: Centavos;
      /** Saldo depois do movimento. É ele que vale ao reaplicar. */
      saldo: Centavos;
      motivo: string;
    }
  | { tipo: "PedidoCriado"; pedido: Pedido }
  | { tipo: "PedidoResolvido"; pedidoId: PedidoId; aceito: boolean; motivo: string | null };

export type TipoDeFato = DadosDoFato["tipo"];

export type Fato = {
  /** Determinístico. O nascimento de uma gravidez é sempre `nasc:<gravidezId>`. */
  id: string;
  tick: Tick;
  familiaId: FamiliaId | null;
  /** Toda mudança permanente guarda autor e motivo. */
  causa: { comandoId: string | null; autor: PerfilId | "sim"; motivo: string };
  dados: DadosDoFato;
};
