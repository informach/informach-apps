import type { Metadata } from "next";
import { LandingTracker } from "@/components/marketing/landing-tracker";
import { StickyCta } from "@/components/marketing/sales-cta";
import { AiDemo } from "@/components/marketing/sections/ai-demo";
import { DayPage } from "@/components/marketing/sections/day-page";
import { Faq } from "@/components/marketing/sections/faq";
import { FinalCta } from "@/components/marketing/sections/final-cta";
import { Hero } from "@/components/marketing/sections/hero";
import { HowItWorks } from "@/components/marketing/sections/how-it-works";
import { KidTurn } from "@/components/marketing/sections/kid-turn";
import { Pricing } from "@/components/marketing/sections/pricing";
import { Trust } from "@/components/marketing/sections/trust";
import { Turma } from "@/components/marketing/sections/turma";
import { Who } from "@/components/marketing/sections/who";
import { todayLocalIso } from "@/features/dashboard/date";

const TITLE = "Agenda da Turma: a rotina da escola não precisa morar na sua cabeça";
// Até 155 caracteres: mais que isso, o buscador corta no meio da frase.
const DESCRIPTION =
  "Mande o recado do jeito que chegou. A Agenda separa o que fazer, até quando e o que vai na mochila, e você confere antes de salvar.";

export const metadata: Metadata = {
  // `absolute` porque o título da home já traz a marca; sem isso o template
  // do layout raiz a repetiria no fim.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "pt_BR",
    siteName: "Agenda da Turma",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function MarketingHome() {
  // A demonstração conta "amanhã" a partir de hoje, no fuso de São Paulo. A
  // página é renderizada a cada pedido (o layout raiz lê o nonce), então o dia
  // nunca fica preso ao do build.
  const todayIso = todayLocalIso();
  return (
    <div>
      <LandingTracker />
      <Hero />
      <HowItWorks />
      <AiDemo todayIso={todayIso} />
      <DayPage />
      <Turma />
      <KidTurn />
      <Trust />
      <Who />
      <Pricing />
      <Faq />
      <FinalCta />
      <StickyCta />
    </div>
  );
}
