"use client";
import { getAppUrl } from "@informach/config/domains";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Motivo } from "@/features/billing/ofertas";
import { usePlanos } from "@/features/billing/planos";
import { authClient, ssoEnvironment } from "@/lib/auth-client";
import { FUSOS_DO_BRASIL } from "@/lib/datas";
import { useServerAction } from "@/lib/use-server-action";
import { forgetProfileAction, preferencesAction } from "./actions";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORAS = Array.from({ length: 24 }, (_, h) => h);

export function Lembretes({
  reminderDays,
  reminderHour,
  weeklySummary,
  email,
  timezone,
}: {
  reminderDays: number;
  reminderHour: number;
  weeklySummary: boolean;
  email: string;
  /** fuso da família: lembretes, "hoje", semana e sequência seguem o relógio da casa */
  timezone: string;
}) {
  const router = useRouter();
  const [dias, setDias] = useState(reminderDays);
  const [hora, setHora] = useState(reminderHour);
  const [fuso, setFuso] = useState(timezone);
  const fusos = FUSOS_DO_BRASIL.some((f) => f.id === timezone)
    ? FUSOS_DO_BRASIL
    : [...FUSOS_DO_BRASIL, { id: timezone, nome: timezone }];
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
      <label className="spaced block">
        <span className="muted">Fuso da família</span>
        <select className="field compact" value={fuso} onChange={(e) => setFuso(e.target.value)}>
          {fusos.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
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
                timezone: fuso,
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

/**
 * Sair da conta neste aparelho. Fica fora do bloco que pede login recente: sair nunca precisou
 * provar quem é, e antes só aparecia depois de entrar de novo (para poder sair).
 */
export function SairDaConta() {
  const [pending, start] = useServerAction();
  const [message, setMessage] = useState("");
  return (
    <div>
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
      <p role="status" className="form-message">
        {message}
      </p>
    </div>
  );
}

/** Chegou à Conta por um cadeado (ou pelo servidor, com `?motivo=`): abre a folha de planos. */
export function AbrirPlanosAoChegar({ motivo }: { motivo: Motivo }) {
  const abrir = usePlanos();
  useEffect(() => abrir(motivo), [abrir, motivo]);
  return null;
}

export function PrivacyControls() {
  return (
    <>
      <div className="row">
        <a className="btn ghost" href="/api/conta/exportar">
          Exportar dados em JSON
        </a>
      </div>
      <section className="card spaced">
        <h3>Histórico de cada pessoa</h3>
        <p>
          A exclusão de um perfil remove somente seus treinos e dados do Bora. A pessoa e os
          históricos dos outros apps continuam na família. Essa ação exige permissão para gerenciar
          o perfil.
        </p>
        <a className="btn ghost spaced" href="/perfis">
          Gerenciar perfis de treino
        </a>
      </section>
      <section className="card spaced">
        <h3>Sua conta compartilhada</h3>
        <p>Nome, e-mail, senha, segurança e os dados da conta são gerenciados na central.</p>
        <a href={getAppUrl("conta", ssoEnvironment)}>Gerenciar minha conta</a>
      </section>
    </>
  );
}
