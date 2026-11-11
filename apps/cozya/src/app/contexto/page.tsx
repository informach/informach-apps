import Link from "next/link";
import { familyAccountUrl } from "@/features/family/account-link";
import { cozyaAuthority } from "@/features/family/context";
import { FamilyContext } from "@/features/family/family-context";
import { familyService } from "@/features/family/service-repository";
import { redirectIfUnauthenticated } from "@/lib/auth";
export const metadata = { title: "Família e Compasso | Cozya" };
export default async function ContextPage() {
  const user = await redirectIfUnauthenticated("/contexto");
  const [groups, actor] = await Promise.all([
    familyService.listGroups(user.id),
    cozyaAuthority(user.id),
  ]);
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <Link href="/hoje" className="font-semibold underline">
        Voltar ao Cozya
      </Link>
      <h1 className="mt-8 text-3xl font-extrabold">Seu Compasso no Cozya</h1>
      <p className="mt-4 text-muted-foreground">
        Escolha a família que fornece sua assinatura e seus créditos de IA. Suas receitas,
        preferências e planejamentos continuam pessoais.
      </p>
      <FamilyContext groups={groups} selected={actor.familyGroupId} />
      <a className="font-semibold underline" href={familyAccountUrl(actor.familyGroupId)}>
        Gerenciar minha família e o Compasso
      </a>
    </main>
  );
}
