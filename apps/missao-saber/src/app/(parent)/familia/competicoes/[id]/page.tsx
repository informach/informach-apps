import { notFound } from "next/navigation";
import { z } from "zod";
import { Sala } from "@/features/competition/components/sala";
import { competitionView } from "@/features/competition/service";
import { requirePageUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Sala da competição" };

export default async function SalaDaCompeticao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requirePageUser();
  try {
    return (
      <div className="mx-auto max-w-6xl">
        <Sala inicial={await competitionView(user.id, id)} />
      </div>
    );
  } catch (erro) {
    if (erro instanceof AppError && erro.code === "NOT_FOUND") notFound();
    throw erro;
  }
}
