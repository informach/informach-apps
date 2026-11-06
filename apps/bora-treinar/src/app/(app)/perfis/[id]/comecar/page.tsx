import { notFound } from "next/navigation";
import { currentTrainer } from "@/features/familia/view";
import { ComecarPerfil } from "@/features/perfil/comecar";

export const metadata = { title: "Primeiro acesso" };

export default async function Comecar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profiles } = await currentTrainer();
  const perfil = profiles.find((p) => p.id === id && p.allowed);
  if (!perfil) notFound();
  return <ComecarPerfil perfil={{ id: perfil.id, name: perfil.name, color: perfil.color }} />;
}
