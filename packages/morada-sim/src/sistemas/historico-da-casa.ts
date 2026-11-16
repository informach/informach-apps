import { z } from "zod";
import {
  comandoDeEdicao,
  LIMITE_DE_EDICAO_SEM_GESTAO_CENTAVOS,
  type ReciboDeEdicao,
  ReciboDeEdicaoSchema,
} from "../comandos/edicao";
import { PinturaDoMovelSchema } from "../comandos/pintura";
import type { FamiliaId, LoteId, ObjetoId, PerfilId } from "../dominio/ids";
import type { Objeto } from "../dominio/tipos";
import { canonico, copiar } from "../nucleo/canonico";

export const PASSOS_POR_AUTOR = 50;
export const PASSOS_NO_MUNDO = 128;
export type SentidoDoHistorico = "desfazer" | "refazer";
export type PecaNoHistorico = Omit<Objeto, "revisao" | "ocupacao">;
export type OrigemDoPasso = {
  chave: string;
  autor: PerfilId;
  sequencia: number;
  ordem: number;
  familiaId: FamiliaId;
  loteId: LoteId;
  tipo: "comprar" | "mover" | "pintar" | "vender";
  antes: PecaNoHistorico | null;
  depois: PecaNoHistorico | null;
  delta: number;
  permissoes: ReciboDeEdicao["permissoes"];
};
export type PassoDaCasa = OrigemDoPasso & {
  desfeita: boolean;
  interferida: boolean;
  revisaoEsperada: number;
};

const inteiro = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const versao = inteiro.positive();
const entidade = <P extends string>(prefixo: P) =>
  z.custom<`${P}_${string}`>(
    (valor) =>
      typeof valor === "string" && new RegExp(`^${prefixo}_[A-Za-z0-9_-]{1,64}$`).test(valor),
  );
const PecaNoHistoricoSchema: z.ZodType<PecaNoHistorico> = z.strictObject({
  id: entidade("obj"),
  loteId: entidade("lote"),
  catalogo: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  versao,
  pos: z.tuple([inteiro.max(1_000_000), inteiro.max(1_000_000), inteiro.max(1_000_000)]),
  andar: inteiro.max(2),
  giro: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  cor: inteiro.max(0xffffff),
  pintura: PinturaDoMovelSchema.nullable(),
});
const PassoDaCasaSchema: z.ZodType<PassoDaCasa> = z
  .strictObject({
    chave: z.string().min(1).max(64),
    autor: z.string().regex(/^[A-Za-z0-9_-]{1,44}$/),
    sequencia: versao,
    ordem: versao,
    familiaId: entidade("fam"),
    loteId: entidade("lote"),
    tipo: z.enum(["comprar", "mover", "pintar", "vender"]),
    antes: PecaNoHistoricoSchema.nullable(),
    depois: PecaNoHistoricoSchema.nullable(),
    delta: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    permissoes: ReciboDeEdicaoSchema.shape.permissoes,
    desfeita: z.boolean(),
    interferida: z.boolean(),
    revisaoEsperada: versao,
  })
  .refine(origemCompativel, { message: "Origem incompatível do histórico" });

/** O histórico é obrigatório no V3 ainda não publicado; não é reconstruído de recibos podados. */
export const HistoricoDaCasaSchema = z
  .array(PassoDaCasaSchema)
  .max(PASSOS_NO_MUNDO)
  .superRefine((passos, ctx) => {
    const chaves = new Set<string>();
    const autores = new Map<
      PerfilId,
      { quantidade: number; sequencia: number; desfeita: boolean }
    >();
    let ordem = 0;
    for (const [indice, passo] of passos.entries()) {
      const anterior = autores.get(passo.autor);
      if (
        chaves.has(passo.chave) ||
        passo.ordem <= ordem ||
        passo.revisaoEsperada < passo.ordem ||
        (anterior &&
          (anterior.quantidade >= PASSOS_POR_AUTOR ||
            passo.sequencia <= anterior.sequencia ||
            (anterior.desfeita && !passo.desfeita)))
      )
        ctx.addIssue({ code: "custom", path: [indice], message: "Cadeia inválida do histórico" });
      chaves.add(passo.chave);
      ordem = passo.ordem;
      autores.set(passo.autor, {
        quantidade: (anterior?.quantidade ?? 0) + 1,
        sequencia: passo.sequencia,
        desfeita: passo.desfeita,
      });
    }
  });

