import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SiteFooter } from "../../components/site/footer";
import { AccountHeader } from "../../components/site/headers";
import { AccountView } from "../../features/account/account-view";
import { loadAccount } from "../../features/account/actions";
import { presentAccount } from "../../features/account/presenter";
import { billingConfigured } from "../../features/billing/catalog";
import { planFromParam, suitePricing } from "../../features/billing/pricing";
import { getAuth } from "../../lib/auth";
import { DEVICE_LIMIT, OFFLINE_HOURS } from "../../lib/desktop-limits";
import { getEnv } from "../../lib/env";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const plan = typeof params.plano === "string" ? planFromParam(params.plano) : null;
  const incoming = new Headers(await headers());
  if (!(await getAuth().getCurrentUser(incoming))) {
    // Coming from "Assinar" usually means a new visitor: open the sign-up tab.
    if (plan === "anual") redirect("/entrar?criar=1&next=%2Fconta%3Fplano%3Danual");
    if (plan === "mensal") redirect("/entrar?criar=1&next=%2Fconta%3Fplano%3Dmensal");
    redirect("/entrar?next=%2Fconta");
  }
  const pricing = suitePricing();
  const account = presentAccount(await loadAccount(), new Date(), pricing);
  return (
    <>
      <AccountHeader name={account.user.name} current="conta" />
      <main id="conteudo" className="container section">
        <AccountView
          account={account}
          billingReady={billingConfigured(getEnv())}
          pricing={pricing}
          initialPlan={plan ?? "mensal"}
          deviceLimit={DEVICE_LIMIT}
          offlineHours={OFFLINE_HOURS}
          checkout={
            params.checkout === "success"
              ? "success"
              : params.checkout === "canceled"
                ? "canceled"
                : null
          }
        />
      </main>
      <SiteFooter />
    </>
  );
}
