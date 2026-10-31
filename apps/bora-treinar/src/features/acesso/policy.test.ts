import { describe, expect, it } from "vitest";
import {
  type Access,
  canCountWithCamera,
  canStartWorkout,
  FREE_ACCESS,
  formatWorkoutRef,
  parseWorkoutRef,
} from "./policy";

const paid: Access = { paid: true, tier: "individual", profileLimit: 1 };

describe("referências de treino", () => {
  it("aceita só treinos e exercícios conhecidos", () => {
    expect(parseWorkoutRef("catalogo:primeiro-treino")).toEqual({
      kind: "catalogo",
      id: "primeiro-treino",
    });
    expect(parseWorkoutRef("pratica:flexao")).toEqual({ kind: "pratica", exerciseId: "flexao" });
    expect(parseWorkoutRef("meu:3f1c2f0e-7a52-4b6a-9b8e-0c2d1e4f5a6b")?.kind).toBe("meu");
    for (const invalid of ["catalogo:nao-existe", "meu:abc", "pratica:x", "x:y", "catalogo:a:b"])
      expect(parseWorkoutRef(invalid)).toBeNull();
  });
  it("ida e volta", () => {
    for (const ref of ["catalogo:hiit-12", "pratica:escalador"]) {
      const parsed = parseWorkoutRef(ref);
      expect(parsed && formatWorkoutRef(parsed)).toBe(ref);
    }
  });
});

describe("o que cada plano libera", () => {
  it("o gratuito tem o primeiro treino e a prática manual", () => {
    expect(canStartWorkout(FREE_ACCESS, { kind: "catalogo", id: "primeiro-treino" })).toBe(true);
    expect(canStartWorkout(FREE_ACCESS, { kind: "pratica", exerciseId: "flexao" })).toBe(true);
    expect(canStartWorkout(FREE_ACCESS, { kind: "catalogo", id: "hiit-12" })).toBe(false);
    expect(
      canStartWorkout(FREE_ACCESS, { kind: "meu", id: "3f1c2f0e-7a52-4b6a-9b8e-0c2d1e4f5a6b" }),
    ).toBe(false);
    expect(canCountWithCamera(FREE_ACCESS)).toBe(false);
  });
  it("a assinatura libera tudo", () => {
    expect(canStartWorkout(paid, { kind: "catalogo", id: "hiit-12" })).toBe(true);
    expect(canCountWithCamera(paid)).toBe(true);
  });
});
