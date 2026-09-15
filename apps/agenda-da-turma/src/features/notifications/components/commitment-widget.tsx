"use client";

import { Button } from "@informach/ui/components/button";
import { CalendarHeart, Check } from "lucide-react";
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
 */
const HOURS = [
  { hour: 7, label: "De manhã", hint: "7h" },
  { hour: 12, label: "No almoço", hint: "12h" },
  { hour: 18, label: "Fim da tarde", hint: "18h" },
  { hour: 20, label: "Depois do jantar", hint: "20h" },
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
  const [chosen, setChosen] = useState<number | null>(null);
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
        className="flex items-center gap-3 rounded-2xl border border-chart-2/40 bg-chart-2/10 p-4"
      >
        <Check className="size-5 shrink-0 text-chart-2-ink" aria-hidden />
        <p className="text-sm font-medium">
          Combinado. O resumo chega por e-mail todo dia no horário escolhido — dá para mudar em
          Família › Ajustes.
        </p>
      </section>
    );
  }

  const commit = () => {
    if (chosen === null) return;
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

  return (
    <section
      aria-labelledby="commitment-title"
      className="space-y-4 rounded-2xl border border-secondary/30 bg-card p-5 shadow-solid"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
          <CalendarHeart className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="commitment-title" className="text-lg font-bold tracking-tight">
            Que horas vocês querem conferir a agenda juntos?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Um resumo do que precisa de atenção, uma vez por dia, no horário que a casa escolher.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {HOURS.map(({ hour, label, hint }) => (
          <button
            key={hour}
            type="button"
            aria-pressed={chosen === hour}
            onClick={() => setChosen(hour)}
            className={`min-h-16 rounded-xl border px-3 py-2 text-left transition-colors ${
              chosen === hour ? "border-primary/40 bg-primary/10" : "hover:bg-muted"
            }`}
          >
            <span className="block text-sm font-semibold">{label}</span>
            <span className="block text-xs tabular-nums text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={commit} disabled={chosen === null || saving}>
          Combinado
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            // Esconder é só desta sessão, e de propósito: gravar "não quero"
            // exigiria uma coluna para uma recusa que a pessoa talvez só esteja
            // adiando. Combinar o horário faz o card sumir de vez, porque as
            // preferências deixam de estar vazias.
            try {
              sessionStorage.setItem(dismissedKey, "1");
            } catch {
              /* Modo privado: some só até recarregar. */
            }
            setHidden(true);
          }}
        >
          Agora não
        </Button>
      </div>
    </section>
  );
}
