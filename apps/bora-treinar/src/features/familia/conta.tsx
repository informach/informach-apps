"use client";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useServerAction } from "@/lib/use-server-action";
import {
  changePlanAction,
  checkoutAction,
  clearAction,
  forgetProfileAction,
  importEdibodyAction,
  portalAction,
  preferencesAction,
  reactivateAction,
} from "./actions";

export function BillingButton({
  productId,
  disabled,
  primary,
  children,
}: {
  productId?: string;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  const [pending, start] = useServerAction();
  const [message, setMessage] = useState("");
  return (
    <div>
      <button
        type="button"
        className={`btn ${primary ? "primary" : ""}`}
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            try {
              const result = productId ? await checkoutAction(productId) : await portalAction();
              if (result.ok) window.location.assign(result.data.url);
              else setMessage(result.error);
            } catch {
              setMessage(
                "Não foi possível abrir o pagamento. Confira sua assinatura e tente de novo.",
              );
            }
          })
        }
      >
        {pending ? "Abrindo…" : children}
      </button>
      <p role="status" className="form-message">
        {message}
      </p>
    </div>
  );
}

type PlanOption = {
  id: string;
  label: string;
  timing: "immediate" | "schedule_at_period_end";
  requiresRetainedProfile: boolean;
};

export function PlanChangeControls({
  options,
  profiles,
  cancelAtPeriodEnd,
  hasPendingChange,
}: {
  options: PlanOption[];
  profiles: { id: string; name: string; accessEnabled: boolean }[];
  cancelAtPeriodEnd: boolean;
  hasPendingChange: boolean;
}) {
  const router = useRouter();
  const [retained, setRetained] = useState(
    profiles.find((p) => p.accessEnabled)?.id ?? profiles[0]?.id ?? "",
  );
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  const needsChoice = options.some((o) => o.requiresRetainedProfile) && profiles.length > 1;
  return (
    <div className="card">
      <strong>Alterar a assinatura</strong>
      {(cancelAtPeriodEnd || hasPendingChange) && (
        <p className="muted spaced">
          {cancelAtPeriodEnd
            ? "Há uma alteração agendada. Para escolher outro plano, primeiro mantenha a assinatura atual."
            : "A confirmação da alteração anterior ficou pendente. Você pode tentar de novo ou manter a assinatura atual."}
        </p>
      )}
      {needsChoice && (
        <label className="spaced block">
          <span className="muted">Perfil que continua ativo num plano Individual</span>
          <select
            className="field"
            value={retained}
            onChange={(e) => setRetained(e.target.value)}
            disabled={pending}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="muted small">
            Os outros perfis e seus históricos ficam guardados e voltam quando o plano permitir.
          </span>
        </label>
      )}
      <div className="row spaced">
        {options.map((o) => (
          <button
            type="button"
            key={o.id}
            className="btn ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await changePlanAction(
                  o.id,
                  o.requiresRetainedProfile && profiles.length > 0 ? retained : undefined,
                );
                if (!result.ok) return setMessage(result.error);
                if (result.data.url) return window.location.assign(result.data.url);
                setMessage(
                  result.data.effective === "now"
                    ? "Plano alterado."
                    : "Alteração agendada para o fim do período já pago.",
                );
                router.refresh();
              })
            }
          >
            {o.label}
            {o.timing === "schedule_at_period_end" ? " no fim do período" : " agora"}
          </button>
        ))}
        {(cancelAtPeriodEnd || hasPendingChange) && (
          <button
            type="button"
            className="btn ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await reactivateAction();
                setMessage(result.ok ? "A assinatura continua ativa." : result.error);
                if (result.ok) router.refresh();
              })
            }
          >
            Manter assinatura atual
          </button>
        )}
      </div>
      <p className="muted small spaced">
        Trocas para anual e aumentos de perfis são cobrados com ajuste proporcional agora. Reduções
        e trocas de anual para mensal entram no fim do período pago.
      </p>
      <p role="status" className="form-message">
        {message}
      </p>
    </div>
  );
}

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORAS = Array.from({ length: 24 }, (_, h) => h);

export function Lembretes({
  reminderDays,
  reminderHour,
  weeklySummary,
  email,
}: {
  reminderDays: number;
  reminderHour: number;
  weeklySummary: boolean;
  email: string;
}) {
  const router = useRouter();
  const [dias, setDias] = useState(reminderDays);
  const [hora, setHora] = useState(reminderHour);
  const [resumo, setResumo] = useState(weeklySummary);
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  return (
    <div className="card">
      <strong>Lembrete de treino</strong>
      <p className="muted spaced">
        Um e-mail para {email} nos dias escolhidos, só se ninguém da família tiver treinado até a
        hora marcada.
      </p>
      <fieldset className="row spaced" aria-label="Dias do lembrete">
        {DIAS.map((d, i) => {
          const on = (dias & (1 << i)) !== 0;
          return (
            <button
              type="button"
              key={d}
              className="chip"
              aria-pressed={on}
              onClick={() => setDias(dias ^ (1 << i))}
            >
              {d}
            </button>
          );
        })}
      </fieldset>
      <label className="spaced block">
        <span className="muted">Horário</span>
        <select
          className="field compact"
          value={hora}
          onChange={(e) => setHora(Number(e.target.value))}
        >
          {HORAS.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </select>
      </label>
      <label className="check spaced">
        <input type="checkbox" checked={resumo} onChange={(e) => setResumo(e.target.checked)} />
        Receber o resumo da semana às segundas, com sequência, repetições e recordes de cada perfil
      </label>
      <div className="row spaced">
        <button
          type="button"
          className="btn primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await preferencesAction({
                reminderDays: dias,
                reminderHour: hora,
                weeklySummary: resumo,
              });
              setMessage(result.ok ? "Preferências salvas." : result.error);
              if (result.ok) router.refresh();
            })
          }
        >
          Salvar
        </button>
      </div>
      <p role="status" className="form-message">
        {message}
      </p>
    </div>
  );
}

