"use client";
import { Button } from "@informach/ui/components/button";
import Link from "next/link";
import { useState } from "react";
import type { z } from "zod";
import { noticeErrorMessage } from "@/features/notices/messages";
import { catchActionResult } from "@/lib/action-result";
import {
  saveNotificationPreferencesAction,
  subscribePushAction,
  unsubscribePushAction,
} from "../actions";
import { notificationPreferencesSchema, pushSubscriptionSchema } from "../schemas";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
/** Índice = `Date#getDay`, como a coluna guarda. */
const WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export function NotificationPreferencesPanel({
  initial,
  enabled,
  publicKey,
}: {
  initial: z.infer<typeof notificationPreferencesSchema>;
  enabled: boolean;
  publicKey: string | null;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(next = value) {
    const parsed = notificationPreferencesSchema.safeParse(next);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Confira os horários");
      return;
    }
    setBusy(true);
    const result = await catchActionResult(() => saveNotificationPreferencesAction(parsed.data));
    setBusy(false);
    setMessage(result.ok ? "Preferências salvas." : noticeErrorMessage(result.error.code));
    if (result.ok) setValue(parsed.data);
  }
  async function enablePush() {
    setMessage("");
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window) ||
      !publicKey
    ) {
      setMessage(
        "Notificações não estão disponíveis neste navegador. No iPhone/iPad, adicione o app à Tela de Início e abra por esse ícone.",
      );
      return;
    }
    // Permission is requested directly from the button gesture, before async registration.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setMessage(
        "Permissão não concedida. Você pode alterar isso nas configurações do navegador e usar e-mail enquanto isso.",
      );
      return;
    }
    setBusy(true);
    try {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
        c.charCodeAt(0),
      );
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      const parsed = pushSubscriptionSchema.safeParse(subscription.toJSON());
      if (!parsed.success) {
        setMessage("Não foi possível validar a inscrição deste navegador.");
        return;
      }
      const result = await catchActionResult(() => subscribePushAction(parsed.data));
      if (!result.ok) {
        setMessage(
          result.error.code === "DEVICE_ALREADY_LINKED"
            ? "Este navegador está vinculado a outra conta. Desative a inscrição antiga nas configurações do navegador e tente novamente."
            : noticeErrorMessage(result.error.code),
        );
        return;
      }
      await save({ ...value, pushEnabled: true });
    } catch {
      setMessage("Não foi possível ativar. Verifique a instalação e a permissão do navegador.");
    } finally {
      setBusy(false);
    }
  }
  async function disableThisDevice() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker?.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await catchActionResult(() => unsubscribePushAction({ endpoint: subscription.endpoint }));
        await subscription.unsubscribe();
      }
      setMessage("Notificações desativadas neste dispositivo.");
    } catch {
      setMessage("Confira as permissões do navegador para desativar neste dispositivo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Lembrar no momento certo</h2>
      <p className="text-sm text-muted-foreground">
        Receba um resumo das pendências de hoje e do preparo para amanhã. Lembretes individuais
        podem ser definidos em cada atividade. Horários de Brasília.
      </p>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={value.emailEnabled}
          disabled={!enabled && !value.emailEnabled}
          onChange={(e) => setValue({ ...value, emailEnabled: e.target.checked })}
        />
        Receber resumo e lembretes por e-mail
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={value.pushEnabled}
          disabled={!enabled && !value.pushEnabled}
          onChange={(e) => setValue({ ...value, pushEnabled: e.target.checked })}
        />
        Permitir notificações nos dispositivos ativados
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            { field: "digestHour", label: "Resumo diário" },
            { field: "quietStart", label: "Silêncio a partir de" },
            { field: "quietEnd", label: "Voltar a avisar às" },
          ] as const
        ).map(({ field, label }) => (
          <label key={field} htmlFor={field} className="grid gap-2 text-sm font-medium">
            {label}
            <select
              id={field}
              className="h-11 rounded-md border bg-background px-3"
              value={value[field]}
              onChange={(e) => setValue({ ...value, [field]: Number(e.target.value) })}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Use o mesmo horário de início e fim para desativar o silêncio. Uma atividade concluída ou
        cancelada deixa de gerar novos lembretes.
      </p>
      <div className="space-y-3 border-t pt-4">
        <h3 className="font-medium">A semana que vem</h3>
        <p className="text-sm text-muted-foreground">
          O resumo diário conta o que é para amanhã. O da semana chega enquanto ainda dá para
          organizar o fim de semana em função dela, e aponta os dias mais puxados.
        </p>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={value.weeklyDigestEnabled}
            onChange={(e) => setValue({ ...value, weeklyDigestEnabled: e.target.checked })}
          />
          Receber o resumo da semana
        </label>
        {value.weeklyDigestEnabled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="weeklyDigestDay" className="grid gap-2 text-sm font-medium">
              Dia
              <select
                id="weeklyDigestDay"
                className="h-11 rounded-md border bg-background px-3"
                value={value.weeklyDigestDay}
                onChange={(e) => setValue({ ...value, weeklyDigestDay: Number(e.target.value) })}
              >
                {WEEKDAYS.map((label, day) => (
                  <option key={label} value={day}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="weeklyDigestHour" className="grid gap-2 text-sm font-medium">
              Horário
              <select
                id="weeklyDigestHour"
                className="h-11 rounded-md border bg-background px-3"
                value={value.weeklyDigestHour}
                onChange={(e) => setValue({ ...value, weeklyDigestHour: Number(e.target.value) })}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>
      <div className="space-y-3 border-t pt-4">
        <h3 className="font-medium">Ao importar um recado</h3>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={value.suggestReminders}
            onChange={(e) => setValue({ ...value, suggestReminders: e.target.checked })}
          />
          <span className="grid gap-1">
            Já preencher o lembrete sugerido
            <span className="font-normal text-muted-foreground">
              Dois dias antes para material, prova e trabalho; um dia para o resto. O campo fica à
              vista na revisão e você apaga ou muda como quiser.
            </span>
          </span>
        </label>
      </div>
      <Button onClick={() => save()} disabled={busy}>
        Salvar preferências
      </Button>
      <div className="space-y-3 border-t pt-4">
        <h3 className="font-medium">Notificações neste dispositivo</h3>
        <p className="text-sm text-muted-foreground">
          No iPhone/iPad, abra no Safari, use Compartilhar → Adicionar à Tela de Início e abra o app
          pelo ícone. Depois toque em ativar. Em outros navegadores compatíveis, basta permitir.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={busy || !enabled || !publicKey} onClick={enablePush}>
            Ativar neste dispositivo
          </Button>
          <Button variant="ghost" disabled={busy} onClick={disableThisDevice}>
            Desativar neste dispositivo
          </Button>
        </div>
        {!publicKey ? (
          <p className="text-sm text-muted-foreground">
            Push ainda indisponível neste ambiente. O resumo por e-mail pode ser usado quando
            ativado.
          </p>
        ) : null}
      </div>
      {!enabled ? (
        <p className="text-sm text-muted-foreground">
          Resumos e lembretes fazem parte da assinatura da família.{" "}
          <Link href="/upgrade" className="text-primary-ink underline">
            Ver plano
          </Link>
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
