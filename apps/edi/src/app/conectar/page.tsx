import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { SiteFooter } from "../../components/site/footer";
import { AccountHeader, MarketingHeader } from "../../components/site/headers";
import { getAccount } from "../../features/account/service";
import { DeviceApproval } from "../../features/auth/device-approval";
import { billingConfigured } from "../../features/billing/catalog";
import { getAuth } from "../../lib/auth";
import { DEVICE_LIMIT } from "../../lib/desktop-limits";
import { getEnv } from "../../lib/env";

export const metadata: Metadata = { title: "Conectar computador" };

export default async function ConnectPage() {
  // Reading the request first keeps this route dynamic; auth needs the runtime env.
  const incoming = new Headers(await headers());
  const user = await getAuth().getCurrentUser(incoming);
  if (!user)
    return (
      <>
        <MarketingHeader billingOpen={billingConfigured(getEnv())} />
        <main id="conteudo" className="container section">
          <div className="narrow">
            <span className="eyebrow">Conectar computador</span>
            <h1 className="display-2">Entre para conectar este computador.</h1>
            <p className="lede">
              O Edi Hub abriu esta página para confirmar que o computador é seu. Entre na sua conta
              Edi e depois digite o código que aparece no Hub.
            </p>
            <div className="actions">
              <Link className="button button--primary button--lg" href="/entrar?next=/conectar">
                Entrar
              </Link>
              <Link
                className="button button--outline button--lg"
                href="/entrar?criar=1&next=/conectar"
              >
                Criar conta
              </Link>
            </div>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  const account = await getAccount(user.id);
  return (
    <>
      <AccountHeader name={user.name} current="conectar" />
      <main id="conteudo" className="container section">
        <DeviceApproval
          email={user.email}
          devicesInUse={account.devices.length}
          deviceLimit={DEVICE_LIMIT}
          accessAllowed={account.access.allowed}
        />
      </main>
      <SiteFooter />
    </>
  );
}
