import type { MundoId } from "@informach/recreio";
import type { MetaDeFotografia } from "@informach/recreio/contrato";
import type { ReferenciaDoObjeto } from "@/features/objetos/criptografia";
import type { Transacao } from "@/lib/repository";

/**
 * Porta de armazenamento do estado de um mundo: as fotografias e o diário.
 * Os bytes são opacos, só o jogo os entende.
 *
 * Operações de banco recebem a transação de quem chama, sob posse/cerca atuais.
 * Esta porta não realiza I/O de bucket: devolve uma referência que o chamador
 * materializa fora da transação e só entrega após reler sua autoridade.
 *
 * O Postgres conserva metadados e recibos. Uma fotografia só aponta para bucket
 * depois da confirmação persistida; um leitor desabilitado recusa esse ponteiro.
 */

export type EntradaGuardada = { seq: number; tick: number; fatoId: string; bytes: Uint8Array };
export type PaginaDoDiario = { entradas: EntradaGuardada[]; proximoApos: number | null };
export type ReferenciaDeFotografia = {
  id: string;
  meta: MetaDeFotografia;
  origem:
    | { tipo: "pg"; bytes: Uint8Array }
    | {
        tipo: "bucket";
        bucketId: string;
        bucketName: string;
        escopo: "qualification" | "production";
        objeto: ReferenciaDoObjeto;
      };
};

/** Capacidade de leitura fornecida exclusivamente pela composição do servidor. */
export type LeitorDeFotografiasPrivadas = {
  bucketId: string;
  bucketName: string;
  escopo: "qualification" | "production";
  ler: (referencia: ReferenciaDoObjeto) => Promise<Uint8Array>;
};

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

  /** Fonte limitada da fotografia mais nova, sem acesso externo. */
  prepararLeituraDaFotografia(
    tx: Transacao,
    mundoId: MundoId,
    tetoBytes: number,
  ): Promise<ReferenciaDeFotografia | null>;

  gravarFotografia(tx: Transacao, mundoId: MundoId, foto: FotografiaParaGuardar): Promise<void>;

  /**
   * Retenção: ficam as `guardar` fotografias mais novas que não são fixadas,
   * mais todas as fixadas; as outras são apagadas. Devolve o `diarioSeq` da
   * mais antiga que ficou (0 se não ficou nenhuma).
   */
  apararFotografias(tx: Transacao, mundoId: MundoId, guardar: number): Promise<number>;

  /** Entradas com `seq > apos`, em ordem. */
  lerDiario(tx: Transacao, mundoId: MundoId, apos: number): Promise<PaginaDoDiario>;

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
