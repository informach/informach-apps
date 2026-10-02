import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Review from "@/app/(app)/revisao/page";
import { findCourse } from "../content/catalog";
import { skillStates } from "./engine";

const { readDashboard } = vi.hoisted(() => ({ readDashboard: vi.fn() }));
vi.mock("@/lib/view", () => ({ currentDashboard: readDashboard }));
// The empty page has no action buttons, but their module imports server actions.
vi.mock("@/features/learning/actions", () => ({ startAction: vi.fn(), courseAction: vi.fn() }));

describe("revisão depois da mudança de faixa", () => {
  it("orienta a primeira prática quando as evidências pertencem somente à trilha anterior", async () => {
    const course = findCourse("obmep-n1");
    if (!course) throw new Error("Missing OBMEP track");
    const states = skillStates([
      {
        itemId: "contagem-inicial-1-1",
        skillId: "contagem-inicial",
        familyId: "contagem-inicial:learn:contar",
        correct: true,
        helpCount: 0,
        createdAt: new Date("2026-12-30T15:00:00Z"),
        mode: "mission",
        sessionId: "old-mirim-session",
      },
    ]);
    expect(states).toHaveLength(1);
    readDashboard.mockResolvedValue({ profile: { id: "profile", grade: 6 }, course, states });
    const html = renderToStaticMarkup(await Review());
    expect(html).toContain("Seu primeiro reencontro vem depois da prática.");
    expect(html).toContain('href="/jornada"');
    expect(html).toContain("Explorar minha jornada");
  });
});
