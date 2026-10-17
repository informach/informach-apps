import { Eye, Lock, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getStaffState } from "@/lib/access";
import { safeNext } from "@/lib/safe-next";
import { EntrarForm } from "./entrar-form";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Só um caminho do próprio Bastidores; nada de `//outro-site` vindo da barra de endereço.
  const next = safeNext((await searchParams).next);
  const state = await getStaffState();
  if (state.kind === "staff") redirect(next as "/");
  if (state.kind === "needs_two_factor") redirect("/duas-etapas");
  if (state.kind === "no_access") redirect("/sem-acesso");

  return (
    <div className="flex min-h-dvh flex-wrap bg-night text-night-ink">
      <section
        aria-label="Sobre o Bastidores"
        className="on-night flex min-w-0 flex-[1_1_420px] flex-col justify-between gap-10 p-[clamp(24px,6vw,80px)]"
      >
        <Brand size={44} />
        <div className="grid max-w-[520px] gap-4">
          <h1 className="m-0 text-[clamp(32px,4vw,52px)] leading-[1.05] font-extrabold tracking-[-0.03em]">
            Área restrita da equipe Informach.
          </h1>
          <p className="m-0 text-lg text-night-soft">
            Aqui a gente acompanha os produtos e as contas. Por isso a entrada pede duas etapas, e
            cada consulta fica registrada em nome de quem entrou.
          </p>
        </div>
        <ul className="m-0 grid list-none gap-2.5 p-0 text-[15px] text-night-muted">
          <li className="flex items-center gap-2.5">
            <Lock aria-hidden="true" className="size-[18px] text-sphere-light" />
            Só contas com papel owner ou admin
          </li>
          <li className="flex items-center gap-2.5">
            <ShieldCheck aria-hidden="true" className="size-[18px] text-sphere-light" />
            Código do aplicativo autenticador em toda entrada
          </li>
          <li className="flex items-center gap-2.5">
            <Eye aria-hidden="true" className="size-[18px] text-sphere-light" />
            Fichas consultadas entram na auditoria
          </li>
        </ul>
      </section>
      <section
        aria-labelledby="entrar"
        className="grid min-w-0 flex-[1_1_480px] place-items-center bg-paper p-[clamp(24px,6vw,80px)] text-ink"
      >
        <EntrarForm next={next} />
      </section>
    </div>
  );
}
