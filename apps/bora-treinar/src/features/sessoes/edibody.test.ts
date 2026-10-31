import { describe, expect, it } from "vitest";
import { parseEdibodyBackup } from "./edibody";

const log = (exerciseId: string) => ({
  exerciseId,
  kind: "reps",
  target: 10,
  reps: 10,
  partials: 0,
  holdSeconds: 0,
  seconds: 30,
  issues: {},
});

describe("backup do EdiBody", () => {
  it("converte níveis pelo exercício e descarta logs inválidos", () => {
    const perfil = parseEdibodyBackup({
      app: "edibody",
      version: 1,
      profiles: [
        {
          id: 1,
          name: "Helena",
          color: "#3d7bff",
          createdAt: 1,
          progress: {
            empurrar: { level: 1, bonus: 2, streak: 1 },
            core: { level: 1, bonus: 0, streak: 0 },
          },
        },
      ],
      sessions: [
        {
          id: 9,
          profileId: 1,
          workoutId: "pratica:flexao",
          workoutName: "Prática: Flexão",
          startedAt: 1_700_000_000_000,
          duration: 300,
          mode: "manual",
          logs: [log("flexao"), log("voar")],
        },
      ],
    })[0];
    if (!perfil) throw new Error("perfil não importado");
    expect(perfil.color).toBe("#3D7BFF");
    // empurrar nível 1 do EdiBody era "flexao", que aqui é o nível 2
    expect(perfil.progress.empurrar).toEqual({ level: 2, bonus: 2, streak: 0 });
    // core nível 1 era "abdominal", que agora abre a trilha core
    expect(perfil.progress.core).toEqual({ level: 0, bonus: 0, streak: 0 });
    expect(perfil.sessions).toHaveLength(1);
    expect(perfil.sessions[0]?.logs.map((l) => l.exerciseId)).toEqual(["flexao"]);
    expect(perfil.sessions[0]?.workoutName).toBe("Prática: Flexão");
  });
  it("recusa arquivo de outro app", () => {
    expect(() => parseEdibodyBackup({ app: "outro", profiles: [], sessions: [] })).toThrow();
  });
});
