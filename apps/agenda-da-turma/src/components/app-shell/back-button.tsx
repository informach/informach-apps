import { Button } from "@informach/ui/components/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="icon" className="-ml-2.5 size-11 shrink-0">
      <Link href={href} aria-label={label}>
        <ArrowLeft className="size-5" aria-hidden />
      </Link>
    </Button>
  );
}
