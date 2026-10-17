import type { Metadata } from "next";
import { Faq } from "@/components/marketing/sections/faq";
import { FinalCta } from "@/components/marketing/sections/final-cta";
import { Hero } from "@/components/marketing/sections/hero";
import { KitchenDemo } from "@/components/marketing/sections/kitchen-demo";
import { Market } from "@/components/marketing/sections/market";
import { MealPrep } from "@/components/marketing/sections/meal-prep";
import { Pricing } from "@/components/marketing/sections/pricing";
import { RecipeCollection } from "@/components/marketing/sections/recipe-collection";
import { RepeatWeek } from "@/components/marketing/sections/repeat-week";
import { WeekStory } from "@/components/marketing/sections/week-story";
import { env } from "@/lib/env";

const TITLE = "Cozya: os jantares da semana decididos, com a lista do mercado";
const DESCRIPTION =
  "Escolha as receitas da semana, ajuste porções e marmitas e leve a lista do mercado somada. 14 dias grátis, sem cartão.";
const SOCIAL_IMAGE = {
  url: "/marketing/cozya-social.png",
  width: 1200,
  height: 630,
  alt: "Cozya: sua semana à mesa. Receitas, marmitas e lista do mercado organizadas.",
};

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "pt_BR",
    siteName: "Cozya",
    url: "/",
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
};

export default function MarketingHome() {
  return (
    <>
      <Hero />
      <WeekStory />
      <KitchenDemo />
      <RecipeCollection />
      <MealPrep />
      <Market />
      <RepeatWeek />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}
