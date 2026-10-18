import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { SignOutOnMount } from "./sign-out-on-mount";

export const metadata: Metadata = { title: "Sem acesso" };
export const dynamic = "force-dynamic";

/** Recusa simples: não confirma se o e-mail existe nem conta o que há do outro lado. */
export default function SemAcessoPage() {
  return (
    <div className="on-night grid min-h-dvh place-items-center bg-night p-6 text-night-ink">
      <div className="grid w-full max-w-md gap-6">
        <Brand size={40} />
        <h1 className="m-0 text-3xl leading-tight font-extrabold tracking-[-0.02em]">
          Esta conta não tem acesso ao Bastidores.
        </h1>
        <SignOutOnMount />
      </div>
    </div>
  );
}
