import { familyExport } from "@/features/familia/repository";
import { sessionsOf } from "@/features/sessoes/repository";
import { getCurrentUser, getSession } from "@/lib/auth";

/** Mesma janela da Conta: exportar os dados da família pede um login recente. */
const ACESSO_RECENTE_MS = 10 * 60_000;

export const dynamic = "force-dynamic";

/** Cópia de tudo o que o Bora Treinar guarda sobre a família (LGPD, portabilidade). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.emailVerified) return new Response("Entre na conta para exportar.", { status: 401 });
  // Numa TV da casa, qualquer perfil (uma criança, inclusive) baixava os dados da família inteira
  // pelo botão do Progresso. Agora a exportação exige o mesmo login recente da Conta.
  const session = await getSession();
  const recente =
    !!session && Date.now() - new Date(session.session.createdAt).getTime() < ACESSO_RECENTE_MS;
  if (!recente)
    return new Response(null, {
      status: 303,
      headers: { Location: "/entrar?next=%2Fconta" },
    });
  const dados = await familyExport(user.id);
  const sessions = await Promise.all(
    dados.profiles.map((p) => sessionsOf(p.id, { limit: 1_000_000 })),
  );
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
