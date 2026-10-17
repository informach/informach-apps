"use client";
import Link from "next/link";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * A sessão de quem entrou sem papel já foi apagada no servidor, no ponto em que
 * o acesso foi negado (`getStaffState`). Aqui só sai o cookie do navegador.
 */
export function SignOutOnMount() {
  useEffect(() => {
    void authClient.signOut().catch(() => undefined);
  }, []);
  return (
    <Link href="/entrar" className="font-bold text-night-ink underline underline-offset-2">
      Entrar com outra conta
    </Link>
  );
}
