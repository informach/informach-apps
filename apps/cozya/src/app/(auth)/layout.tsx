import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/site-header";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader variant="auth" />

      {/* Decorative background. Subtle radial wash with brand tokens; very low
          opacity so it never competes with the form. Pointer-events-none. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-secondary/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-64 w-[40rem] -translate-x-1/2 translate-y-1/3 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <main className="relative z-10 flex flex-1 items-start justify-center px-4 py-10 md:items-center md:py-16">
        {children}
      </main>
    </div>
  );
}
