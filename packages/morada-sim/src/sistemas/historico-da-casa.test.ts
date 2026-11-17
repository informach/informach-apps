import { describe, expect, it } from "vitest";
import { comandoDeEdicao } from "../comandos/edicao";
import type { ObjetoId, PerfilId } from "../dominio/ids";
import { copiar } from "../nucleo/canonico";
import {
  confirmarCompensacaoDaCasa,
  deltaDaCompensacao,
  type OrigemDoPasso,
  PASSOS_NO_MUNDO,
  PASSOS_POR_AUTOR,
  type PassoDaCasa,
  type PecaNoHistorico,
  proximoPassoDaCasa,
  registrarPassoDaCasa,
  type SentidoDoHistorico,
} from "./historico-da-casa";

const A = "perfil-a",
  B = "perfil-b";
const peca = (id: ObjetoId = "obj_1"): PecaNoHistorico => ({
  id,
  loteId: "lote_1",
  catalogo: "mesa_lateral_redonda_prateleira_verde",
  versao: 1,
  pos: [1000, 1000, 450],
  andar: 0,
  giro: 0,
  cor: 0xffffff,
  pintura: null,
});
function origem(
  autor: PerfilId,
  sequencia: number,
  ordem: number,
  tipo: OrigemDoPasso["tipo"],
  antes: PecaNoHistorico | null,
  depois: PecaNoHistorico | null,
): OrigemDoPasso {
  return {
    chave: comandoDeEdicao(autor, sequencia),
    autor,
    sequencia,
    ordem,
    tipo,
    familiaId: "fam_1",
    loteId: "lote_1",
    antes,
    depois,
    delta: tipo === "comprar" ? -9500 : tipo === "vender" ? 4750 : 0,
    permissoes: tipo === "comprar" ? ["decorar", "gastar"] : ["decorar"],
  };
}
function compensar(
  h: PassoDaCasa[],
  sentido: SentidoDoHistorico,
  revisaoNova: number,
  depois: PecaNoHistorico | null,
  autor = A,
): PassoDaCasa[] {
  const proximo = proximoPassoDaCasa(h, autor, sentido);
  if (!proximo) throw new Error("Passo da prova ausente");
  return confirmarCompensacaoDaCasa(h, {
    autor,
    chave: proximo.chave,
    sentido,
    revisaoNova,
    depois,
  });
}

