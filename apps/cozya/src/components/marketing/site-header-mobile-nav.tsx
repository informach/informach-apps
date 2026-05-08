"use client";

import { Button } from "@informach/ui/components/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@informach/ui/components/sheet";
import { Menu } from "lucide-react";
import Link from "next/link";

export type MobileNavLink = {
  href: string;
  label: string;
};

export type SiteHeaderMobileNavProps = {
  links: ReadonlyArray<MobileNavLink>;
};

export function SiteHeaderMobileNav({ links }: SiteHeaderMobileNavProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir menu">
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <div className="mt-8 flex flex-col gap-1">
          {links.map((link) => (
            <SheetClose asChild key={link.href}>
              <a
                href={link.href}
                className="rounded-md px-3 py-3 text-base font-medium text-foreground transition-colors hover:bg-accent"
              >
                {link.label}
              </a>
            </SheetClose>
          ))}
          <div className="mt-6 flex flex-col gap-2 border-t border-border pt-6">
            <SheetClose asChild>
              <Button variant="outline" asChild>
                <Link href="/login">Entrar</Link>
              </Button>
            </SheetClose>
            <SheetClose asChild>
              <Button asChild>
                <Link href="/signup">Criar conta grátis</Link>
              </Button>
            </SheetClose>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
