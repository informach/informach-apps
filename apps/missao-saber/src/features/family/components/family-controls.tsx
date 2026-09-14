"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AVATARES, Avatar } from "@/components/avatares";
import { AncoraChapa, BotaoChapa } from "@/components/ui/botao-chapa";
import { createProfileAction } from "@/features/learning/actions";
import { authClient } from "@/lib/auth-client";
import {
  changePlanAction,
  checkoutAction,
  clearAction,
  portalAction,
  reactivateAction,
  routineAction,
} from "../actions";

type CourseChoice = { id: string; label: string; grades: number[] };

const seletor =
  "mt-1.5 block h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground";

export function CreateProfile({ courses }: { courses: CourseChoice[] }) {
  const [nickname, setNickname] = useState("");
  const [grade, setGrade] = useState(6);
  const [avatar, setAvatar] = useState("cometa");
  const [courseId, setCourseId] = useState("olitef-n1");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          try {
            const result = await createProfileAction({
              nickname,
              grade,
              avatar,
              courseId,
              consent,
            });
            if (result.ok) {
              router.push("/hoje");
              router.refresh();
            } else setMessage(result.error);
          } catch {
            setMessage(
              "Não foi possível criar o perfil. Confira os perfis existentes antes de tentar novamente.",
            );
          }
        });
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Uma nova jornada</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label htmlFor="apelido">Apelido do estudante</Label>
            <Input
              id="apelido"
              className="mt-1.5 h-11"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              minLength={2}
              maxLength={24}
              required
              placeholder="Sem nome completo"
              autoComplete="off"
            />
          </div>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ano">Ano escolar</Label>
              <select
                id="ano"
                className={seletor}
                value={grade}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setGrade(next);
                  if (!courses.find((c) => c.id === courseId)?.grades.includes(next))
                    setCourseId("olitef-n1");
                }}
              >
                <option value={6}>6º ano</option>
                <option value={7}>7º ano</option>
              </select>
            </div>
            <div>
              <Label htmlFor="avatar">Avatar</Label>
              {/* Prévia ao lado: o avatar deixou de ser dado invisível. */}
              <div className="mt-1.5 flex items-center gap-3">
                <Avatar id={avatar} tamanho="p" />
                <select
                  id="avatar"
                  className={`${seletor} mt-0`}
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                >
                  {AVATARES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="mb-4">
            <Label htmlFor="trilha-inicial">Primeira trilha</Label>
            <select
              id="trilha-inicial"
              className={seletor}
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              {courses
                .filter((c) => c.grades.includes(grade))
                .map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.label}
                  </option>
                ))}
            </select>
          </div>
          <div className="mb-5 flex items-start gap-3">
            <input
              id="consentimento-perfil"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
              className="mt-1 size-5 shrink-0 accent-[var(--ms-verde)]"
            />
            <Label htmlFor="consentimento-perfil" className="text-sm leading-snug font-normal">
              Sou responsável legal, maior de 18 anos. Autorizo o perfil e o registro de tentativas,
              pistas e descobertas para acompanhar a aprendizagem, conforme a{" "}
              <a href="/privacidade" className="font-medium underline underline-offset-4">
                política de privacidade
              </a>
              .
            </Label>
          </div>
          <BotaoChapa type="submit" disabled={pending}>
            {pending ? "Criando…" : "Criar perfil e explorar"}
          </BotaoChapa>
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {message}
          </p>
        </CardContent>
      </Card>
    </form>
  );
}

export function Routine({ minutes }: { minutes: number }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Um ritmo que cabe no dia</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-w-64">
          <Label htmlFor="rotina">Tempo sugerido por dia</Label>
          <select
            id="rotina"
            className={seletor}
            defaultValue={minutes}
            disabled={pending}
            onChange={(event) => {
              const value = Number(event.target.value);
              start(async () => {
                try {
                  const result = await routineAction(value);
                  setMessage(result.ok ? "Rotina atualizada." : result.error);
                } catch {
                  setMessage("Não foi possível atualizar a rotina.");
                }
              });
            }}
          >
            {[5, 10, 15, 20].map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Uma sugestão, sem bloqueio de estudo nem punição por dias sem uso. Não enviamos lembretes
          ao estudante.
        </p>
        <p role="status" className="mt-1 text-sm font-medium">
          {message}
        </p>
      </CardContent>
    </Card>
  );
}

