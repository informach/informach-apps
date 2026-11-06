import { familyExport } from "@/features/familia/repository";
import { familyOfAdult } from "@/features/familia/view";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Cópia de tudo o que o Dia de Estrela guarda sobre a família (LGPD, portabilidade). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.emailVerified) return new Response("Entre na conta para exportar.", { status: 401 });
  const { ownerId, role } = await familyOfAdult(user.id);
  if (role !== "owner") return new Response("Só o titular exporta os dados.", { status: 403 });
  const d = await familyExport(ownerId);
  const corpo = {
    app: "dia-de-estrela",
    exportedAt: new Date().toISOString(),
    family: d.family
      ? {
          timezone: d.family.timezone,
          starsPerReal: d.family.starsPerReal,
          warnBefore: d.family.warnBefore,
          repeatEvery: d.family.repeatEvery,
          alertAfter: d.family.alertAfter,
          sound: d.family.sound,
          voice: d.family.voice,
          calm: d.family.calm,
          chestBonus: d.family.chestBonus,
        }
      : null,
    children: d.children.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      createdAt: c.createdAt,
      tasks: d.taskRows.filter((t) => t.childId === c.id),
      stars: d.ledgerRows
        .filter((l) => l.childId === c.id)
        .map((l) => ({ kind: l.kind, stars: l.stars, label: l.label, createdAt: l.createdAt })),
      goal: d.goalRows.find((g) => g.childId === c.id) ?? null,
      requests: d.redemptionRows.filter((r) => r.childId === c.id),
    })),
    rewards: d.rewardRows,
  };
  return new Response(JSON.stringify(corpo, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dia-de-estrela-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
