"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AVATARES, Avatar } from "@/components/avatares";
import { BarraProgresso } from "@/components/ui/barra-progresso";
import { AncoraChapa, BotaoChapa } from "@/components/ui/botao-chapa";
import { createProfileAction } from "@/features/learning/actions";
import { authClient } from "@/lib/auth-client";
import { useServerAction } from "@/lib/use-server-action";
import {
  changePlanAction,
  checkoutAction,
  clearAction,
  familyChallengeAction,
  portalAction,
  reactivateAction,
  routineAction,
  weeklyReportEmailAction,
} from "../actions";

type CourseChoice = { id: string; label: string; grades: number[] };

/**
 * Volta do checkout da Stripe (`/familia?pagamento=recebido`).
 *
 * O acesso só é liberado pelo webhook, que costuma chegar segundos depois do
 * redirecionamento. Em vez de mostrar "Explorar gratuito" para quem acabou de
 * pagar, a página avisa que está confirmando e se atualiza sozinha até o plano
 * aparecer; depois limpa o parâmetro para um recarregamento não repetir o aviso.
 */
export function PaymentConfirmation({ paid, plano }: { paid: boolean; plano: string }) {
  const router = useRouter();
  const [tentativas, setTentativas] = useState(0);
  const esgotado = tentativas >= 15;
  useEffect(() => {
    if (paid) {
      const t = setTimeout(() => router.replace("/familia"), 8000);
      return () => clearTimeout(t);
    }
    if (esgotado) return;
    const t = setTimeout(() => {
      setTentativas((n) => n + 1);
      router.refresh();
    }, 4000);
    return () => clearTimeout(t);
  }, [paid, esgotado, router]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 rounded-card border-2 border-verde/40 bg-verde-claro p-4"
    >
      <p className="font-display font-semibold text-tinta">
        {paid
          ? `Pagamento confirmado. O plano ${plano} já está ativo.`
          : esgotado
            ? "A confirmação está demorando mais que o normal."
            : "Confirmando o pagamento com a operadora…"}
      </p>
      <p className="mt-1 text-sm text-tinta">
        {paid
          ? "Os perfis da família já podem explorar as trilhas assinadas."
          : esgotado
            ? "Se o valor foi cobrado, o acesso é liberado assim que a operadora avisar. Volte a esta página em alguns minutos."
            : "Esta página se atualiza sozinha. Nenhuma cobrança extra é feita enquanto isso."}
      </p>
    </div>
  );
}

const seletor =
  "mt-1.5 block h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground";

