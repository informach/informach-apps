import type { MundoId } from "@informach/recreio";
import type { MetaDeFotografia } from "@informach/recreio/contrato";
import type { Transacao } from "@/lib/repository";

/**
 * Porta de armazenamento do estado de um mundo: as fotografias e o diário.
 * Os bytes são opacos, só o jogo os entende.
 *
 * Toda operação recebe a transação de quem chama: a posse e a cerca são
 * conferidas nela, com a linha do mundo travada, e a gravação entra ou sai
 * junto com essa conferência.
 *
 * Hoje existe uma implementação, a do Postgres (`armazenamento-repository.ts`,
 * linhas com `storage = 'pg'`). A variante com os bytes num bucket fica para
 * depois; as colunas dela já estão na tabela.
 */

export type EntradaGuardada = { seq: number; tick: number; fatoId: string; bytes: Uint8Array };

export type FotografiaParaGuardar = {
  revisao: number;
  cerca: number;
  schemaVersion: number;
  diarioSeq: number;
  tick: number;
  tipo: "checkpoint" | "hibernate";
  bytes: Uint8Array;
  sha256: string;
};

export interface ArmazenamentoDeMundos {
  /** Os metadados da fotografia mais nova, ou `null` em mundo que nunca foi fotografado. */
  ultimaFotografia(tx: Transacao, mundoId: MundoId): Promise<MetaDeFotografia | null>;

  /** A fotografia mais nova, com os bytes. */
  lerUltimaFotografia(
    tx: Transacao,
    mundoId: MundoId,
  ): Promise<{ meta: MetaDeFotografia; bytes: Uint8Array } | null>;

  gravarFotografia(tx: Transacao, mundoId: MundoId, foto: FotografiaParaGuardar): Promise<void>;

  /**
   * Retenção: ficam as `guardar` fotografias mais novas que não são fixadas,
   * mais todas as fixadas; as outras são apagadas. Devolve o `diarioSeq` da
   * mais antiga que ficou (0 se não ficou nenhuma).
   */
  apararFotografias(tx: Transacao, mundoId: MundoId, guardar: number): Promise<number>;

  /** Entradas com `seq > apos`, em ordem. */
  lerDiario(tx: Transacao, mundoId: MundoId, apos: number): Promise<EntradaGuardada[]>;

  /** As entradas guardadas com estas sequências, para conferir uma repetição. */
  entradasPorSeq(
    tx: Transacao,
    mundoId: MundoId,
    seqs: readonly number[],
  ): Promise<EntradaGuardada[]>;

  /** Quais destes fatos já estão no diário guardado. */
  fatosJaGravados(tx: Transacao, mundoId: MundoId, fatoIds: readonly string[]): Promise<string[]>;

  /** Bytes do diário com `seq > coberto`: o que nenhuma fotografia contém ainda. */
  bytesDepoisDe(tx: Transacao, mundoId: MundoId, coberto: number): Promise<number>;

  anexarAoDiario(
    tx: Transacao,
    mundoId: MundoId,
    cerca: number,
    entradas: readonly EntradaGuardada[],
  ): Promise<void>;

  /** Apaga as entradas com `seq <= ate`: uma fotografia guardada já as contém. */
  compactarDiario(tx: Transacao, mundoId: MundoId, ate: number): Promise<void>;
}
