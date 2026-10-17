import { Caveat } from "next/font/google";
import type { ReactNode } from "react";
import styles from "@/components/marketing/sales.module.css";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

// A letra de mão do cartaz de provas, só na ilustração do topo da página.
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={[styles.root, caveat.variable, "flex min-h-screen flex-col"].join(" ")}>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
