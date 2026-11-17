import { selectedFamilyContext } from "@/features/familia/context";
import { familyExport } from "@/features/familia/repository";
import { recentParent, runAction } from "@/lib/action";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Cópia de tudo o que o Dia de Estrela guarda sobre a família (LGPD, portabilidade). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.emailVerified) return new Response("Entre na conta para exportar.", { status: 401 });
  const family = await selectedFamilyContext(user.id);
  if (!family) return new Response("Escolha uma família.", { status: 403 });
  const result = await runAction(async () => {
    await recentParent();
    return familyExport({ kind: "adult", userId: user.id, familyGroupId: family.id });
  });
  if (!result.ok) return Response.json(result, { status: 403 });
  const d = result.data;
  const goals = d.goalRows.map((goal) => ({
    ...goal,
    photo: goal.photo?.toString("base64") ?? null,
  }));
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
      goal: goals.find((g) => g.childId === c.id) ?? null,
      requests: d.redemptionRows.filter((r) => r.childId === c.id),
    })),
    rewards: d.rewardRows,
    completions: d.completions,
    voices: d.voices.map((voice) => ({ ...voice, data: voice.data.toString("base64") })),
  };
  return new Response(JSON.stringify(corpo, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dia-de-estrela-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
