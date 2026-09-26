import { notFound } from "next/navigation";
import { z } from "zod";
import { Player } from "@/features/learning/components/player";
import { sessionView } from "@/features/learning/service";
import { requirePageUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { currentDashboard } from "@/lib/view";

export const metadata = { title: "Missão" };

export default async function Mission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requirePageUser();
  try {
    const view = await sessionView(user.id, id);
    // `currentDashboard` é memoizado por requisição, então o layout já pagou
    // esta consulta: aqui só se lê a rotina escolhida pelo responsável.
    const data = await currentDashboard();
    return <Player initial={view} minutosSugeridos={data.family?.dailyMinutes ?? 0} />;
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}
