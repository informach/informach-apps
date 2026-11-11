import { isRecentWebAuthentication } from "@informach/auth/web-sessions";
import { familyExport } from "@/features/familia/repository";
import { todasAsSessoes } from "@/features/sessoes/repository";
import { getCurrentUser, getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Cópia de tudo o que o Bora Treinar guarda sobre a família (LGPD, portabilidade). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.emailVerified) return new Response("Entre na conta para exportar.", { status: 401 });
  // Numa TV da casa, qualquer perfil (uma criança, inclusive) baixava os dados da família inteira
  // pelo botão do Progresso. Agora a exportação exige o mesmo login recente da Conta.
  const session = await getSession();
  const recente =
    !!session &&
    (await isRecentWebAuthentication({
      userId: session.user.id,
      sessionId: session.session.id,
      app: "bora-treinar",
      maxAgeSeconds: 600,
    }));
  if (!recente)
    return new Response(null, {
      status: 303,
      headers: { Location: "/entrar?reautenticar=1&next=%2Fconta" },
    });
  const dados = await familyExport(user.id);
  // um perfil por vez e em páginas: um histórico longo não estoura a consulta
  const sessions: Awaited<ReturnType<typeof todasAsSessoes>>[] = [];
  for (const p of dados.profiles) sessions.push(await todasAsSessoes(user.id, p.id));
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
      intensity: p.intensity,
      weeklyGoal: p.weeklyGoal,
      minutesPref: p.minutesPref,
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
