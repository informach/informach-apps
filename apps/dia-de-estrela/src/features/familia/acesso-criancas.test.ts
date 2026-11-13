import { describe, expect, it } from "vitest";
import { allowedChildIds } from "./acesso-criancas";

const c = (id: string, accessEnabled = true) => ({ id, accessEnabled });

describe("crianças liberadas pelo plano", () => {
  it("o Compasso libera todas, até quatro", () => {
    expect(allowedChildIds([c("a"), c("b"), c("c"), c("d"), c("e")], 4)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
  it("o gratuito fica com a criança escolhida ao rebaixar", () => {
    expect(allowedChildIds([c("a", false), c("b", true)], 1)).toEqual(["b"]);
  });
  it("sem escolha, fica a primeira", () => {
    expect(allowedChildIds([c("a", false), c("b", false)], 1)).toEqual(["a"]);
    expect(allowedChildIds([], 1)).toEqual([]);
  });
});
