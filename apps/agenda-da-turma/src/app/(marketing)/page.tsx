import type { Metadata } from "next";
import { LandingTracker } from "@/components/marketing/landing-tracker";
import styles from "@/components/marketing/sales.module.css";
import { AiDemo } from "@/components/marketing/sections/ai-demo";
import { Faq } from "@/components/marketing/sections/faq";
import { Features } from "@/components/marketing/sections/features";
import { FinalCta } from "@/components/marketing/sections/final-cta";
import { Hero } from "@/components/marketing/sections/hero";
import { Pricing } from "@/components/marketing/sections/pricing";
import { Problem } from "@/components/marketing/sections/problem";
import { Trust } from "@/components/marketing/sections/trust";

const TITLE = "Agenda da Turma: a rotina da escola não precisa morar na sua cabeça.";
const DESCRIPTION =
  "Transforme mensagens, fotos e PDFs da escola em atividades claras. Confira os prazos e, no Pro, divida os cuidados e acompanhe com lembretes. Experimente sem cartão.";
export const metadata: Metadata = {
  // `absolute` porque o título da home já traz a marca; sem isso o template
  // do layout raiz a repetiria no fim.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", locale: "pt_BR" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};
export default function MarketingHome() {
  return (
    <div className={styles.home}>
      <LandingTracker />
      <Hero />
      <AiDemo />
      <Problem />
      <Features />
      <Trust />
      <Pricing />
      <Faq />
      <FinalCta />
    </div>
  );
}
