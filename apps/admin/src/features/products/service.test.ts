import { describe, expect, it } from "vitest";
import { aiSentence, creditPairs } from "./service";

describe("créditos e IA em Produtos", () => {
  it("usa as mesmas regras de Dinheiro: falha pelas reservas, reembolso e compensação à parte", () => {
    const pairs = creditPairs(
      [
        { entryType: "purchase", amount: 100 },
        { entryType: "consumption", amount: -30 },
        { entryType: "adjustment", amount: 5 },
        { entryType: "refund", amount: -20 },
        { entryType: "expiration", amount: -10 },
      ],
      [
        { status: "committed", total: 9, credits: 30 },
        { status: "released", total: 2, credits: 6 },
      ],
    );
    expect(pairs).toEqual([
      { label: "Créditos concedidos", value: "100" },
      { label: "Créditos usados", value: "30" },
      { label: "Devolvidos por falha, em 2 tarefas", value: "6" },
      { label: "Chegaram ao vencimento, pelo valor concedido", value: "10" },
      { label: "Dados como compensação", value: "5" },
      { label: "Retirados por reembolso", value: "20" },
    ]);
    // Reembolso nunca aparece como devolução por falha.
    expect(pairs.find((pair) => pair.label.startsWith("Devolvidos"))?.value).not.toBe("20");
  });

  it("sem movimento não mostra a lista", () => {
    expect(creditPairs([], [{ status: "committed", total: 3, credits: 3 }])).toEqual([]);
  });

  it("calcula a falha sobre as tarefas encerradas, como no Painel e em Operação", () => {
    const sentence = aiSentence(undefined, [
      { status: "committed", total: 9 },
      { status: "released", total: 1 },
      { status: "active", total: 10 },
    ]);
    expect(sentence).toBe(
      "20 tarefas na semana; das encerradas, 10% falharam e devolveram o crédito.",
    );
  });
});
