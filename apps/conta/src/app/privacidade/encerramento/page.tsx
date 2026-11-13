import { WebClosureError } from "@informach/account/closure";
import { UnauthorizedError } from "@informach/auth";
import { RateLimitError } from "@informach/auth/server-actions";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ClosurePanel } from "@/features/account/closure-panel";
import { loadAccountClosure } from "@/features/account/closure-service";
import { DeparturePanel } from "@/features/account/departure-panel";
import { loadDepartureReview } from "@/features/account/departure-service";
import { getEnv } from "@/lib/env";

export const metadata = { title: "Preparar encerramento" };
export const dynamic = "force-dynamic";
export default async function DeparturePage({
  searchParams,
}: {
  searchParams: Promise<{ avaliacao?: string }>;
}) {
  const assessment = z.uuid().safeParse((await searchParams).avaliacao);
  let review: Awaited<ReturnType<typeof loadDepartureReview>>;
  try {
    const closure = await loadAccountClosure(await headers());
    if (closure) return <ClosurePanel closure={closure} />;
    review = await loadDepartureReview(
      await headers(),
      assessment.success ? assessment.data : undefined,
    );
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof WebClosureError && error.code === "unauthorized")
    )
      redirect("/entrar?next=%2Fprivacidade%2Fencerramento");
    if (error instanceof RateLimitError)
      return (
        <main id="conteudo" className="departure-main">
          <h1>Aguarde para consultar novamente.</h1>
          <p>Você atingiu o limite de consultas desta hora. Seus dados continuam preservados.</p>
          <a href="/#privacidade">Voltar para minha conta</a>
        </main>
      );
    throw error;
  }
  return <DeparturePanel review={review} environment={getEnv().environment} />;
}
