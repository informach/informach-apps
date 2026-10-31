import { describe, expect, it } from "vitest";
import { buildSteps } from "@/features/treino/catalog/workouts";
import { customWorkoutSchema, toWorkout } from "./schema";

const valid = {
  name: "Treino da manhã",
  subtitle: "Rápido antes da escola",
  level: "Iniciante",
  focus: "Força",
  blocks: [
    { type: "sets", slot: "trilha:pernas", sets: 3, target: 10, rest: 40 },
    { type: "interval", label: "Tabata", slots: ["polichinelo"], work: 20, rest: 10, rounds: 8 },
    { type: "emom", label: "EMOM", slots: [{ slot: "flexao", reps: 6 }], minutes: 4 },
    { type: "amrap", label: "AMRAP", slots: [{ slot: "agachamento", reps: 10 }], minutes: 5 },
  ],
};

describe("treinos montados pela família", () => {
  it("aceita blocos válidos e gera os passos do player", () => {
    const parsed = customWorkoutSchema.parse(valid);
    const workout = toWorkout({ id: "3f1c2f0e-7a52-4b6a-9b8e-0c2d1e4f5a6b", ...parsed });
    expect(workout?.id).toBe("meu:3f1c2f0e-7a52-4b6a-9b8e-0c2d1e4f5a6b");
    expect(workout && buildSteps(workout).length).toBeGreaterThan(5);
  });
  it.each([
    ["exercício inexistente", { type: "sets", slot: "voar", sets: 3, target: 10, rest: 40 }],
    ["trilha inexistente", { type: "sets", slot: "trilha:x", sets: 3, target: 10, rest: 40 }],
    ["séries demais", { type: "sets", slot: "flexao", sets: 50, target: 10, rest: 40 }],
    ["bloco desconhecido", { type: "corrida", minutes: 3 }],
  ])("recusa %s", (_, block) => {
    expect(customWorkoutSchema.safeParse({ ...valid, blocks: [block] }).success).toBe(false);
  });
  it("recusa treino longo demais", () => {
    const longo = Array.from({ length: 12 }, () => ({
      type: "amrap",
      label: "AMRAP",
      slots: [{ slot: "agachamento", reps: 10 }],
      minutes: 30,
    }));
    expect(customWorkoutSchema.safeParse({ ...valid, blocks: longo }).success).toBe(false);
  });
});
