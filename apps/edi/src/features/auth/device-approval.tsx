"use client";
import {
  formatDeviceUserCode,
  isCompleteDeviceUserCode,
  normalizeDeviceUserCode,
} from "@informach/edi-contracts/device-code";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useState } from "react";
import { HubIcon } from "../../components/site/brand";
import { CheckIcon, CloseIcon } from "../../components/site/icons";
import { authClient } from "../../lib/auth-client";

type Step = "codigo" | "revisar" | "pronto" | "negado";
const ORDER: Record<Step, number> = { codigo: 1, revisar: 2, pronto: 3, negado: 3 };
const DEVICE_LIMIT = 2;

function stepClass(step: Step, position: number) {
  const at = ORDER[step];
  return position === at ? "is-current" : position < at ? "is-done" : undefined;
}

export function DeviceApproval({
  email,
  devicesInUse,
  accessAllowed,
}: {
  email: string;
  devicesInUse: number;
  accessAllowed: boolean;
}) {
  const hydrated = useHydrated();
  const [step, setStep] = useState<Step>("codigo");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function inspect(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCompleteDeviceUserCode(code)) {
      setMessage("Confira o código: são 8 letras e números, como aparecem no Edi Hub.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.device({
        query: { user_code: normalizeDeviceUserCode(code) },
      });
      if (result.error) {
        setMessage(
          "Não encontramos esse código. Confira as letras no Edi Hub ou peça um código novo.",
        );
        return;
      }
      if (!result.data.client_id) {
        setMessage("Entre na sua conta antes de aprovar este computador.");
        return;
      }
      setStep("revisar");
    } catch {
      setMessage("Não foi possível verificar o código. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(false);
    }
  }
  async function decide(approve: boolean) {
    setBusy(true);
    setMessage("");
    const userCode = normalizeDeviceUserCode(code);
    try {
      const result = approve
        ? await authClient.device.approve({ userCode })
        : await authClient.device.deny({ userCode });
      if (result.error) {
        setMessage(
          "Não foi possível concluir. O código pode ter expirado: peça um novo no Edi Hub.",
        );
        return;
      }
      setStep(approve ? "pronto" : "negado");
    } catch {
      setMessage("Não foi possível concluir. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(false);
    }
  }
  function restart() {
    setStep("codigo");
    setCode("");
    setMessage("");
  }

  return (
    <div className="narrow">
      <ol className="stepper" aria-label="Etapas">
        <li className={stepClass(step, 1)} aria-current={step === "codigo" ? "step" : undefined}>
          1 · Código
        </li>
        <li className={stepClass(step, 2)} aria-current={step === "revisar" ? "step" : undefined}>
          2 · Confirmar
        </li>
        <li className={stepClass(step, 3)} aria-current={ORDER[step] === 3 ? "step" : undefined}>
          3 · Pronto
        </li>
      </ol>

      {step === "codigo" && (
        <>
          <span className="eyebrow">Conectar computador</span>
          <h1 className="display-2">Digite o código que apareceu no Edi Hub.</h1>
          <p className="lede">São 8 letras e números. O código vale por 10 minutos.</p>
          <form className="narrow connect-form" onSubmit={inspect}>
            <label className="field" htmlFor="user-code">
              Código do Edi Hub
              <input
                id="user-code"
                className="input input--code"
                name="user_code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={12}
                required
                aria-describedby="conta-conectada"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                  setMessage("");
                }}
              />
            </label>
            <p id="conta-conectada" className="small muted">
              Conectando à conta <strong>{email}</strong>.
            </p>
            <p role="status" aria-live="polite" className="form-message form-message--error">
              {message}
            </p>
            <button
              type="submit"
              className="button button--primary button--lg button--block"
              disabled={!hydrated || busy}
            >
              {busy ? "Conferindo…" : "Continuar"}
            </button>
          </form>
          <div className="notice">
            <HubIcon size="md" />
            <p className="muted">
              <strong>Não está vendo um código?</strong> Abra o Edi Hub e clique em Conectar minha
              conta. Ainda não instalou? <Link href="/downloads">Baixe o Edi Hub</Link>.
            </p>
          </div>
        </>
      )}

      {step === "revisar" && (
        <>
          <span className="eyebrow">Confira antes de autorizar</span>
          <h1 className="display-2">Este pedido é seu?</h1>
          <div className="review-card">
            <div className="review-card__head">
              <HubIcon size="md" />
              <span>
                <strong className="display-4">Suíte Edi no Windows</strong>
                <small>código {formatDeviceUserCode(code)}</small>
              </span>
            </div>
            <div className="permissions">
              <div>
                <h2 className="permissions__title">Este computador vai poder</h2>
                <ul>
                  <li>
                    <span className="is-allowed">
                      <CheckIcon size={18} />
                    </span>
                    Abrir as ferramentas da sua assinatura
                  </li>
                  <li>
                    <span className="is-allowed">
                      <CheckIcon size={18} />
                    </span>
                    Renovar o acesso sozinho, sem pedir sua senha
                  </li>
                </ul>
              </div>
              <div>
                <h2 className="permissions__title">E não vai poder</h2>
                <ul>
                  <li>
                    <span className="is-denied">
                      <CloseIcon size={18} />
                    </span>
                    Ver ou trocar sua senha
                  </li>
                  <li>
                    <span className="is-denied">
                      <CloseIcon size={18} />
                    </span>
                    Mudar, pagar ou cancelar a assinatura
                  </li>
                </ul>
              </div>
            </div>
            <div className="review-card__slots">
              <span>
                {devicesInUse >= DEVICE_LIMIT
                  ? "Seus 2 computadores já estão conectados. Se este é um computador novo, desconecte um deles em Minha conta antes de autorizar."
                  : devicesInUse === 1
                    ? "Vai ocupar a segunda vaga da sua conta. Para trocar depois, desconecte um em Minha conta."
                    : "Vai ocupar a primeira das 2 vagas da sua conta."}
              </span>
              <span className="slot-bar" aria-hidden="true">
                {Array.from({ length: DEVICE_LIMIT }, (_, slot) => slot).map((slot) => (
                  <span
                    key={`vaga-${slot + 1}`}
                    className={
                      slot < devicesInUse
                        ? "is-used"
                        : slot === devicesInUse
                          ? "is-next"
                          : undefined
                    }
                  />
                ))}
              </span>
            </div>
          </div>
          {!accessAllowed && (
            <p className="notice notice--warn">
              Sua conta ainda não tem uma assinatura ativa. O computador fica conectado, mas as
              ferramentas só abrem depois de assinar em <Link href="/conta">Minha conta</Link>.
            </p>
          )}
          <p role="status" aria-live="polite" className="form-message form-message--error">
            {message}
          </p>
          <div className="actions">
            <button
              type="button"
              className="button button--primary button--lg"
              disabled={!hydrated || busy}
              onClick={() => decide(true)}
            >
              Autorizar este computador
            </button>
            <button
              type="button"
              className="button button--outline button--lg"
              disabled={!hydrated || busy}
              onClick={() => decide(false)}
            >
              Não fui eu
            </button>
          </div>
          <p className="small muted">
            Só autorize um pedido que você fez no Edi Hub agora há pouco.
          </p>
        </>
      )}

      {step === "pronto" && (
        <>
          <span className="result-mark" aria-hidden="true">
            <CheckIcon size={40} />
          </span>
          <h1 className="display-2">Pronto, computador conectado.</h1>
          <p className="lede">
            Pode voltar ao Edi Hub. Em alguns segundos ele libera as ferramentas sozinho.
          </p>
          <div className="actions">
            <Link className="button button--ink button--lg" href="/conta">
              Ver meus computadores
            </Link>
          </div>
        </>
      )}

      {step === "negado" && (
        <>
          <span className="result-mark result-mark--neutral" aria-hidden="true">
            <CloseIcon size={36} />
          </span>
          <h1 className="display-2">Pedido recusado.</h1>
          <p className="lede">
            Nenhum computador foi conectado. Se você não reconhece esse pedido, redefina sua senha
            pela tela de entrada.
          </p>
          <div className="actions">
            <button type="button" className="button button--outline button--lg" onClick={restart}>
              Digitar outro código
            </button>
          </div>
        </>
      )}
    </div>
  );
}
