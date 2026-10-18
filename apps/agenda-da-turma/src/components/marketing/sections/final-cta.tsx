import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";
import { FREE_TRIAL_READS } from "@/features/billing/plans-content";
import { H2, SEC, WRAP } from "../landing-ui";

/** O fecho da prancha: o bloco azul com a pergunta e o botão branco. */
export function FinalCta() {
  return (
    <section aria-labelledby="closing-title" className={cn(SEC, "pt-6 min-[761px]:pt-6")}>
      <div className={WRAP}>
        <div className="flex flex-col items-start gap-6 rounded-[32px] bg-primary px-[clamp(24px,6vw,80px)] py-[clamp(40px,7vw,88px)] text-primary-foreground">
          <h2 id="closing-title" className={cn(H2, "max-w-[820px] text-primary-foreground")}>
            Qual recado está na sua cabeça agora? Comece por ele.
          </h2>
          <Link
            href="/signup"
            data-landing-action="cta"
            data-landing-placement="final"
            data-landing-plan="free"
            className="inline-flex min-h-[58px] items-center gap-2.5 rounded-[14px] bg-background px-7 text-lg font-extrabold text-foreground no-underline hover:bg-background/90"
          >
            Organizar esse recado
          </Link>
          <p className="text-base text-primary-foreground/85">
            Os {FREE_TRIAL_READS} primeiros recados são por nossa conta. Sem cartão.
          </p>
        </div>
      </div>
    </section>
  );
}
