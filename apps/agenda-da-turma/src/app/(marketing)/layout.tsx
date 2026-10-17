import type { ReactNode } from "react";
import styles from "@/components/marketing/sales.module.css";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={[styles.root, "flex min-h-screen flex-col"].join(" ")}>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