export function CreateProfile({ courses }: { courses: CourseChoice[] }) {
  const [nickname, setNickname] = useState("");
  const [grade, setGrade] = useState(6);
  const [avatar, setAvatar] = useState("cometa");
  const [courseId, setCourseId] = useState("olitef-n1");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
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
            if (result.ok) router.push("/hoje");
            else setMessage(result.error);
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

/**
 * Desafio da semana: uma meta somada entre os estudantes da casa.
 *
 * Cooperativo por construção — a barra é uma só, as contribuições aparecem sem
 * ordenação e a semana seguinte recomeça sem dívida. Quem aceita, ajusta e
 * encerra é o responsável; o app apenas sugere.
 */
export function FamilyChallenge({
  goal,
  suggested,
  progress,
  contributions,
}: {
  goal: number | null;
  suggested: number;
  progress: number;
  contributions: { profileId: string; nickname: string; strategies: number }[];
}) {
  const [meta, setMeta] = useState(goal ?? suggested);
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  function salvar(valor: number) {
    start(async () => {
      try {
        const result = await familyChallengeAction(valor);
        setMessage(
          result.ok
            ? valor === 0
              ? "Desafio encerrado nesta semana."
              : "Desafio da semana atualizado."
            : result.error,
        );
      } catch {
        setMessage("Não foi possível atualizar o desafio.");
      }
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Desafio da família</CardTitle>
        <p className="text-sm text-muted-foreground">
          Uma meta só, somando os estudantes da casa: estratégias diferentes resolvidas sem pistas
          nesta semana. Sem classificação entre irmãos e sem dívida na semana seguinte.
        </p>
      </CardHeader>
      <CardContent>
        {goal !== null && (
          <div className="mb-4">
            <p className="font-display font-semibold text-tinta">
              {progress} de {goal} estratégias nesta semana
            </p>
            <BarraProgresso feitos={progress} total={goal} className="mt-2 max-w-sm" />
            {contributions.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Participaram:{" "}
                {contributions.map((quem) => `${quem.nickname} (${quem.strategies})`).join(", ")}.
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="max-w-40">
            <Label htmlFor="desafio">Meta da semana</Label>
            <select
              id="desafio"
              className={seletor}
              value={meta}
              disabled={pending}
              onChange={(event) => setMeta(Number(event.target.value))}
            >
              {[4, 6, 8, 10, 12, 16, 20, 24, 30, 40].map((valor) => (
                <option key={valor} value={valor}>
                  {valor} estratégias
                </option>
              ))}
            </select>
          </div>
          <BotaoChapa type="button" medida="p" disabled={pending} onClick={() => salvar(meta)}>
            {goal === null ? "Aceitar desafio" : "Atualizar meta"}
          </BotaoChapa>
          {goal !== null && (
            <BotaoChapa
              type="button"
              tom="contorno"
              medida="p"
              disabled={pending}
              onClick={() => salvar(0)}
            >
              Encerrar nesta semana
            </BotaoChapa>
          )}
        </div>
        <p role="status" className="mt-2 text-sm font-medium">
          {message}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Resumo semanal por e-mail, opt-in.
 *
 * Desligado por padrão: o corpo descreve o estudo de uma criança, e ninguém
 * passa a receber esses dados por omissão. O destinatário é sempre a conta do
 * responsável — a decisão de nunca enviar lembrete ao estudante continua
 * valendo.
 */
export function WeeklyReportEmail({
  enabled,
  canceladoPeloEmail,
  email,
}: {
  enabled: boolean;
  /** Cancelamento feito pelo link do e-mail, que a coluna da família não reflete. */
  canceladoPeloEmail?: boolean;
  email: string;
}) {
  const [ligado, setLigado] = useState(enabled);
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Resumo da semana por e-mail</CardTitle>
        <p className="text-sm text-muted-foreground">
          Uma mensagem por semana para {email}, com a mesma leitura desta página e as conversas de
          apoio em casa. Nunca enviamos nada ao estudante.
        </p>
      </CardHeader>
      <CardContent>
        <BotaoChapa
          type="button"
          medida="p"
          tom={ligado ? "contorno" : "verde"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const proximo = !ligado;
              try {
                const result = await weeklyReportEmailAction(proximo);
                if (result.ok) {
                  setLigado(proximo);
                  setMessage(
                    proximo
                      ? "Resumo semanal ativado. Você pode desativar quando quiser."
                      : "Resumo semanal desativado.",
                  );
                } else setMessage(result.error);
              } catch {
                setMessage("Não foi possível atualizar o envio.");
              }
            })
          }
        >
          {ligado ? "Desativar o resumo semanal" : "Quero receber o resumo semanal"}
        </BotaoChapa>
        {canceladoPeloEmail && !ligado && (
          <p className="mt-2 text-sm text-muted-foreground">
            O envio foi cancelado pelo link de um e-mail anterior. Reativar aqui desfaz esse
            cancelamento.
          </p>
        )}
        <p role="status" className="mt-2 text-sm font-medium">
          {message}
        </p>
      </CardContent>
    </Card>
  );
}

export function Routine({ minutes }: { minutes: number }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
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
  const [pending, start] = useServerAction();
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
  const [pending, start] = useServerAction();
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

export function PrivacyControls({ outrasAssinaturas }: { outrasAssinaturas: boolean }) {
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [excluirConta, setExcluirConta] = useState(false);
  const [pending, start] = useServerAction();
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
      <details className="mt-3 rounded-xl border border-destructive/35 bg-coral-claro/50 p-4">
        <summary className="cursor-pointer font-semibold text-tinta">
          Excluir a conta Informach
        </summary>
        <p className="mt-3 text-sm text-tinta">
          A conta Informach é a mesma na Agenda da Turma e no Cozya. A exclusão apaga a conta e os
          dados do Missão Saber depois de você confirmar por e-mail. Registros financeiros seguem
          sua retenção própria.
        </p>
        {outrasAssinaturas && (
          <p className="mt-2 text-sm font-semibold text-tinta">
            Há assinatura ativa em outro app Informach. Encerre-a nas configurações daquele app
            antes de excluir a conta compartilhada.
          </p>
        )}
        <label htmlFor="excluir-conta" className="mt-3 flex items-start gap-3 text-sm text-tinta">
          <input
            id="excluir-conta"
            type="checkbox"
            className="mt-1 size-5 shrink-0 accent-[var(--ms-verde)]"
            checked={excluirConta}
            onChange={(e) => setExcluirConta(e.target.checked)}
          />
          Entendo que a exclusão vale para todos os apps Informach.
        </label>
        <button
          type="button"
          disabled={pending || !excluirConta || outrasAssinaturas}
          className="mt-3 rounded-md text-sm font-semibold text-destructive underline underline-offset-4 disabled:opacity-50"
          onClick={() =>
            start(async () => {
              try {
                const result = await authClient.deleteUser({ callbackURL: "/" });
                setMessage(
                  result.error
                    ? "Não foi possível solicitar a exclusão agora."
                    : "Enviamos um e-mail para confirmar a exclusão da conta.",
                );
              } catch {
                setMessage("Não foi possível solicitar a exclusão agora.");
              }
            })
          }
        >
          Solicitar exclusão por e-mail
        </button>
      </details>
      <p role="status" className="mt-2 text-sm font-medium">
        {message}
      </p>
    </>
  );
}
