import { redirect } from "next/navigation";

/** Ver `perfis/page.tsx`: turmas passaram a morar em Família. */
export default async function TurmasPage({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string }>;
}) {
  const { perfil } = await searchParams;
  redirect(perfil ? `/familia/turmas?perfil=${encodeURIComponent(perfil)}` : "/familia/turmas");
}