/** A compensação nunca restaura ocupantes nem reutiliza a revisão da peça. */
export function pecaNoHistorico(objeto: Objeto | null): PecaNoHistorico | null {
  if (!objeto) return null;
  return {
    id: objeto.id,
    loteId: objeto.loteId,
    catalogo: objeto.catalogo,
    versao: objeto.versao,
    pos: [...objeto.pos],
    andar: objeto.andar,
    giro: objeto.giro,
    cor: objeto.cor,
    pintura: copiar(objeto.pintura),
  };
}

function pecaDoPasso(passo: OrigemDoPasso): ObjetoId {
  const id = passo.depois?.id ?? passo.antes?.id;
  if (!id) throw new Error("Passo sem peça");
  return id;
}

function origemCompativel(passo: OrigemDoPasso): boolean {
  const id = passo.depois?.id ?? passo.antes?.id;
  if (
    !id ||
    passo.chave !== comandoDeEdicao(passo.autor, passo.sequencia) ||
    !Number.isSafeInteger(passo.ordem) ||
    passo.ordem < 1 ||
    !Number.isSafeInteger(passo.delta) ||
    !passo.permissoes.includes("decorar") ||
    (passo.delta < 0 && !passo.permissoes.includes("gastar")) ||
    (Math.abs(passo.delta) > LIMITE_DE_EDICAO_SEM_GESTAO_CENTAVOS &&
      !passo.permissoes.includes("gerir_financas")) ||
    (passo.antes && (passo.antes.id !== id || passo.antes.loteId !== passo.loteId)) ||
    (passo.depois && (passo.depois.id !== id || passo.depois.loteId !== passo.loteId)) ||
    (passo.tipo === "comprar" &&
      (passo.antes !== null || passo.depois === null || passo.delta > 0)) ||
    (passo.tipo === "vender" &&
      (passo.antes === null || passo.depois !== null || passo.delta < 0)) ||
    ((passo.tipo === "mover" || passo.tipo === "pintar") &&
      (passo.antes === null || passo.depois === null || passo.delta !== 0))
  )
    return false;
  if (passo.antes && passo.depois) {
    const permitido =
      passo.tipo === "mover"
        ? {
            ...passo.antes,
            pos: passo.depois.pos,
            andar: passo.depois.andar,
            giro: passo.depois.giro,
          }
        : { ...passo.antes, pintura: passo.depois.pintura };
    if (canonico(permitido) !== canonico(passo.depois)) return false;
  }
  return true;
}

function indiceDoProximo(
  passos: readonly PassoDaCasa[],
  autor: PerfilId,
  sentido: SentidoDoHistorico,
  peca?: ObjetoId,
): number {
  const desfazer = sentido === "desfazer";
  for (let n = 0; n < passos.length; n++) {
    const i = desfazer ? passos.length - 1 - n : n;
    const passo = passos[i];
    if (
      passo?.autor === autor &&
      passo.desfeita !== desfazer &&
      (!peca || pecaDoPasso(passo) === peca)
    )
      return i;
  }
  return -1;
}

/** Um conflito no topo é mostrado; não pular silenciosamente ações próprias. */
export function proximoPassoDaCasa(
  passos: readonly PassoDaCasa[],
  autor: PerfilId,
  sentido: SentidoDoHistorico,
): PassoDaCasa | null {
  const passo = passos[indiceDoProximo(passos, autor, sentido)];
  return passo ? copiar(passo) : null;
}

function invalidarInterferencia(passos: PassoDaCasa[], autor: PerfilId, peca: ObjetoId): void {
  for (const passo of passos)
    if (passo.autor !== autor && pecaDoPasso(passo) === peca) passo.interferida = true;
}

