import { AppsShowcase } from "@/components/marketing/apps-showcase";
import { Community } from "@/components/marketing/community";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { Manifesto } from "@/components/marketing/manifesto";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Manifesto />
      <AppsShowcase />
      <Community />
      <FinalCta />
    </>
  );
}
