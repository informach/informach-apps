"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { useTheme } from "@informach/ui/components/theme-provider";
import { CreditCard, LogOut, Settings } from "lucide-react";
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
  const { theme, setTheme } = useTheme();
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
      {/* O círculo com as iniciais do canvas. Ele cabe num alvo de 44 px. */}
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Sua conta"
          className="flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-full border border-foreground/15 bg-background text-[13px] font-extrabold"
          >
            {initials}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/billing">
            <CreditCard className="mr-2 size-4" aria-hidden />
            Gerenciar assinatura
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/account">
            <Settings className="mr-2 size-4" aria-hidden />
            Conta e dados
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* O tema saiu do cabeçalho (o canvas mostra só a conta) e mora aqui. */}
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          Aparência
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">Clara</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Escura</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">Como no aparelho</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="text-destructive-ink focus:bg-destructive/10 focus:text-destructive-ink"
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
