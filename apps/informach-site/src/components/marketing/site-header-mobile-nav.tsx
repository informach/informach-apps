"use client";

import { Button } from "@informach/ui/components/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@informach/ui/components/sheet";
import { Menu } from "lucide-react";

export type MobileNavLink = {
  href: string;
  label: string;
};

export type SiteHeaderMobileNavProps = {
  links: ReadonlyArray<MobileNavLink>;
  communityUrl: string;
};

export function SiteHeaderMobileNav({ links, communityUrl }: SiteHeaderMobileNavProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir menu">
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">
          Navegação principal do site da Informach.
        </SheetDescription>
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
          <div className="mt-6 border-t border-border pt-6">
            <SheetClose asChild>
              <Button asChild>
                <a href={communityUrl} target="_blank" rel="noopener noreferrer">
                  Entrar na comunidade
                </a>
              </Button>
            </SheetClose>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
