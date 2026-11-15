import type { PedidoDeEdicao } from "../comandos/edicao";
import type { PerfilId } from "../dominio/ids";
import { obter } from "../dominio/tabela";
import type { EstadoDoMundo, MotivoDeRecusa, Objeto } from "../dominio/tipos";
import { GRADE_DE_EDICAO, pegadaNoLote } from "../espaco/colocacao";
import { copiar } from "../nucleo/canonico";
import { temPermissao } from "./presenca";
import type { AlvoDaObra } from "./travas-de-edicao";

export type RascunhoDaObra = Pick<PedidoDeEdicao, "familiaId" | "loteId" | "operacao">;
type AlvoConferido =
  | { ok: true; alvo: AlvoDaObra }
  | { ok: false; motivo: MotivoDeRecusa; detalhe?: string };

/**
 * Reserva concorrência usando medidas do catálogo e versões atuais. Não admite
 * dinheiro, IDs ou a mudança; colocação completa e gasto são conferidos no commit.
 */
export function derivarAlvoDaObra(
  estado: EstadoDoMundo,
  perfilId: PerfilId,
  rascunho: RascunhoDaObra,
): AlvoConferido {
  const familia = obter(estado.familias, rascunho.familiaId);
  const lote = obter(estado.lotes, rascunho.loteId);
  if (
    !familia ||
    !lote ||
    familia.loteId !== lote.id ||
    lote.familiaId !== familia.id ||
    !temPermissao(estado, perfilId, familia.id, "decorar")
  )
    return { ok: false, motivo: "sem_permissao" };
  const op = rascunho.operacao;
  const anterior = op.t === "comprar" ? null : obter(estado.objetos, op.objetoId);
  if (op.t !== "comprar" && (!anterior || anterior.loteId !== lote.id))
    return { ok: false, motivo: "nao_existe" };
  if (op.t !== "comprar" && anterior?.revisao !== op.revisaoDoObjeto)
    return { ok: false, motivo: "versao_antiga" };
  if (op.t !== "pintar" && op.revisaoDoEspaco !== lote.revisaoDoEspaco)
    return { ok: false, motivo: "versao_antiga" };
  const colocacao = op.t === "comprar" || op.t === "mover" ? op.colocacao : null;
  const imovel = lote.imovelId ? obter(estado.imoveis, lote.imovelId) : null;
  const piso = imovel?.andares.find((andar) => andar.n === 0);
  if (
    colocacao &&
    (!piso ||
      colocacao.andar !== 0 ||
      colocacao.pos[2] !== piso.z ||
      colocacao.pos.slice(0, 2).some((n) => n % GRADE_DE_EDICAO !== 0))
  )
    return { ok: false, motivo: "requisito", detalhe: "posicao_da_obra" };
  const candidato: Objeto | null =
    op.t === "comprar"
      ? {
          id: "obj_previa_obra",
          loteId: lote.id,
          catalogo: op.catalogo,
          versao: op.versaoDoCatalogo,
          revisao: 1,
          ...copiar(op.colocacao),
          cor: 0xffffff,
          pintura: null,
          ocupacao: {},
        }
      : op.t === "mover" && anterior
        ? { ...copiar(anterior), ...copiar(op.colocacao) }
        : null;
  const regioes: AlvoDaObra["regioes"][number][] = [];
  for (const objeto of [anterior, candidato]) {
    if (!objeto) continue;
    const retangulo = pegadaNoLote(objeto);
    if (!retangulo || objeto.andar !== 0)
      return { ok: false, motivo: "requisito", detalhe: "catalogo_da_obra" };
    if (
      retangulo[0] < 0 ||
      retangulo[1] < 0 ||
      retangulo[2] > lote.tamanho[0] ||
      retangulo[3] > lote.tamanho[1]
    )
      return { ok: false, motivo: "requisito", detalhe: "fora_do_lote" };
    if (
      !regioes.some(
        (r) => r.andar === objeto.andar && r.retangulo.every((n, i) => n === retangulo[i]),
      )
    )
      regioes.push({ andar: objeto.andar, retangulo: [...retangulo] });
  }
  if (regioes.length === 0) return { ok: false, motivo: "nao_existe" };
  return {
    ok: true,
    alvo: {
      familiaId: familia.id,
      loteId: lote.id,
      peca: anterior ? { id: anterior.id, revisao: anterior.revisao } : null,
      regioes,
    },
  };
}