describe("histórico próprio e limitado da casa", () => {
  it("desfaz/refaz compra pelo valor original e não altera a origem nem a entrada", () => {
    const compra = origem(A, 1, 2, "comprar", null, peca());
    const h = registrarPassoDaCasa([], compra),
      antes = copiar(h);
    const passo = proximoPassoDaCasa(h, A, "desfazer");
    if (!passo) throw new Error("Compra ausente");
    expect(deltaDaCompensacao(passo, "desfazer")).toBe(9500);
    const voltou = compensar(h, "desfazer", 3, null);
    expect(h).toEqual(antes);
    expect(proximoPassoDaCasa(voltou, A, "desfazer")).toBeNull();
    expect(proximoPassoDaCasa(voltou, A, "refazer")).toMatchObject({
      revisaoEsperada: 3,
      desfeita: true,
    });
    const refez = compensar(voltou, "refazer", 4, peca());
    const refeito = proximoPassoDaCasa(refez, A, "desfazer");
    expect(refeito).toMatchObject({
      revisaoEsperada: 4,
      antes: null,
      depois: compra.depois,
      delta: -9500,
    });
    if (!refeito) throw new Error("Compra refeita ausente");
    expect(deltaDaCompensacao(refeito, "refazer")).toBe(-9500);
    passo.delta = 100;
    expect(h[0]?.delta).toBe(-9500);
  });

  it("rebaseia a cadeia própria mover/pintar sem mudar seus dados originais", () => {
    const a = peca(),
      b = { ...peca(), giro: 90 },
      c = { ...b, pintura: { perfil: "a".repeat(64), cor: 0 } };
    let h = registrarPassoDaCasa([], origem(A, 1, 2, "comprar", null, a));
    h = registrarPassoDaCasa(h, origem(A, 2, 3, "mover", a, b));
    h = registrarPassoDaCasa(h, origem(A, 3, 4, "pintar", b, c));
    h = compensar(h, "desfazer", 5, b);
    expect(proximoPassoDaCasa(h, A, "desfazer")).toMatchObject({
      tipo: "mover",
      revisaoEsperada: 5,
    });
    h = compensar(h, "desfazer", 6, a);
    expect(proximoPassoDaCasa(h, A, "desfazer")).toMatchObject({
      tipo: "comprar",
      revisaoEsperada: 6,
    });
    h = compensar(h, "refazer", 7, b);
    expect(proximoPassoDaCasa(h, A, "refazer")).toMatchObject({
      tipo: "pintar",
      revisaoEsperada: 7,
    });
    h = compensar(h, "refazer", 8, c);
    expect(proximoPassoDaCasa(h, A, "refazer")).toBeNull();
    expect(h[1]).toMatchObject({ antes: a, depois: b, ordem: 3 });
  });

  it("ações de outra peça no meio não impedem rebasear a cadeia da primeira", () => {
    const x = peca(),
      y = peca("obj_2"),
      pintada = { ...x, pintura: { perfil: "a".repeat(64), cor: 0 } };
    let h = registrarPassoDaCasa([], origem(A, 1, 2, "comprar", null, x));
    h = registrarPassoDaCasa(h, origem(A, 2, 3, "comprar", null, y));
    h = registrarPassoDaCasa(h, origem(A, 3, 4, "pintar", x, pintada));
    h = compensar(h, "desfazer", 5, x);
    expect(h[0]?.revisaoEsperada).toBe(5);
    h = compensar(h, "desfazer", 6, null);
    expect(proximoPassoDaCasa(h, A, "desfazer")).toMatchObject({
      chave: comandoDeEdicao(A, 1),
      revisaoEsperada: 5,
    });
    h = compensar(h, "desfazer", 7, null);
    expect(proximoPassoDaCasa(h, A, "desfazer")).toBeNull();
  });

  it("interferência alheia não volta a ser válida ao restaurar a mesma aparência", () => {
    const original = peca(),
      pintada = { ...original, pintura: { perfil: "a".repeat(64), cor: 0 } };
    let h = registrarPassoDaCasa([], origem(A, 1, 2, "comprar", null, original));
    h = registrarPassoDaCasa(h, origem(B, 1, 3, "pintar", original, pintada));
    h = compensar(h, "desfazer", 4, original, B);
    expect(proximoPassoDaCasa(h, A, "desfazer")).toMatchObject({ interferida: true });
    const antes = copiar(h);
    expect(() => compensar(h, "desfazer", 5, null)).toThrow("passo próprio compatível");
    expect(h).toEqual(antes);
  });

  it("venda desfeita debita a revenda recebida e gesto novo encerra só o próprio refazer", () => {
    const x = peca(),
      y = peca("obj_2");
    let h = registrarPassoDaCasa([], origem(A, 1, 2, "comprar", null, x));
    h = registrarPassoDaCasa(h, origem(A, 2, 3, "vender", x, null));
    const venda = proximoPassoDaCasa(h, A, "desfazer");
    if (!venda) throw new Error("Venda ausente");
    expect(deltaDaCompensacao(venda, "desfazer")).toBe(-4750);
    h = compensar(h, "desfazer", 4, x);
    h = registrarPassoDaCasa(h, origem(B, 1, 5, "comprar", null, y));
    h = compensar(h, "desfazer", 6, null, B);
    h = registrarPassoDaCasa(h, origem(A, 3, 7, "comprar", null, peca("obj_3")));
    expect(proximoPassoDaCasa(h, A, "refazer")).toBeNull();
    expect(proximoPassoDaCasa(h, B, "refazer")).toMatchObject({ chave: comandoDeEdicao(B, 1) });
  });

  it("operação sem mudança não ocupa passo nem elimina a ramificação de refazer", () => {
    const x = peca(),
      y = peca("obj_2");
    let h = registrarPassoDaCasa([], origem(A, 1, 2, "comprar", null, x));
    h = registrarPassoDaCasa(h, origem(A, 2, 3, "comprar", null, y));
    h = compensar(h, "desfazer", 4, null);
    h = registrarPassoDaCasa(h, origem(A, 3, 5, "mover", x, x));
    expect(h).toHaveLength(2);
    expect(h[0]?.revisaoEsperada).toBe(5);
    expect(proximoPassoDaCasa(h, A, "refazer")).toMatchObject({ chave: comandoDeEdicao(A, 2) });
  });

  it("poda por autor/mundo e recusa chave, revisão ou alvo divergentes sem efeitos", () => {
    let h: PassoDaCasa[] = [];
    for (let i = 1; i <= 60; i++)
      h = registrarPassoDaCasa(h, origem(A, i, i + 1, "comprar", null, peca(`obj_${i}`)));
    expect(h).toHaveLength(PASSOS_POR_AUTOR);
    expect(h[0]?.sequencia).toBe(11);
    let ordem = 61;
    for (const autor of [B, "perfil-c", "perfil-d"])
      for (let i = 1; i <= 50; i++)
        h = registrarPassoDaCasa(
          h,
          origem(autor, i, ++ordem, "comprar", null, peca(`obj_${ordem}`)),
        );
    expect(h).toHaveLength(PASSOS_NO_MUNDO);
    const antes = copiar(h),
      ultimo = proximoPassoDaCasa(h, "perfil-d", "desfazer");
    if (!ultimo) throw new Error("Último passo ausente");
    expect(() =>
      confirmarCompensacaoDaCasa(h, {
        autor: A,
        chave: ultimo.chave,
        sentido: "desfazer",
        revisaoNova: ordem + 1,
        depois: null,
      }),
    ).toThrow();
    expect(() =>
      confirmarCompensacaoDaCasa(h, {
        autor: "perfil-d",
        chave: ultimo.chave,
        sentido: "desfazer",
        revisaoNova: ordem,
        depois: null,
      }),
    ).toThrow("revisão nova");
    expect(() =>
      confirmarCompensacaoDaCasa(h, {
        autor: "perfil-d",
        chave: ultimo.chave,
        sentido: "desfazer",
        revisaoNova: ordem + 1,
        depois: peca(),
      }),
    ).toThrow("divergente");
    expect(h).toEqual(antes);
  });
});