export function BillingButton({
  productId,
  disabled,
  children,
}: {
  productId?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <div>
      <BotaoChapa
        type="button"
        tom="contorno"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            try {
              const result = productId ? await checkoutAction(productId) : await portalAction();
              if (result.ok) window.location.assign(result.data.url);
              else setMessage(result.error);
            } catch {
              setMessage(
                "Não foi possível abrir o pagamento. Confira sua assinatura antes de tentar novamente.",
              );
            }
          })
        }
      >
        {pending ? "Abrindo…" : children}
      </BotaoChapa>
      <p role="status" className="mt-1.5 text-sm font-medium wrap-anywhere text-coral-fundo">
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
  profiles: { id: string; nickname: string; accessEnabled: boolean }[];
  cancelAtPeriodEnd: boolean;
  hasPendingChange: boolean;
}) {
  const [retainedProfileId, setRetainedProfileId] = useState(
    profiles.find((profile) => profile.accessEnabled)?.id ?? profiles[0]?.id ?? "",
  );
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const needsChoice =
    options.some((option) => option.requiresRetainedProfile) && profiles.length > 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-base">Alterar a assinatura</CardTitle>
      </CardHeader>
      <CardContent>
        {(cancelAtPeriodEnd || hasPendingChange) && (
          <p className="mb-4 text-sm text-muted-foreground">
            {cancelAtPeriodEnd
              ? "Há uma alteração agendada. Para escolher outro plano, primeiro mantenha a assinatura atual."
              : "A confirmação da alteração anterior ficou pendente. Você pode tentar novamente ou manter a assinatura atual."}
          </p>
        )}
        {needsChoice && (
          <div className="mb-4 max-w-sm">
            <Label htmlFor="perfil-mantido">
              Perfil que continuará ativo em um plano Individual
            </Label>
            <select
              id="perfil-mantido"
              className={seletor}
              value={retainedProfileId}
              onChange={(event) => setRetainedProfileId(event.target.value)}
              disabled={pending}
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.nickname}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">
              Os demais históricos ficam guardados e voltam a estudar quando o plano permitir.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2.5">
          {options.map((option) => (
            <BotaoChapa
              key={option.id}
              type="button"
              tom="contorno"
              disabled={
                pending ||
                (option.requiresRetainedProfile && profiles.length > 0 && !retainedProfileId)
              }
              onClick={() =>
                start(async () => {
                  const result = await changePlanAction(
                    option.id,
                    option.requiresRetainedProfile && profiles.length > 0
                      ? retainedProfileId
                      : undefined,
                  );
                  if (!result.ok) {
                    setMessage(result.error);
                    return;
                  }
                  if (result.data.url) {
                    window.location.assign(result.data.url);
                    return;
                  }
                  setMessage(
                    result.data.effective === "now"
                      ? "Plano alterado. O acesso foi atualizado após a confirmação da cobrança."
                      : "Alteração agendada para o fim do período já pago.",
                  );
                  router.refresh();
                })
              }
            >
              {option.label}
              {option.timing === "schedule_at_period_end" ? " no fim do período" : " agora"}
            </BotaoChapa>
          ))}
          {(cancelAtPeriodEnd || hasPendingChange) && (
            <BotaoChapa
              type="button"
              tom="contorno"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await reactivateAction();
                  setMessage(
                    result.ok
                      ? "Cancelamento desfeito; a assinatura continuará ativa."
                      : result.error,
                  );
                  if (result.ok) router.refresh();
                })
              }
            >
              Manter assinatura atual
            </BotaoChapa>
          )}
        </div>
        <ul className="mt-4 grid gap-1 text-xs text-muted-foreground">
          <li>
            Trocas para anual e aumentos de perfis são cobrados com ajuste proporcional agora.
          </li>
          <li>Reduções de perfis e trocas de anual para mensal entram no fim do período pago.</li>
        </ul>
        <p role="status" className="mt-2 text-sm font-medium">
          {message}
        </p>
      </CardContent>
    </Card>
  );
}

export function PrivacyControls() {
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <AncoraChapa href="/api/familia/exportar" tom="contorno">
          Exportar dados em JSON
        </AncoraChapa>
        <button
          type="button"
          disabled={pending}
          className="rounded-md text-sm font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={() =>
            start(async () => {
              try {
                const result = await authClient.signOut();
                if (result.error) {
                  setMessage("Não foi possível sair agora.");
                  return;
                }
                router.push("/");
                router.refresh();
              } catch {
                setMessage("Não foi possível sair agora.");
              }
            })
          }
        >
          Sair da conta neste aparelho
        </button>
      </div>
      <details className="mt-5 rounded-xl border border-destructive/35 bg-coral-claro/50 p-4">
        <summary className="cursor-pointer font-semibold text-tinta">
          Encerrar o Missão Saber e apagar dados pedagógicos
        </summary>
        <p className="mt-3 text-sm text-tinta">
          Esta ação cancela imediatamente a assinatura deste app e remove todos os perfis, missões,
          tentativas e anotações do Missão Saber. Exporte antes se quiser uma cópia. A conta
          Informach e os dados da Agenda da Turma e do Cozya permanecem. Registros financeiros
          seguem sua retenção própria.
        </p>
        <div className="mt-4 max-w-72">
          <Label htmlFor="confirmacao">Digite ENCERRAR E APAGAR</Label>
          <Input
            id="confirmacao"
            className="mt-1.5 h-11"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          disabled={pending || confirmation !== "ENCERRAR E APAGAR"}
          className="mt-3 rounded-md text-sm font-semibold text-destructive underline underline-offset-4 disabled:opacity-50"
          onClick={() =>
            start(async () => {
              try {
                const result = await clearAction(confirmation);
                if (result.ok) {
                  setConfirmation("");
                  setMessage("Assinatura encerrada e dados pedagógicos removidos.");
                  router.refresh();
                } else setMessage(result.error);
              } catch {
                setMessage(
                  "A operação não pôde ser confirmada. Verifique seus perfis e assinatura antes de repetir.",
                );
              }
            })
          }
        >
          Confirmar encerramento e exclusão
        </button>
      </details>
      <p role="status" className="mt-2 text-sm font-medium">
        {message}
      </p>
    </>
  );
}
