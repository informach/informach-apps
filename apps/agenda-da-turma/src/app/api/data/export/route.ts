import { FamilyError } from "@informach/family";
import { exportAgendaAccount } from "@/features/account/export-repository";
import { agendaAuthority } from "@/features/family/context";
import { getServerSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.user) return new Response(null, { status: 401 });
  const userId = session.user.id;
  try {
    await enforceRateLimit({ key: `export:${userId}`, limit: 3, windowSeconds: 3600 });
  } catch {
    return new Response(null, { status: 429 });
  }
  const actor = await agendaAuthority(userId);
  if (new URL(request.url).searchParams.get("familia") !== actor.familyGroupId)
    return Response.json({ error: "CONTEXT_CHANGED" }, { status: 409 });
  let data: Awaited<ReturnType<typeof exportAgendaAccount>>;
  try {
    data = await exportAgendaAccount(actor);
  } catch (error) {
    if (error instanceof FamilyError)
      return Response.json({ error: "ACCESS_DENIED" }, { status: 403 });
    throw error;
  }
  return Response.json(
    {
      exportedAt: new Date().toISOString(),
      account: { name: session.user.name, email: session.user.email },
      ...data,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": 'attachment; filename="agenda-da-turma-dados.json"',
      },
    },
  );
}
