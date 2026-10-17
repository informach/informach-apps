"use client";

import { Check, Mail, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { noticeErrorMessage } from "@/features/notices/messages";
import { catchActionResult } from "@/lib/action-result";
import { saveNotificationPreferencesAction } from "../actions";
import type { NotificationPreferences } from "../schemas";

/**
 * O combinado da família.
 *
 * O app notificava sem que ninguém tivesse combinado nada: as preferências
 * existiam, vazias, na aba Família — onde ninguém vai no primeiro dia. É a
 * diferença entre um app que avisa e um app com quem a casa combinou algo, e é
 * o que o "I'M COMMITTED" das referências faz num passo curto.
 *
 * Fica no dashboard e não no onboarding de propósito: o passo 3 termina no
 * Stripe para quem escolhe o Pro, e enfiar um quarto passo entre o checkout e a
 * volta tornaria frágil justamente o caminho que paga. Aqui ele aparece na
 * primeira rotina e some assim que a família responde.
 *
 * Só ativa e-mail. Push depende de VAPID e de permissão do navegador, e pedir
 * as duas coisas de uma vez no primeiro dia é o jeito de não ganhar nenhuma.
 *
 * Era um card de quatro botões e uma confirmação, e ficava no topo de Hoje,
 * antes da primeira atividade. Virou uma linha no fim da página: um toque no
 * horário já combina, e mudar depois fica em Família, na aba Ajustes.
 */
const HOURS = [
  { hour: 7, label: "7h", spoken: "às 7h, de manhã" },
  { hour: 12, label: "12h", spoken: "às 12h, no almoço" },
  { hour: 18, label: "18h", spoken: "às 18h, no fim da tarde" },
  { hour: 20, label: "20h", spoken: "às 20h, depois do jantar" },
] as const;

export function CommitmentWidget({
  dismissedKey,
  current,
}: {
  dismissedKey: string;
  /**
   * As preferências como estão gravadas.
   *
   * O card espalhava os PADRÕES e reescrevia `quietStart`/`quietEnd` no
   * caminho: uma família que tinha ajustado o silêncio para 9h–17h e depois
   * desligou os dois canais perdia esse ajuste em silêncio ao tocar Combinado.
   */
  current: NotificationPreferences;
}) {
  const [done, setDone] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();

  // Lido depois da hidratação, e não no estado inicial: `sessionStorage` não
  // existe no servidor, e inicializar a partir dele faria o HTML e o primeiro
  // render do cliente discordarem.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(dismissedKey)) setHidden(true);
    } catch {
      /* Modo privado: o card simplesmente continua visível. */
    }
  }, [dismissedKey]);

  if (hidden) return null;

  if (done) {
    return (
      <section
        // O sucesso também precisa ser anunciado: o botão que tinha o foco é
        // substituído por esta seção, e sem a live region quem usa leitor de tela
        // só perdia o foco, sem saber que deu certo.
        role="status"
        className="flex items-center gap-3 rounded-[20px] border border-foreground/15 bg-background px-4 py-3 sm:px-5"
      >
        <Check className="size-5 shrink-0 text-chart-2-ink" aria-hidden />
        <p className="text-sm">
          Combinado. O resumo chega por e-mail todo dia nesse horário. Dá para mudar em Família, na
          aba Ajustes.
        </p>
      </section>
    );
  }

  const commit = (chosen: number) => {
    startSaving(async () => {
      const result = await catchActionResult(() =>
        saveNotificationPreferencesAction({
          ...current,
          emailEnabled: true,
          digestHour: chosen,
        }),
      );
      if (!result.ok) {
        // O código real, e não uma frase genérica: o caminho que falha de verdade
        // aqui é `PRO_REQUIRED`, e dizer "tente de novo em instantes" mandava a
        // família repetir para sempre um botão que nunca ia funcionar.
        setError(noticeErrorMessage(result.error.code));
        return;
      }
      setError("");
      setDone(true);
    });
  };

  const dismiss = () => {
    // Esconder é só desta sessão, e de propósito: gravar "não quero" exigiria
    // uma coluna para uma recusa que a pessoa talvez só esteja adiando.
    // Combinar o horário faz a linha sumir de vez, porque as preferências
    // deixam de estar vazias.
    try {
      sessionStorage.setItem(dismissedKey, "1");
    } catch {
      /* Modo privado: some só até recarregar. */
    }
    setHidden(true);
  };

  return (
    <section
      aria-labelledby="commitment-title"
      className="rounded-[20px] border border-foreground/15 bg-background px-4 py-3 sm:px-5"
    >
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 id="commitment-title" className="text-[15px] font-bold leading-snug">
            Quer o resumo do dia por e-mail? Escolha a hora.
          </h2>
          <div className="flex flex-wrap gap-2">
            {HOURS.map(({ hour, label, spoken }) => (
              <button
                key={hour}
                type="button"
                disabled={saving}
                aria-label={`Receber o resumo ${spoken}`}
                onClick={() => commit(hour)}
                className="inline-flex min-h-11 min-w-14 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-bold tabular-nums transition-colors hover:bg-muted disabled:opacity-60"
              >
                {label}
              </button>
            ))}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive-ink">
              {error}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Agora não"
          className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
    </section>
  );
}
