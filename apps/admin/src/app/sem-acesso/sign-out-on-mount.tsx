"use client";
import Link from "next/link";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

/** Encerra na hora a sessão de quem entrou sem papel, para ela não ficar aberta. */
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
