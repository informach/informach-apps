import { FinalCta } from "@/components/marketing/final-cta";
import { Founders } from "@/components/marketing/founders";
import { Hero } from "@/components/marketing/hero";
import { Principles } from "@/components/marketing/principles";
import { Products } from "@/components/marketing/products";
import { SistemaZero } from "@/components/marketing/sistema-zero";
import { StartChooser } from "@/components/marketing/start-chooser";

export default function HomePage() {
  return (
    <>
      <Hero />
      <StartChooser />
      <SistemaZero />
      <Products />
      <Principles />
      <Founders />
      <FinalCta />
    </>
  );
}
