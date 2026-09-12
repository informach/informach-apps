import { exportAgendaAccount } from "@/features/account/export-repository";
import { getServerSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
export async function GET() {
  const session = await getServerSession();
  if (!session?.user) return new Response(null, { status: 401 });
  const userId = session.user.id;
  try {
    await enforceRateLimit({ key: `export:${userId}`, limit: 3, windowSeconds: 3600 });
  } catch {
    return new Response(null, { status: 429 });
  }
  const data = await exportAgendaAccount(userId);
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