/** O próximo passo da MESMA peça pode estar abaixo de passos de outras peças. */
function rebasearProximos(
  passos: PassoDaCasa[],
  autor: PerfilId,
  peca: ObjetoId,
  atual: PecaNoHistorico | null,
  revisao: number,
): void {
  for (const sentido of ["desfazer", "refazer"] as const) {
    const passo = passos[indiceDoProximo(passos, autor, sentido, peca)];
    const esperado = sentido === "desfazer" ? passo?.depois : passo?.antes;
    if (passo && !passo.interferida && canonico(esperado) === canonico(atual))
      passo.revisaoEsperada = revisao;
  }
}

function compactar(passos: PassoDaCasa[]): PassoDaCasa[] {
  const contagem = new Map<PerfilId, number>();
  const retidos: PassoDaCasa[] = [];
  for (let i = passos.length - 1; i >= 0 && retidos.length < PASSOS_NO_MUNDO; i--) {
    const passo = passos[i];
    if (!passo) continue;
    const quantidade = contagem.get(passo.autor) ?? 0;
    if (quantidade >= PASSOS_POR_AUTOR) continue;
    contagem.set(passo.autor, quantidade + 1);
    retidos.push(passo);
  }
  return retidos.reverse();
}

/** Só depois de uma edição com efeito admitido; recusas não alteram as pilhas. */
export function registrarPassoDaCasa(
  anteriores: readonly PassoDaCasa[],
  origem: OrigemDoPasso,
): PassoDaCasa[] {
  if (!origemCompativel(origem)) throw new Error("Origem incompatível do histórico");
  if (
    anteriores.length > PASSOS_NO_MUNDO ||
    anteriores.some(
      (p) =>
        p.chave === origem.chave || p.ordem >= origem.ordem || p.revisaoEsperada >= origem.ordem,
    )
  )
    throw new Error("Ordem incompatível do histórico");
  const passos = anteriores.map((p) => copiar(p));
  const peca = pecaDoPasso(origem);
  invalidarInterferencia(passos, origem.autor, peca);
  if (origem.delta === 0 && canonico(origem.antes) === canonico(origem.depois)) {
    rebasearProximos(passos, origem.autor, peca, origem.depois, origem.ordem);
    return passos;
  }
  return compactar([
    ...passos.filter((p) => p.autor !== origem.autor || !p.desfeita),
    { ...copiar(origem), desfeita: false, interferida: false, revisaoEsperada: origem.ordem },
  ]);
}

export function deltaDaCompensacao(passo: PassoDaCasa, sentido: SentidoDoHistorico): number {
  return sentido === "desfazer" ? -passo.delta : passo.delta;
}

/** Transição do histórico, na mesma redução atômica do efeito/recibo financeiro. */
export function confirmarCompensacaoDaCasa(
  anteriores: readonly PassoDaCasa[],
  pedido: {
    autor: PerfilId;
    chave: string;
    sentido: SentidoDoHistorico;
    revisaoNova: number;
    depois: PecaNoHistorico | null;
  },
): PassoDaCasa[] {
  const indice = indiceDoProximo(anteriores, pedido.autor, pedido.sentido);
  const original = anteriores[indice];
  if (!original || original.chave !== pedido.chave || original.interferida)
    throw new Error("Compensação sem passo próprio compatível");
  if (
    !Number.isSafeInteger(pedido.revisaoNova) ||
    pedido.revisaoNova < 1 ||
    anteriores.some((p) => p.revisaoEsperada >= pedido.revisaoNova || p.ordem >= pedido.revisaoNova)
  )
    throw new Error("Compensação sem revisão nova");
  const alvo = pedido.sentido === "desfazer" ? original.antes : original.depois;
  if (canonico(alvo) !== canonico(pedido.depois))
    throw new Error("Compensação divergente da origem");
  const passos = anteriores.map((p) => copiar(p));
  const passo = passos[indice];
  if (!passo) throw new Error("Passo ausente");
  passo.desfeita = pedido.sentido === "desfazer";
  passo.revisaoEsperada = pedido.revisaoNova;
  const peca = pecaDoPasso(passo);
  invalidarInterferencia(passos, pedido.autor, peca);
  rebasearProximos(passos, pedido.autor, peca, pedido.depois, pedido.revisaoNova);
  return passos;
}
