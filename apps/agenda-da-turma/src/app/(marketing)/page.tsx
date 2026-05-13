import type { Metadata } from "next";
import { AiDemo } from "@/components/marketing/sections/ai-demo";
import { Comparison } from "@/components/marketing/sections/comparison";
import { Faq } from "@/components/marketing/sections/faq";
import { Features } from "@/components/marketing/sections/features";
import { FinalCta } from "@/components/marketing/sections/final-cta";
import { Hero } from "@/components/marketing/sections/hero";
import { HowItWorks } from "@/components/marketing/sections/how-it-works";
import { Pricing } from "@/components/marketing/sections/pricing";
import { Problem } from "@/components/marketing/sections/problem";

const TITLE = "Agenda da Turma. A rotina escolar dos seus filhos num lugar só.";
const DESCRIPTION =
  "Cadastra prova falando, manda foto do quadro, joga o PDF da escola. A IA organiza por data, matéria e filho. Calendário, dashboard e compartilhamento com pais da turma. Grátis pra começar.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function MarketingHome() {
  return (
    <>
      <Hero />
      <AiDemo />
      <Problem />
      <HowItWorks />
      <Features />
      <Comparison />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}
