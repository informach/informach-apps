import { describe, expect, it } from "vitest";
import { COMPASSO_POLICY, getAppCollection, getCollectionApps } from "./collections";
import { getAppUrl, resolveAccountReturnUrl } from "./domains";

describe("commercial collection boundaries", () => {
  it("covers eligible web apps without including desktop or administration", () => {
    expect(
      getCollectionApps("compasso")
        .map((app) => app.slug)
        .sort(),
    ).toEqual(["agenda-da-turma", "bora-treinar", "cozya", "dia-de-estrela", "missao-saber"]);
    expect(getAppCollection("edi")).toBe("edi");
    expect(getAppCollection("admin")).toBeNull();
    expect(getAppCollection("conta")).toBeNull();
    expect(getAppCollection("unknown")).toBeNull();
  });

  it("lists all five launched Compasso applications as available", () => {
    expect(
      getCollectionApps("compasso", { publishedOnly: true })
        .map((app) => app.slug)
        .sort(),
    ).toEqual(["agenda-da-turma", "bora-treinar", "cozya", "dia-de-estrela", "missao-saber"]);
  });

  it("uses the confirmed subscription and family policy", () => {
    expect(COMPASSO_POLICY.capacity).toEqual({ adults: 2, dependents: 4 });
    expect(COMPASSO_POLICY.trialDays).toBe(14);
    expect(COMPASSO_POLICY.monthlyAmountCents).toBe(4990);
    expect(COMPASSO_POLICY.annualAmountCents).toBe(49900);
  });
});

describe("registered account return destinations", () => {
  it("returns to the exact registered app with its path and query", () => {
    expect(resolveAccountReturnUrl("cozya", "/recipes?view=week", "production")).toBe(
      "https://cozya.informach.com.br/recipes?view=week",
    );
    expect(getAppUrl("conta", "development")).toBe("http://localhost:3011");
  });

  it.each([
    "https://evil.example/a",
    "//evil.example/a",
    "/\\evil.example/a",
    "/%5cevil.example/a",
    "/a\nLocation: https://evil.example",
    "/a#token",
  ])("rejects unsafe destination %s", (path) => {
    expect(() => resolveAccountReturnUrl("cozya", path, "production")).toThrow();
  });

  it("does not permit unknown or administrative applications", () => {
    expect(() => resolveAccountReturnUrl("admin", "/", "production")).toThrow();
    expect(() => resolveAccountReturnUrl("unknown", "/", "production")).toThrow();
  });
});
