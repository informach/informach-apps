import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FichaView } from "@/features/people/components/ficha-view";
import { loadFicha } from "@/features/people/loaders";
import { requireStaff } from "@/lib/access";

export const metadata: Metadata = { title: "Ficha" };

/** Abrir a ficha grava a consulta na auditoria (`admin.user_viewed`), em nome de quem abriu. */
export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const ficha = await loadFicha(decodeURIComponent(id), staff);
  if (!ficha) notFound();
  return <FichaView ficha={ficha} staff={staff} />;
}
