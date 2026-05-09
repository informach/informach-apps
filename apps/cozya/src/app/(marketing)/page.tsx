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

const TITLE = "Cozya — Receita por voz, foto ou prompt. Sem digitar.";
const DESCRIPTION =
  "Capture receitas falando, fotografando print ou descrevendo em uma frase. A IA estrutura em segundos e refina conversando ('faz vegana', 'metade das porções'). Grátis pra começar.";

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