export function ImportarEdibody() {
  const router = useRouter();
  const arquivo = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  const importar = (f: File) =>
    start(async () => {
      const result = await importEdibodyAction(await f.text());
      if (!result.ok) return setMessage(result.error);
      const { perfis, sessoes, ficaramDeFora } = result.data;
      setMessage(
        `${perfis} perfil(is) e ${sessoes} treino(s) importados.${
          ficaramDeFora ? ` ${ficaramDeFora} perfil(is) não couberam no plano atual.` : ""
        }`,
      );
      router.refresh();
    });
  return (
    <div className="card" id="edibody">
      <strong>Trazer dados do EdiBody</strong>
      <p className="muted spaced">
        Se você usava o EdiBody, exporte o backup em Progresso e escolha o arquivo aqui. Perfis,
        níveis e treinos passam para a sua conta.
      </p>
      <button
        type="button"
        className="btn ghost spaced"
        disabled={pending}
        onClick={() => arquivo.current?.click()}
      >
        <Upload size={18} /> {pending ? "Importando…" : "Escolher backup"}
      </button>
      <input
        ref={arquivo}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importar(f);
          e.target.value = "";
        }}
      />
      <p role="status" className="form-message">
        {message}
      </p>
    </div>
  );
}

export function PrivacyControls({
  outrasAssinaturas,
  outroAppComDados,
}: {
  outrasAssinaturas: boolean;
  outroAppComDados: string | null;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [excluir, setExcluir] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  return (
    <>
      <div className="row">
        <a className="btn ghost" href="/api/conta/exportar">
          Exportar dados em JSON
        </a>
        <button
          type="button"
          className="btn ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await forgetProfileAction();
              const result = await authClient.signOut();
              if (result.error) return setMessage("Não foi possível sair agora.");
              window.location.replace("/");
            })
          }
        >
          Sair da conta neste aparelho
        </button>
      </div>
      <details className="card danger spaced">
        <summary>Encerrar o Bora Treinar e apagar os dados de treino</summary>
        <p className="muted spaced">
          Cancela agora a assinatura deste app e apaga perfis, treinos, níveis, desafios e
          preferências. Exporte antes se quiser uma cópia. A conta Informach e os outros apps
          continuam. Registros financeiros seguem a retenção própria.
        </p>
        <label className="spaced block">
          <span className="muted">Digite ENCERRAR E APAGAR</span>
          <input
            className="field"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className="btn danger spaced"
          disabled={pending || confirmation !== "ENCERRAR E APAGAR"}
          onClick={() =>
            start(async () => {
              const result = await clearAction(confirmation);
              setMessage(
                result.ok ? "Assinatura encerrada e dados de treino apagados." : result.error,
              );
              if (result.ok) {
                setConfirmation("");
                router.refresh();
              }
            })
          }
        >
          Confirmar encerramento
        </button>
      </details>
      <details className="card danger spaced">
        <summary>Excluir a conta Informach</summary>
        <p className="muted spaced">
          A conta é a mesma no Cozya, na Agenda da Turma e no Missão Saber. A exclusão apaga a conta
          e os dados do Bora Treinar depois da confirmação por e-mail.
        </p>
        {outrasAssinaturas && (
          <p className="warn spaced">
            Há assinatura ativa em outro app Informach. Encerre-a por lá antes de excluir a conta.
          </p>
        )}
        {!outrasAssinaturas && outroAppComDados && (
          <p className="warn spaced">
            Sua conta também tem dados no {outroAppComDados}. Peça a exclusão por lá: ela apaga os
            dados daquele app e a conta compartilhada.
          </p>
        )}
        <label className="check spaced">
          <input type="checkbox" checked={excluir} onChange={(e) => setExcluir(e.target.checked)} />
          Entendo que a exclusão vale para todos os apps Informach.
        </label>
        <button
          type="button"
          className="btn danger spaced"
          disabled={pending || !excluir || outrasAssinaturas || !!outroAppComDados}
          onClick={() =>
            start(async () => {
              const result = await authClient.deleteUser({ callbackURL: "/" });
              setMessage(
                result.error
                  ? "Não foi possível solicitar a exclusão agora."
                  : "Enviamos um e-mail para confirmar a exclusão da conta.",
              );
            })
          }
        >
          Solicitar exclusão por e-mail
        </button>
      </details>
      <p role="status" className="form-message">
        {message}
      </p>
    </>
  );
}
