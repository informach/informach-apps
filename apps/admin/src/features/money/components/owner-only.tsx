import { Lock } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/blocks";

/** Recusa calma para quem tem papel admin: nada de dinheiro é consultado. */
export function OwnerOnly() {
  return (
    <>
      <PageHeader title="Dinheiro" />
      <section className="grid max-w-2xl gap-3 rounded-[18px] border border-line-warm bg-surface p-6">
        <span className="flex items-center gap-2.5 font-bold">
          <Lock aria-hidden="true" className="size-5 text-sphere-ink" />
          Esta área é só para contas owner.
        </span>
        <p className="m-0 text-ink-soft">
          Receita, atrasos e avisos do Stripe ficam com as contas owner. Para um caso de pagamento,
          procure a pessoa em{" "}
          <Link href="/pessoas" className="font-bold text-ink">
            Pessoas
          </Link>
          : a ficha mostra o plano dela em cada produto.
        </p>
      </section>
    </>
  );
}
