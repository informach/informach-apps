import { Button } from "@informach/ui/components/button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { OriginalNotice } from "@/features/notices/components/original-notice";
import { getNoticeSource } from "@/features/notices/repository";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Documento original",
  robots: { index: false, follow: false },
};
export default async function NoticeOriginalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserServer();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const source = await getNoticeSource(user.id, id);
  if (source?.status !== "confirmed") notFound();
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-28 sm:px-8">
      <Link href="/recados" className="text-sm underline">
        Voltar aos recados e originais
      </Link>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Consultar original</h1>
        <p className="text-sm text-muted-foreground">
          Este documento fica vinculado às atividades que você confirmou.
        </p>
      </header>
      <OriginalNotice source={source} />
      <Button asChild>
        <Link href={`/atividades?recado=${id}&situacao=all`}>Ver atividades deste original</Link>
      </Button>
    </main>
  );
}
