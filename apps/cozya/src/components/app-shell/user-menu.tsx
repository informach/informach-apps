"use client";

import { INFORMACH_CONTACT } from "@informach/config/contact";
import { Avatar, AvatarFallback, AvatarImage } from "@informach/ui/components/avatar";
import { Button } from "@informach/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { CreditCard, LogOut, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { signOut } from "@/lib/auth-client";

export type UserMenuUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

export function UserMenu({ user }: { user: UserMenuUser }) {
  const router = useRouter();
  const [isSigningOut, startSignOutTransition] = useTransition();
  const initials = getInitials(user.name, user.email);
  const displayName = user.name ?? "Sua conta";

  const handleSignOut = () => {
    startSignOutTransition(async () => {
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push("/login");
            router.refresh();
          },
        },
      });
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Abrir menu do usuário"
        >
          <Avatar className="size-9">
            {user.image ? <AvatarImage src={user.image} alt={displayName} /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/account">Minha conta e cozinha</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/billing">
            <CreditCard className="mr-2 size-4" aria-hidden />
            Gerenciar assinatura
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={INFORMACH_CONTACT.directMessageUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-2 size-4" aria-hidden />
            Fale com a gente
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="mr-2 size-4" aria-hidden />
          {isSigningOut ? "Saindo…" : "Sair"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first && last && first !== last) {
      return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
    }
    if (first) {
      return first.slice(0, 2).toUpperCase();
    }
  }
  const local = email.split("@")[0] ?? email;
  return local.slice(0, 2).toUpperCase();
}
