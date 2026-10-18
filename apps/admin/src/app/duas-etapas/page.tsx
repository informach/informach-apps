import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { sessionHasEnableProof } from "@/features/two-factor/proof";
import { getStaffState } from "@/lib/access";
import { TwoFactorSetup } from "./two-factor-setup";

export const metadata: Metadata = { title: "Ativar duas etapas" };
export const dynamic = "force-dynamic";

export default async function DuasEtapasPage() {
  const state = await getStaffState();
  if (state.kind === "anonymous") redirect("/entrar");
  if (state.kind === "no_access") redirect("/sem-acesso");
  if (state.kind === "staff") redirect("/");
  const emailConfirmed = await sessionHasEnableProof(state.sessionId);

  return (
    <div className="grid min-h-dvh bg-paper text-ink lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="on-night flex flex-col gap-8 bg-night p-[clamp(24px,5vw,64px)] text-night-ink">
        <Brand size={40} />
        <div className="grid gap-3">
          <h1 className="m-0 text-[clamp(28px,3.4vw,44px)] leading-[1.08] font-extrabold tracking-[-0.03em]">
            Antes de entrar, ative as duas etapas.
          </h1>
          <p className="m-0 text-lg text-night-soft">
            O Bastidores mostra contas de todos os produtos. Por isso, além da senha, toda entrada
            pede um código do aplicativo autenticador do seu celular.
          </p>
          <p className="m-0 text-night-soft">
            A senha é a mesma dos produtos Informach. Para ninguém além de você ligar um
            autenticador a esta conta, a ativação começa com um código no seu e-mail.
          </p>
        </div>
      </section>
      <section className="grid place-items-start p-[clamp(24px,5vw,64px)]">
        <TwoFactorSetup email={state.staff.email} emailConfirmed={emailConfirmed} />
      </section>
    </div>
  );
}
