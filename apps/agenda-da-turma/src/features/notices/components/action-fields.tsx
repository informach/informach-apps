"use client";
import { Input } from "@informach/ui/components/input";
import { suggestReminder } from "@/features/notifications/reminder-suggestion";
import { suggestDueDateFromSchedule } from "@/features/subjects/due-date-suggestion";
import { findClosestSubject } from "@/features/subjects/match-subject";
import type { SubjectOptionsByProfile } from "@/features/subjects/options-service";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPES,
  activityTypeSchema,
} from "@/features/unified-activities/activity-types";
import { ESTIMATE_PRESETS, formatEstimate } from "@/features/unified-activities/estimate";
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
  subjectOptions,
  prefix,
  lockProfile = false,
  isPro,
  shareLocked = false,
  subjectHint = null,
}: {
  value: NoticeActionInput;
  onChange: (value: NoticeActionInput) => void;
  profiles: RoutineProfile[];
  adults: AssignableAdult[];
  /** Matérias por criança — turma em que ela participa + extracurriculares. */
  subjectOptions: SubjectOptionsByProfile;
  prefix: string;
  lockProfile?: boolean;
  isPro: boolean;
  /**
   * Quem publicou a atividade na turma foi outra família: a caixa aparece
   * marcada e travada, porque a cópia desta casa é dela, mas o fato na turma
   * não.
   */
  shareLocked?: boolean;
  /**
   * A matéria como a leitura do recado a reconheceu. Quando não casa com
   * nenhuma cadastrada da criança, a revisão diz isso em vez de deixar o
   * campo mudo — a pessoa decide entre cadastrar a matéria ou seguir sem.
   */
  subjectHint?: string | null;
}) {
  const subjectsForProfile = subjectOptions[value.profileId] ?? [];
  const selectedSubject = value.subjectId ?? value.profileSubjectId ?? "";
  const unmatchedHint =
    subjectHint && !selectedSubject && !findClosestSubject(subjectsForProfile, subjectHint)
      ? subjectHint
      : null;
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
          onChange={(e) =>
            change({
              profileId: e.target.value,
              assignedToUserId: null,
              // A matéria pertence à turma da criança: trocar de criança
              // invalida a escolha anterior, e com ela o compartilhamento.
              subjectId: null,
              profileSubjectId: null,
              shareWithTurma: false,
            })
          }
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
      <label className={labelStyle} htmlFor={`${prefix}-subject`}>
        Matéria (opcional)
        <select
          className={selectStyle}
          id={`${prefix}-subject`}
          aria-label="Matéria"
          value={selectedSubject}
          disabled={subjectsForProfile.length === 0}
          onChange={(e) => {
            const option = subjectsForProfile.find((s) => s.id === e.target.value);
            const patch: Partial<NoticeActionInput> = {
              subjectId: option?.source === "turma" ? option.id : null,
              profileSubjectId: option?.source === "extra" ? option.id : null,
            };
            // Prazo vazio mais matéria com horário cadastrado dá a próxima
            // aula. É cálculo determinístico, com a procedência à vista, e um
            // toque no campo de data altera. Sem horário o campo continua
            // vazio: nunca "amanhã".
            if (option && !value.dueAt) {
              const suggestion = suggestDueDateFromSchedule(option);
              if (suggestion) {
                patch.dueAt = suggestion.dueAt;
                patch.dateOrigin = "schedule";
              }
            }
            // Sem matéria não existe horário que justifique a data. Ela fica,
            // mas passa a ser planejamento da família.
            if (!option && value.dateOrigin === "schedule") patch.dateOrigin = "family";
            // Sem matéria da turma não há turma com quem compartilhar.
            if (option?.source !== "turma") patch.shareWithTurma = false;
            change(patch);
          }}
        >
          <option value="">
            {subjectsForProfile.length === 0 ? "Nenhuma matéria cadastrada" : "Sem matéria"}
          </option>
          {subjectsForProfile.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
              {option.source === "extra" ? " (extra)" : ""}
            </option>
          ))}
        </select>
        {unmatchedHint ? (
          <span className="font-normal text-muted-foreground">
            A leitura identificou “{unmatchedHint}”, que não está cadastrada para esta criança.
          </span>
        ) : null}
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
          aria-label="Data (opcional)"
          aria-describedby={`${prefix}-date-origin`}
          value={value.dueAt ?? ""}
          onChange={(e) =>
            change({
              dueAt: e.target.value || null,
              dateOrigin: e.target.value ? "family" : "unspecified",
              // O lembrete só é apagado ao LIMPAR a data, junto de hora e
              // repetição (abaixo). Apagar a cada troca de data era exclusão
              // silenciosa: numa família que voltou ao gratuito o campo nem é
              // renderizado, então não havia como perceber nem repor.
              // Sem data não há o que a turma possa receber: a caixa some, e
              // deixá-la marcada só faria a gravação ser recusada depois.
              ...(e.target.value
                ? {}
                : {
                    time: null,
                    reminderAt: null,
                    recurrence: "none",
                    shareWithTurma: false,
                  }),
            })
          }
        />
        <span id={`${prefix}-date-origin`} className="font-normal text-muted-foreground">
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
      <fieldset className={`${labelStyle} sm:col-span-2`}>
        <legend className="mb-1.5">Quanto tempo leva (opcional)</legend>
        {/*
          Presets, e não um campo livre: ninguém sabe dizer "37 minutos", e a
          pergunta que isto responde é grosseira — "dá para fazer antes do
          jantar?". Os buckets da rotina somam o que estiver preenchido e
          ignoram o resto, então estimar uma atividade de cinco já ajuda.
        */}
        <div className="flex flex-wrap gap-2">
          {ESTIMATE_PRESETS.map((minutes) => {
            const active = value.estimatedMinutes === minutes;
            return (
              <button
                key={minutes}
                type="button"
                aria-pressed={active}
                onClick={() => change({ estimatedMinutes: active ? null : minutes })}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
                  active ? "border-primary/40 bg-primary/10 font-semibold" : "hover:bg-muted"
                }`}
              >
                {formatEstimate(minutes)}
              </button>
            );
          })}
        </div>
      </fieldset>
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
              className="min-h-11 w-fit text-left text-primary-ink underline"
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
      {/* Compartilhar com a turma era o único campo que justificava um segundo
          formulário de nova atividade. Aqui ele é o que sempre foi: uma opção
          da atividade, que só aparece quando há turma com quem compartilhar. */}
      {value.subjectId ? (
        <div className="sm:col-span-2">
          <label
            className="flex items-start gap-3 rounded-lg border bg-card p-3 text-sm font-medium"
            htmlFor={`${prefix}-share`}
          >
            <input
              type="checkbox"
              id={`${prefix}-share`}
              aria-label="Compartilhar com a turma"
              aria-describedby={`${prefix}-share-hint`}
              className="mt-1 size-4"
              checked={value.shareWithTurma}
              disabled={!isPro || shareLocked || !value.dueAt}
              onChange={(e) => change({ shareWithTurma: e.target.checked })}
            />
            <span className="grid gap-1">
              Compartilhar com a turma
              <span id={`${prefix}-share-hint`} className="font-normal text-muted-foreground">
                {shareLocked
                  ? "Publicada por outra família. Sua cópia é só sua; a da turma continua com quem publicou."
                  : !isPro
                    ? "Compartilhar faz parte do Pro. No gratuito a atividade fica só para a sua família."
                    : !value.dueAt
                      ? "Informe a data para as outras famílias saberem até quando."
                      : "As outras famílias da turma recebem esta atividade e decidem se aceitam."}
              </span>
            </span>
          </label>
        </div>
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
