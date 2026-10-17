import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountView } from "../../features/account/account-view";
import { loadAccount } from "../../features/account/actions";
import { billingConfigured } from "../../features/billing/catalog";
import { getAuth } from "../../lib/auth";
import { getEnv } from "../../lib/env";
export default async function AccountPage() {
  const incoming = new Headers(await headers());
  if (!(await getAuth().getCurrentUser(incoming))) redirect("/entrar");
  const account = await loadAccount();
  return <AccountView account={account} billingReady={billingConfigured(getEnv())} />;
}
