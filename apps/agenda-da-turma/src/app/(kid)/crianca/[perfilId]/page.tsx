import { notFound } from "next/navigation";
import { z } from "zod";
import { todayLocalIso } from "@/features/dashboard/date";
import { KidModeScreen } from "@/features/kid-mode/components/kid-mode-screen";
import { getKidModeSnapshot } from "@/features/kid-mode/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "A vez da criança" };

export default async function KidModePage({ params }: { params: Promise<{ perfilId: string }> }) {
  const { perfilId } = await params;
  if (!z.string().uuid().safeParse(perfilId).success) notFound();

  const user = await requireUserServer();
  const snapshot = await getKidModeSnapshot(user.id, perfilId);
  // Inexistente e inacessível respondem igual: o 404 não conta a quem a criança
  // pertence.
  if (!snapshot) notFound();

  return (
    <KidModeScreen profile={snapshot.profile} todo={snapshot.todo} todayIso={todayLocalIso()} />
  );
}
