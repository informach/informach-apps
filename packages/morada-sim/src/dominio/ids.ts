/**
 * Ids do Morada. São textos com prefixo, gerados por contadores guardados no
 * próprio estado: o mesmo roteiro cria sempre os mesmos ids.
 *
 * `PerfilId` e `MundoId` vêm do Recreio; aqui são textos opacos.
 */

export type Id<Prefixo extends string> = `${Prefixo}_${string}`;

export type MundoId = string;
export type PerfilId = string;
/** Conexão de um perfil ao mundo. Vem do servidor; nunca é gravada no morador. */
export type SessaoId = string;

export type BairroId = Id<"bairro">;
export type LoteId = Id<"lote">;
export type ImovelId = Id<"imo">;
export type ObjetoId = Id<"obj">;
export type FamiliaId = Id<"fam">;
export type MoradorId = Id<"mor">;
export type AcaoId = Id<"aca">;
export type GravidezId = Id<"gra">;
export type PedidoId = Id<"ped">;
export type TarefaId = Id<"tar">;
export type MemoriaId = Id<"mem">;
/** A relação de um par é única; o id vem dos dois moradores, em ordem. */
export type RelacaoId = `rel:${string}`;

export type PrefixoDeId =
  | "bairro"
  | "lote"
  | "imo"
  | "obj"
  | "fam"
  | "mor"
  | "aca"
  | "gra"
  | "ped"
  | "tar"
  | "mem";

const LARGURA = 6;

export function montarId<P extends PrefixoDeId>(prefixo: P, numero: number): Id<P> {
  return `${prefixo}_${String(numero).padStart(LARGURA, "0")}`;
}

/** O número de um id gerado por contador, ou `null` se o id tem outra forma. */
export function numeroDoId(id: string): number | null {
  const corte = id.lastIndexOf("_");
  if (corte < 0) return null;
  const sufixo = id.slice(corte + 1);
  if (!/^\d+$/.test(sufixo)) return null;
  return Number(sufixo);
}

export function relacaoId(a: MoradorId, b: MoradorId): RelacaoId {
  return a < b ? `rel:${a}:${b}` : `rel:${b}:${a}`;
}
