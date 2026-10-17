"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import {
  billingPortalAction,
  checkoutAction,
  deactivateDeviceAction,
  type loadAccount,
} from "./actions";

type Account = Awaited<ReturnType<typeof loadAccount>>;
export function AccountView({
  account,
  billingReady,
}: {
  account: Account;
  billingReady: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(operation: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await operation();
      router.refresh();
    } catch {
      setMessage("Não foi possível concluir. Tente novamente em instantes.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="intro">
        <div>
          <span className="eyebrow">Minha conta</span>
          <h1 className="text-4xl">Olá, {account.user.name}.</h1>
          <p className="muted">{account.user.email}</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await authClient.signOut();
              router.push("/");
            })
          }
        >
          Sair da conta web
        </button>
      </div>
      <div className="account-grid">
        <section className="plan">
          <span className={`status ${account.access.allowed ? "active" : ""}`}>
            {account.access.allowed ? "Acesso ativo" : "Sem acesso ativo"}
          </span>
          <h2 className="section">Sua assinatura</h2>
          <p className="muted">
            {account.access.allowed
              ? `Acesso confirmado até ${new Date(account.access.paidThrough).toLocaleDateString("pt-BR")}.`
              : "Uma assinatura ativa libera as ferramentas em até dois computadores."}
          </p>
          {!billingReady && (
            <p className="notice small">
              As assinaturas comerciais ainda não foram liberadas. Nenhuma cobrança será iniciada
              aqui.
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              disabled={busy || !billingReady || !account.user.emailVerified}
              onClick={() => run(() => checkoutAction("edi_suite_monthly"))}
            >
              R$ 29,90 / mês
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !billingReady || !account.user.emailVerified}
              onClick={() => run(() => checkoutAction("edi_suite_annual"))}
            >
              R$ 299 / ano
            </button>
          </div>
          {account.plans.length > 0 && (
            <button
              type="button"
              className="secondary section"
              disabled={busy || !billingReady}
              onClick={() => run(billingPortalAction)}
            >
              Faturas e cancelamento
            </button>
          )}
          <p className="small muted">
            Consumo pago de IA separado. Arquivos existentes não são apagados ao encerrar a
            assinatura.
          </p>
        </section>
        <section className="plan">
          <span className="eyebrow">Computadores conectados</span>
          <h2>{account.devices.length} de 2 ativações</h2>
          <p className="small muted">
            A suíte inteira usa uma ativação por computador. Desative um aparelho antes de conectar
            outro.
          </p>
          {account.devices.length === 0 ? (
            <p className="notice">
              Nenhum computador conectado. Entre pelo Edi Hub ou por uma ferramenta.
            </p>
          ) : (
            <ul className="device-list">
              {account.devices.map((device) => (
                <li key={device.id}>
                  <div>
                    <strong>{device.name}</strong>
                    <div className="small muted">
                      {new Date(device.lastSeenAt).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="danger compact"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Desativar ${device.name}? O aparelho precisará de uma nova aprovação para usar a suíte.`,
                        )
                      )
                        void run(() => deactivateDeviceAction(device.id));
                    }}
                  >
                    Desativar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p role="status" aria-live="polite" className="error-message">
        {message}
      </p>
    </>
  );
}
