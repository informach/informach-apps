"use client";

import { Button } from "@informach/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@informach/ui/components/sheet";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { Menu } from "lucide-react";
import { type MouseEvent, useRef, useState } from "react";

export type MobileNavLink = {
  href: string;
  label: string;
};

export type SiteHeaderMobileNavProps = {
  links: ReadonlyArray<MobileNavLink>;
  cta: MobileNavLink;
};

/**
 * Enquanto a gaveta está aberta, a rolagem da página fica travada e o salto da
 * âncora se perde. O link só guarda o destino; a navegação acontece depois que
 * a gaveta termina de fechar e devolve a rolagem.
 */
export function SiteHeaderMobileNav({ links, cta }: SiteHeaderMobileNavProps) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const pendingHref = useRef<string | null>(null);

  function goTo(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    pendingHref.current = event.currentTarget.getAttribute("href");
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Abrir menu"
          disabled={!hydrated}
          className="size-11"
        >
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-80 bg-paper"
        onCloseAutoFocus={(event) => {
          const href = pendingHref.current;
          if (!href) return;
          pendingHref.current = null;
          event.preventDefault();
          window.location.assign(href);
        }}
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">
          Navegação principal do site da Informach.
        </SheetDescription>
        <nav aria-label="Principal" className="mt-10 flex flex-col gap-1 px-2">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={goTo}
              className="rounded-xl px-3 py-3 text-base font-semibold text-ink transition-colors hover:bg-sand"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-6 border-t border-line-warm pt-6">
            <a
              href={cta.href}
              onClick={goTo}
              className="flex min-h-12 items-center justify-center rounded-full bg-ink px-4 text-[15px] font-bold whitespace-nowrap text-paper no-underline"
            >
              {cta.label}
            </a>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
