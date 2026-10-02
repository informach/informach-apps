import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { contentUnits, findLesson } from "../content/catalog";
import { publicItem } from "../content/types";
import { ResponseInput } from "./components/response-input";
import { gradeAnswer } from "./engine";
import { responseLabel } from "./response";

const sample = findLesson("fracoes-formatos")?.items.find((item) => item.type === "numeric");
if (!sample || sample.type !== "numeric") throw new Error("Missing half-metre activity");

describe("contrato entre enunciado, campo e correção", () => {
  it("mostra os passos da resposta de ordenação com rótulos em português no histórico", () => {
    const item = findLesson("fracoes-formatos")?.items.find((entry) => entry.type === "ordering");
    if (!item) throw new Error("Missing ordering activity");
    expect(responseLabel(publicItem(item), '["divide","part","multiply","result"]')).toBe(
      "Dividir 20 em 4 partes iguais → Reconhecer que uma parte vale 5 → Multiplicar o valor de uma parte por 3 → Concluir que três quartos de 20 são 15",
    );
    expect(responseLabel(publicItem(item), "__skip__")).toBe("Ainda não sei");
  });

  it.each([
    "0,5",
    "0.5",
    "1/2",
    "2/4",
    "1 / 2",
    "0,5 m",
    "1/2 metro",
  ])("aceita meia unidade escrita como %s sem exigir a unidade do rótulo", (answer) => {
    expect(gradeAnswer(sample, answer)).toMatchObject({ valid: true, correct: true });
  });

  it("também aceita o valor sem unidade em uma sessão congelada antes da correção", () => {
    const frozen = {
      ...sample,
      grading: {
        ...sample.grading,
        unit: { symbol: "m", aliases: ["metro", "metros"], required: true },
      },
    };
    expect(gradeAnswer(frozen, "1/2")).toMatchObject({ valid: true, correct: true });
    const markup = renderToStaticMarkup(
      createElement(ResponseInput, {
        item: publicItem(frozen),
        value: "",
        disabled: false,
        onChange: () => {},
      }),
    );
    expect(markup).toContain('type="text"');
    expect(markup).toContain('inputMode="text"');
    expect(markup).not.toContain("Inclua a unidade");
    expect(markup).toContain("/");
  });

  it.each([
    "0,5 cm",
    "1/(1+1)",
    "1/0",
    "",
    "NaN",
    "Infinity",
    "1 // 2",
  ])("não transforma uma entrada inválida em acerto: %s", (answer) =>
    expect(gradeAnswer(sample, answer).valid).toBe(false));

  it("aceita a notação monetária brasileira quando a unidade da questão é real", () => {
    const item = findLesson("precos-3")?.items.find((entry) => entry.id === "precos-3-7");
    if (!item) throw new Error("Missing cost per use activity");
    // R$ 72 divididos por 12 usos: custo de R$ 6 por uso.
    for (const answer of ["6", "6,00", "R$ 6,00", "R$6,00", "6 reais", "6 R$"])
      expect(gradeAnswer(item, answer), answer).toMatchObject({ valid: true, correct: true });
    for (const answer of ["US$ 6", "R$ 6 + 0"])
      expect(gradeAnswer(item, answer).valid, answer).toBe(false);
  });

  it("permite digitar sinais e frações em todos os campos numéricos, inclusive no celular", () => {
    for (const item of contentUnits.flatMap((lesson) => lesson.items)) {
      if (item.type !== "numeric") continue;
      const markup = renderToStaticMarkup(
        createElement(ResponseInput, {
          item: publicItem(item),
          value: "",
          disabled: false,
          onChange: () => {},
        }),
      );
      expect(markup, item.id).toContain('inputMode="text"');
    }
  });
});
