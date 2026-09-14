"use client";
import { Input } from "@informach/ui/components/input";
import { suggestReminder } from "@/features/notifications/reminder-suggestion";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPES,
  activityTypeSchema,
} from "@/features/unified-activities/activity-types";
import { DATE_ORIGIN_LABELS, type NoticeActionInput } from "../schemas";

const selectStyle = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
const labelStyle = "grid gap-1.5 text-sm font-medium";
export type RoutineProfile = { id: string; name: string };
export type AssignableAdult = { profileId: string; userId: string; name: string };

export function ActionFields({
  value,
  onChange,
  profiles,
  adults,
  prefix,
  lockProfile = false,
  isPro,
}: {
  value: NoticeActionInput;
  onChange: (value: NoticeActionInput) => void;
  profiles: RoutineProfile[];
  adults: AssignableAdult[];
  prefix: string;
  lockProfile?: boolean;
  isPro: boolean;
}) {
  const change = (patch: Partial<NoticeActionInput>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={labelStyle} htmlFor={`${prefix}-title`}>
        Atividade
        <Input
          id={`${prefix}-title`}
          value={value.title}
          maxLength={180}
          required
          onChange={(e) => change({ title: e.target.value })}
        />
      </label>
      <label className={labelStyle} htmlFor={`${prefix}-profile`}>
        Criança
        <select
          className={selectStyle}
          id={`${prefix}-profile`}
          aria-label="Criança"
          value={value.profileId}
          disabled={lockProfile}
          required
          onChange={(e) => change({ profileId: e.target.value, assignedToUserId: null })}
        >
          <option value="">Selecione</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelStyle} htmlFor={`${prefix}-type`}>
        Tipo
        <select
          className={selectStyle}
          id={`${prefix}-type`}
          aria-label="Tipo"
          value={value.type}
          onChange={(e) => {
            const parsed = activityTypeSchema.safeParse(e.target.value);
            if (parsed.success) change({ type: parsed.data });
          }}
        >
          {ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACTIVITY_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelStyle} htmlFor={`${prefix}-assignee`}>
        Quem vai cuidar
        <select
          className={selectStyle}
          id={`${prefix}-assignee`}
          aria-label="Quem vai cuidar"
          value={value.assignedToUserId ?? ""}
          onChange={(e) => change({ assignedToUserId: e.target.value || null })}
        >
          <option value="">A combinar</option>
          {adults
            .filter((a) => a.profileId === value.profileId)
            .map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.name}
              </option>
            ))}
        </select>
      </label>
      <label className={labelStyle} htmlFor={`${prefix}-date`}>
        Data (opcional)
        <Input
          type="date"
          id={`${prefix}-date`}
          value={value.dueAt ?? ""}
          onChange={(e) =>
            change({
              dueAt: e.target.value || null,
              dateOrigin: e.target.value ? "family" : "unspecified",
              reminderAt: null,
              ...(e.target.value ? {} : { time: null, reminderAt: null, recurrence: "none" }),
            })
          }
        />
        <span className="font-normal text-muted-foreground">
          {DATE_ORIGIN_LABELS[value.dateOrigin]}
        </span>
      </label>
      <label className={labelStyle} htmlFor={`${prefix}-time`}>
        Horário (opcional)
        <Input
          type="time"
          id={`${prefix}-time`}
          value={value.time ?? ""}
          disabled={!value.dueAt}
          onChange={(e) => change({ time: e.target.value || null })}
        />
      </label>
      <label className={`${labelStyle} sm:col-span-2`} htmlFor={`${prefix}-description`}>
        Detalhes, páginas ou materiais
        <textarea
          className="min-h-24 rounded-md border border-input bg-background p-3 font-normal"
          id={`${prefix}-description`}
          value={value.description ?? ""}
          maxLength={3000}
          onChange={(e) => change({ description: e.target.value || null })}
        />
      </label>
      <label className={labelStyle} htmlFor={`${prefix}-location`}>
        Local (opcional)
        <Input
          id={`${prefix}-location`}
          value={value.location ?? ""}
          maxLength={300}
          onChange={(e) => change({ location: e.target.value || null })}
        />
      </label>
      <label className={labelStyle} htmlFor={`${prefix}-recurrence`}>
        Repetir
        <select
          className={selectStyle}
          id={`${prefix}-recurrence`}
          aria-label="Repetir"
          value={value.recurrence}
          disabled={!value.dueAt || !isPro}
          onChange={(e) => change({ recurrence: e.target.value === "weekly" ? "weekly" : "none" })}
        >
          <option value="none">Não repetir</option>
          <option value="weekly">Toda semana, após concluir</option>
        </select>
        {!isPro ? (
          <span className="font-normal text-muted-foreground">
            Repetição e lembretes ficam pausados no plano gratuito. Você pode continuar corrigindo a
            atividade.
          </span>
        ) : null}
      </label>
      {isPro ? (
        <label className={`${labelStyle} sm:col-span-2`} htmlFor={`${prefix}-reminder`}>
          Lembrar em (horário de Brasília)
          <Input
            type="datetime-local"
            id={`${prefix}-reminder`}
            disabled={!value.dueAt}
            value={
              value.reminderAt
                ? new Date(new Date(value.reminderAt).valueOf() - 3 * 3600_000)
                    .toISOString()
                    .slice(0, 16)
                : ""
            }
            onChange={(e) =>
              change({
                reminderAt: e.target.value
                  ? new Date(`${e.target.value}:00-03:00`).toISOString()
                  : null,
              })
            }
          />
          {value.dueAt ? (
            <button
              type="button"
              className="min-h-11 w-fit text-left text-primary underline"
              onClick={() => change({ reminderAt: suggestReminder(value) })}
            >
              Sugerir antecedência para {ACTIVITY_TYPE_LABELS[value.type].toLowerCase()}
            </button>
          ) : null}
          {value.reminderAt && new Date(value.reminderAt).valueOf() < Date.now() ? (
            <span className="font-normal text-amber-700 dark:text-amber-400">
              Esse horário já passou. Escolha um horário futuro para receber o aviso.
            </span>
          ) : null}
          <span className="font-normal text-muted-foreground">
            A sugestão é de 2 dias para materiais, provas e trabalhos; 1 dia para os demais, às 19h.
            Você pode ajustar. Ative e-mail ou notificações em Família. Seus horários de silêncio
            serão respeitados.
          </span>
        </label>
      ) : null}
      {value.sourceExcerpt ? (
        <blockquote className="border-l-2 border-primary/30 pl-3 text-sm text-muted-foreground sm:col-span-2">
          <span className="mb-1 block font-medium">Trecho do recado</span>
          {value.sourceExcerpt}
        </blockquote>
      ) : null}
    </div>
  );
}
