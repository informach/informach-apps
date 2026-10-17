import Link from "next/link";
import { getRecentRecipePreviews } from "@/features/ai/previews";
import { getIsProForUser } from "@/features/billing/server-cache";
import { RecentAiPreviews } from "@/features/recipes/components/recent-ai-previews";
import { countUserRecipes } from "@/features/recipes/service";
import { requireUserServer } from "@/lib/auth";

export default async function RecoverRecipesPage() {
  const user = await requireUserServer();
  const [previews, isPro, currentCount] = await Promise.all([
    getRecentRecipePreviews(user.id),
    getIsProForUser(user.id),
    countUserRecipes(user.id),
  ]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link
        href="/receitas"
        className="inline-flex min-h-11 items-center text-sm font-bold underline"
      >
        Voltar para Suas receitas
      </Link>
      <div>
        <h1 className="text-[30px] font-extrabold tracking-display">
          Receitas que a IA organizou há pouco
        </h1>
        <p className="mt-2 text-muted-foreground">
          Se a conexão caiu ou você fechou a tela, recupere aqui os resultados concluídos nas
          últimas 24 horas, sem nova cobrança. Eles ainda precisam da sua revisão.
        </p>
      </div>
      <RecentAiPreviews previews={previews} isPro={isPro} currentCount={currentCount} />
    </main>
  );
}
