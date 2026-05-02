import type { Metadata } from "next";
import { Audience } from "@/components/marketing/sections/audience";
import { Comparison } from "@/components/marketing/sections/comparison";
import { Faq } from "@/components/marketing/sections/faq";
import { Features } from "@/components/marketing/sections/features";
import { FinalCta } from "@/components/marketing/sections/final-cta";
import { Hero } from "@/components/marketing/sections/hero";
import { HowItWorks } from "@/components/marketing/sections/how-it-works";
import { Pricing } from "@/components/marketing/sections/pricing";
import { Problem } from "@/components/marketing/sections/problem";

const TITLE = "Cozya — Suas receitas rápidas, sem caos";
const DESCRIPTION =
  "Capture receitas de prints, fotos, câmera ou voz. O Cozya estrutura com IA e organiza num app mobile-first. Grátis pra começar.";

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
      <Problem />
      <HowItWorks />
      <Features />
      <Audience />
      <Comparison />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}
