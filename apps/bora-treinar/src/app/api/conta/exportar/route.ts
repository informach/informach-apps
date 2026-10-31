import { familyExport } from "@/features/familia/repository";
import { sessionsOf } from "@/features/sessoes/repository";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Cópia de tudo o que o Bora Treinar guarda sobre a família (LGPD, portabilidade). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.emailVerified) return new Response("Entre na conta para exportar.", { status: 401 });
  const dados = await familyExport(user.id);
  const sessions = await Promise.all(dados.profiles.map((p) => sessionsOf(p.id)));
  const corpo = {
    app: "bora-treinar",
    exportedAt: new Date().toISOString(),
    family: dados.family
      ? {
          reminderDays: dados.family.reminderDays,
          reminderHour: dados.family.reminderHour,
          timezone: dados.family.timezone,
          weeklySummary: dados.family.weeklySummary,
        }
      : null,
    profiles: dados.profiles.map((p, i) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      createdAt: p.createdAt,
      progress: dados.progress.filter((r) => r.profileId === p.id),
      achievements: dados.achievements.filter((a) => a.profileId === p.id),
      sessions: sessions[i] ?? [],
    })),
    customWorkouts: dados.workouts,
    challenges: dados.challenges,
  };
  return new Response(JSON.stringify(corpo, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="bora-treinar-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
