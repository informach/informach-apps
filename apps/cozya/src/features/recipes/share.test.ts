import { describe, expect, it } from "vitest";
import { buildWhatsappShareUrl, countIngredients, parseIngredients } from "./share";

describe("parseIngredients", () => {
  it("returns trimmed non-empty lines in order", () => {
    expect(parseIngredients("farinha\novos\nleite")).toEqual(["farinha", "ovos", "leite"]);
  });

  it("ignores blank lines and surrounding whitespace", () => {
    expect(parseIngredients("  farinha  \n\n  ovos\n   \nleite\n")).toEqual([
      "farinha",
      "ovos",
      "leite",
    ]);
  });

  it("returns an empty array when input has only whitespace", () => {
    expect(parseIngredients("\n  \n\t\n")).toEqual([]);
  });
});

describe("countIngredients", () => {
  it("counts non-empty lines", () => {
    expect(countIngredients("farinha\novos\nleite")).toBe(3);
  });

  it("ignores blank lines and surrounding whitespace", () => {
    expect(countIngredients("  farinha  \n\n  ovos\n   \nleite\n")).toBe(3);
  });

  it("returns zero when input has only whitespace", () => {
    expect(countIngredients("\n  \n\t\n")).toBe(0);
  });
});

describe("buildWhatsappShareUrl", () => {
  it("starts with the wa.me prefix", () => {
    const url = buildWhatsappShareUrl({
      name: "Bolo",
      ingredients: "farinha",
      preparation: "Misture",
      finishing: null,
    });
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("encodes the recipe text and includes section markers", () => {
    const url = buildWhatsappShareUrl({
      name: "Bolo de cenoura",
      ingredients: "cenoura\novos",
      preparation: "Misture e asse",
      finishing: "Cobertura de chocolate",
    });
    const text = decodeURIComponent(url.replace("https://wa.me/?text=", ""));
    expect(text).toContain("*Bolo de cenoura*");
    expect(text).toContain("*Ingredientes:*");
    expect(text).toContain("cenoura");
    expect(text).toContain("*Modo de preparo:*");
    expect(text).toContain("Misture e asse");
    expect(text).toContain("*Finalização:*");
    expect(text).toContain("Cobertura de chocolate");
  });

  it("omits finalização when missing or whitespace", () => {
    const urlNull = buildWhatsappShareUrl({
      name: "Bolo",
      ingredients: "farinha",
      preparation: "Misture",
      finishing: null,
    });
    const urlBlank = buildWhatsappShareUrl({
      name: "Bolo",
      ingredients: "farinha",
      preparation: "Misture",
      finishing: "   ",
    });
    expect(decodeURIComponent(urlNull)).not.toContain("Finalização");
    expect(decodeURIComponent(urlBlank)).not.toContain("Finalização");
  });

  it("encodes reserved characters such as ampersand, spaces and newlines", () => {
    const url = buildWhatsappShareUrl({
      name: "Bolo & Cia",
      ingredients: "farinha",
      preparation: "Misture",
      finishing: null,
    });
    expect(url).toContain("%26");
    expect(url).toContain("%20");
    expect(url).toContain("%0A");
  });
});
