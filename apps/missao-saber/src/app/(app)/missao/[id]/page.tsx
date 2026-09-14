import { notFound } from "next/navigation";
import { z } from "zod";
import { Player } from "@/features/learning/components/player";
import { sessionView } from "@/features/learning/service";
import { requirePageUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export default async function Mission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requirePageUser();
  try {
    const view = await sessionView(user.id, id);
    return <Player initial={view} />;
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}
