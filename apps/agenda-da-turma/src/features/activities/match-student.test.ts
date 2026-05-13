import { describe, expect, it } from "vitest";
import { findClosestStudent } from "./match-student";

const students = [
  { id: "p1", name: "Pedro Silva", activeTurmaId: "t1" },
  { id: "p2", name: "Ana Souza", activeTurmaId: "t2" },
  { id: "p3", name: "Júlia Costa", activeTurmaId: null },
] as const;

describe("findClosestStudent", () => {
  it("retorna null para hint nulo ou vazio", () => {
    expect(findClosestStudent(students, null)).toBeNull();
    expect(findClosestStudent(students, "")).toBeNull();
    expect(findClosestStudent(students, undefined)).toBeNull();
  });

  it("casa pelo primeiro nome quando hint é só um token", () => {
    expect(findClosestStudent(students, "Pedro")?.id).toBe("p1");
    expect(findClosestStudent(students, "pedro")?.id).toBe("p1");
    expect(findClosestStudent(students, "Ana")?.id).toBe("p2");
  });

  it("casa nome completo exato", () => {
    expect(findClosestStudent(students, "Pedro Silva")?.id).toBe("p1");
    expect(findClosestStudent(students, "ana souza")?.id).toBe("p2");
  });

  it("casa nome com acento alternado (Júlia / Julia)", () => {
    expect(findClosestStudent(students, "Julia")?.id).toBe("p3");
    expect(findClosestStudent(students, "Júlia")?.id).toBe("p3");
  });

  it("casa erro de digitação dentro do limite", () => {
    expect(findClosestStudent(students, "Pedo")?.id).toBe("p1");
  });

  it("retorna null quando nome não está na lista", () => {
    expect(findClosestStudent(students, "Mariana")).toBeNull();
    expect(findClosestStudent(students, "Carlos")).toBeNull();
  });

  it("expõe activeTurmaId no perfil casado pra resolver turma", () => {
    expect(findClosestStudent(students, "Pedro")?.activeTurmaId).toBe("t1");
    expect(findClosestStudent(students, "Ana")?.activeTurmaId).toBe("t2");
    expect(findClosestStudent(students, "Júlia")?.activeTurmaId).toBeNull();
  });

  it("retorna null com array vazio", () => {
    expect(findClosestStudent([], "Pedro")).toBeNull();
  });
});
