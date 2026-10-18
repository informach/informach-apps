"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@informach/ui/components/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@informach/ui/components/form";
import { Input } from "@informach/ui/components/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@informach/ui/components/input-otp";
import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { AgendaSymbol } from "@/components/brand/agenda-logo";
import { CameraIcon, MessageIcon, MicIcon } from "@/components/icons/canvas-icons";
import { type BillingCycle, FREE_TRIAL_READS } from "@/features/billing/plans-content";
import { rememberLastChild } from "@/features/notices/last-child";
import { handOffPhoto } from "@/features/notices/photo-handoff";
import { createStudentProfileAction } from "@/features/students/actions";
import { PRO_STUDENT_PROFILE_LIMIT } from "@/features/students/limits";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { emailOtp, signUp } from "@/lib/auth-client";
import { describeAuthError } from "@/lib/auth-errors";
import { startProCheckoutAction } from "../actions";
import { type OtpInput, otpSchema, type SignupInput, signupSchema } from "../schemas";
import { afterVerification, proOfferHref, signupSteps } from "../signup-flow";
import { OnboardingStepper } from "./onboarding-stepper";

type Step =
  | { kind: "form" }
  | { kind: "otp"; email: string }
  | { kind: "checkout"; cycle: BillingCycle; failed: boolean }
  | { kind: "child" }
  | { kind: "notice"; profileId: string; childName: string };

const RESEND_COOLDOWN_SECONDS = 60;

/** As peças do canvas do começo, usadas em todos os passos. */
const TITLE = "text-[34px] font-extrabold leading-[1.08] tracking-[-0.04em]";
const LEAD = "text-base leading-normal text-foreground/80";
const LABEL = "text-sm font-bold";
const FIELD =
  "h-[52px] rounded-[14px] border-[1.5px] border-foreground/25 bg-background px-3.5 text-[17px] font-medium md:text-[17px]";
const PRIMARY = "min-h-14 w-full rounded-2xl text-[17px] font-extrabold shadow-solid-primary";
const QUIET = "inline-flex min-h-11 items-center text-[15px] font-bold text-primary-ink";

function StepHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="flex flex-col gap-2.5">
      <h1 className={TITLE}>{title}</h1>
      <p className={LEAD}>{children}</p>
    </header>
  );
}

/**
 * O cadastro: conta, código, a criança e o primeiro recado.
 *
 * Antes terminava na escolha de plano, antes de a pessoa ver a Agenda fazer
 * qualquer coisa, e com quatro zeros esperando em Hoje. Agora o plano sai do
 * caminho (o Pro aparece quando faz falta) e o cadastro termina onde a família
 * queria chegar: o recado que está na cabeça dela. Quem escolheu o Pro na
 * página de vendas vai direto ao pagamento depois do código; quem foi
 * convidado entra na casa de quem convidou.
 *
 * O desenho é o do canvas: sem cartão e sem cabeçalho, o símbolo e as barras
 * das etapas em cima, o título grande, os campos de 52 px e o botão no pé.
 */
export function SignupForm({
  next = null,
  plan = null,
}: {
  /** Destino explícito (`?next=`), como o convite de outro adulto. */
  next?: string | null;
  /** O Pro escolhido na página de vendas (`?plan=pro&cycle=`). */
  plan?: { cycle: BillingCycle } | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [resendCooldown, setResendCooldown] = useState(0);
  const [checkoutPending, startCheckout] = useTransition();
  const path = afterVerification({ next, plan });
  // Quem desiste do pagamento e segue no grátis passa a estar no caminho da
  // criança: o passo a passo acompanha, em vez de dizer "Pagamento".
  const steps = signupSteps(
    (step.kind === "child" || step.kind === "notice") && path.kind !== "child"
      ? { kind: "child", continueTo: null }
      : path,
  );
  const currentStep =
    step.kind === "form" ? 1 : step.kind === "otp" ? 2 : step.kind === "notice" ? 4 : 3;
  // Quem escolheu o Pro e descobre que já tem conta entra pelo login e cai na
  // oferta, no mesmo ciclo; o convite leva o destino dele.
  const afterLogin = next ?? (plan ? proOfferHref(plan.cycle) : null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  /**
   * Abre o pagamento do Pro no ciclo escolhido. Roda na confirmação do código
   * (é para isso que a pessoa escolheu o Pro na página) e no "Tentar de novo".
   */
  const openCheckout = (cycle: BillingCycle) => {
    setStep({ kind: "checkout", cycle, failed: false });
    startCheckout(async () => {
      const result = await catchActionResult(() => startProCheckoutAction({ cycle }));
      if (result.ok) {
        window.location.href = result.value.url;
        return;
      }
      if (!isActionRejected(result.error) && result.error.code === "ALREADY_SUBSCRIBED") {
        router.push("/dashboard");
        return;
      }
      setStep({ kind: "checkout", cycle, failed: true });
    });
  };

  const onVerified = () => {
    if (path.kind === "next") {
      router.push(path.href);
      return;
    }
    if (path.kind === "checkout") {
      openCheckout(path.cycle);
      return;
    }
    setStep({ kind: "child" });
  };

  // Depois da criança, o destino que a pessoa tinha (o convite de uma turma,
  // por exemplo) ou o primeiro recado.
  const onChildCreated = (profileId: string, childName: string) => {
    if (path.kind === "child" && path.continueTo) {
      router.push(path.continueTo);
      return;
    }
    setStep({ kind: "notice", profileId, childName });
  };

  return (
    <div className="flex min-h-dvh w-full max-w-md flex-col gap-[22px] px-5 pb-7 pt-5 lg:min-h-0 lg:py-14">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          aria-label="Agenda da Turma, página inicial"
          className="flex min-h-11 items-center"
        >
          <AgendaSymbol aria-hidden />
        </Link>
        <OnboardingStepper steps={steps} currentStep={currentStep} />
      </div>

      {step.kind === "form" ? (
        <>
          <StepHeader
            title={
              path.kind === "checkout"
                ? "Crie a conta para assinar o Pro"
                : path.kind === "next"
                  ? "Crie a sua conta"
                  : "Vamos começar pelo recado que está te preocupando."
            }
          >
            {path.kind === "checkout"
              ? "Depois de confirmar o e-mail, você vai direto para o pagamento."
              : path.kind === "next"
                ? "Depois de confirmar o e-mail, você entra na casa de quem te convidou."
                : `Crie a conta e, logo em seguida, mande ele. Os ${FREE_TRIAL_READS} primeiros são por nossa conta.`}
          </StepHeader>
          <FormStep
            afterLogin={afterLogin}
            onSubmitted={(email) => {
              setStep({ kind: "otp", email });
              setResendCooldown(RESEND_COOLDOWN_SECONDS);
            }}
            footer={
              <p className="text-center text-[15px]">
                Já tem conta?{" "}
                <Link
                  href={afterLogin ? `/login?next=${encodeURIComponent(afterLogin)}` : "/login"}
                  className="font-bold text-primary-ink underline"
                >
                  Entrar
                </Link>
              </p>
            }
          />
        </>
      ) : step.kind === "otp" ? (
        <>
          <StepHeader title="Confira seu e-mail">
            Mandamos um código de 6 números para {step.email}.
          </StepHeader>
          <OtpStep
            email={step.email}
            resendCooldown={resendCooldown}
            onResendStarted={() => setResendCooldown(RESEND_COOLDOWN_SECONDS)}
            onVerified={onVerified}
            onBack={() => setStep({ kind: "form" })}
          />
        </>
      ) : step.kind === "checkout" ? (
        <CheckoutStep
          cycle={step.cycle}
          failed={step.failed}
          pending={checkoutPending}
          onRetry={() => openCheckout(step.cycle)}
          onSkip={() => setStep({ kind: "child" })}
        />
      ) : step.kind === "child" ? (
        <ChildStep onCreated={onChildCreated} />
      ) : (
        <FirstNoticeStep profileId={step.profileId} childName={step.childName} />
      )}
    </div>
  );
}

function FormStep({
  afterLogin,
  onSubmitted,
  footer,
}: {
  /** Para onde o login leva quem descobre que já tem conta. */
  afterLogin: string | null;
  onSubmitted: (email: string) => void;
  footer: ReactNode;
}) {
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const [duplicateEmail, setDuplicateEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Limpa o aviso de duplicata assim que o e-mail muda.
  useEffect(() => {
    const sub = form.watch((values, info) => {
      if (info.name === "email" && duplicateEmail && values.email !== duplicateEmail) {
        setDuplicateEmail(null);
      }
    });
    return () => sub.unsubscribe();
  }, [form, duplicateEmail]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (duplicateEmail && values.email === duplicateEmail) return;

    const { error } = await signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    });

    if (error) {
      const code = error.code ?? "";
      if (code === "USER_ALREADY_EXISTS" || /already/i.test(error.message ?? "")) {
        setDuplicateEmail(values.email);
        return;
      }
      toast.error("Não foi possível criar sua conta.", {
        description: describeAuthError(error, "Tente de novo em instantes."),
      });
      return;
    }

    onSubmitted(values.email);
  });

  const loginHref = (email: string) =>
    `/login?email=${encodeURIComponent(email)}${afterLogin ? `&next=${encodeURIComponent(afterLogin)}` : ""}`;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-[22px]">
        <div className="flex flex-col gap-3.5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className={LABEL}>Seu nome</FormLabel>
                <FormControl>
                  <Input type="text" autoComplete="name" className={FIELD} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className={LABEL}>E-mail</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    className={FIELD}
                    {...field}
                  />
                </FormControl>
                {duplicateEmail ? (
                  <p className="text-sm font-semibold text-destructive-ink">
                    Já existe uma conta com esse e-mail.{" "}
                    <Link href={loginHref(duplicateEmail)} className="underline underline-offset-2">
                      Entrar com ele
                    </Link>
                  </p>
                ) : (
                  <FormMessage />
                )}
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className={LABEL}>Senha</FormLabel>
                {/* Uma senha só, com "Mostrar" dentro do campo: repetir a senha
                    era um campo a mais no celular para conferir o que um botão
                    mostra. */}
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      className={cn(FIELD, "pr-24")}
                      {...field}
                    />
                  </FormControl>
                  <button
                    type="button"
                    className="absolute right-1.5 top-1 inline-flex min-h-11 items-center px-2.5 text-sm font-bold text-primary-ink"
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? "Esconder" : "Mostrar"}
                  </button>
                </div>
                <FormDescription className="text-[13px] font-medium">
                  Pelo menos 8 caracteres
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="mt-auto flex flex-col gap-3">
          <Button type="submit" className={PRIMARY} disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Criar conta
          </Button>
          {footer}
        </div>
      </form>
    </Form>
  );
}

function OtpStep({
  email,
  resendCooldown,
  onResendStarted,
  onVerified,
  onBack,
}: {
  email: string;
  resendCooldown: number;
  onResendStarted: () => void;
  onVerified: () => void;
  onBack: () => void;
}) {
  const [resending, setResending] = useState(false);
  const form = useForm<OtpInput>({
    resolver: zodResolver(otpSchema),
    defaultValues: { email, otp: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await emailOtp.verifyEmail({
      email: values.email,
      otp: values.otp,
    });

    if (error) {
      const code = error.code ?? "";
      const message = error.message ?? "";
      if (code === "INVALID_OTP" || /invalid/i.test(message)) {
        form.setError("otp", { message: "Código inválido. Confira e tente de novo." });
        return;
      }
      if (code === "OTP_EXPIRED" || /expired/i.test(message)) {
        toast.error("O código venceu.", { description: "Peça outro código." });
        form.resetField("otp");
        return;
      }
      if (code === "TOO_MANY_ATTEMPTS" || /attempts/i.test(message)) {
        toast.error("Muitas tentativas.", { description: "Peça outro código e tente de novo." });
        return;
      }
      toast.error("Não foi possível confirmar.", {
        description: describeAuthError(error, "Tente de novo em instantes."),
      });
      return;
    }

    onVerified();
  });

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    try {
      const { error } = await emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (error) {
        toast.error("Não foi possível mandar outro código.", {
          description: describeAuthError(error, "Tente de novo em instantes."),
        });
        return;
      }
      onResendStarted();
      toast.success("Mandamos outro código.", { description: `Confira o e-mail ${email}.` });
    } finally {
      setResending(false);
    }
  };

  const slot =
    "h-[52px] w-full rounded-[14px] border-[1.5px] border-foreground/25 bg-background text-2xl font-extrabold first:rounded-[14px] first:border-[1.5px] last:rounded-[14px]";

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-[22px]">
        <FormField
          control={form.control}
          name="otp"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="sr-only">Código de 6 números</FormLabel>
              <FormControl>
                <InputOTP
                  maxLength={6}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  autoFocus
                  containerClassName="w-full"
                >
                  <InputOTPGroup className="grid w-full grid-cols-6 gap-2">
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <InputOTPSlot key={index} index={index} className={slot} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-1">
          <p className="text-[15px] text-muted-foreground">
            {resendCooldown > 0
              ? `Não chegou? Dá para pedir outro em ${resendCooldown} segundos. Olhe também o spam.`
              : "Não chegou? Olhe também o spam, ou peça outro código."}
          </p>
          {/* O canvas não desenha as duas saídas, e a casa precisa delas: o
              código que não chegou e o e-mail digitado errado. */}
          <div className="flex flex-wrap gap-x-4">
            <button
              type="button"
              className={cn(QUIET, "disabled:opacity-50")}
              onClick={handleResend}
              disabled={resendCooldown > 0 || resending}
            >
              {resending ? "Mandando…" : "Pedir outro código"}
            </button>
            <button type="button" className={cn(QUIET, "text-foreground")} onClick={onBack}>
              Trocar o e-mail
            </button>
          </div>
        </div>
        <div className="mt-auto">
          <Button
            type="submit"
            className={PRIMARY}
            disabled={form.formState.isSubmitting || form.watch("otp").length < 6}
          >
            {form.formState.isSubmitting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            )}
            Confirmar
          </Button>
        </div>
      </form>
    </Form>
  );
}

/**
 * O Pro escolhido na página de vendas: o pagamento abre logo depois do código.
 *
 * Se não abrir (Stripe fora do ar, plano ainda não configurado neste
 * ambiente), a pessoa não fica parada: tenta de novo ou segue o cadastro no
 * grátis, e o Pro continua a um toque, em Assinatura.
 */
function CheckoutStep({
  cycle,
  failed,
  pending,
  onRetry,
  onSkip,
}: {
  cycle: BillingCycle;
  failed: boolean;
  pending: boolean;
  onRetry: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-[22px]" aria-live="polite">
      <StepHeader title={failed ? "O pagamento não abriu" : "Abrindo o pagamento do Pro"}>
        {failed
          ? "Dá para tentar de novo agora ou seguir no grátis e assinar depois, em Assinatura."
          : `Plano ${cycle === "annual" ? "anual" : "mensal"}. Você volta para a Agenda logo depois.`}
      </StepHeader>
      {failed ? (
        <div className="mt-auto flex flex-col gap-3">
          <Button className={PRIMARY} onClick={onRetry} disabled={pending}>
            Tentar de novo
          </Button>
          <button type="button" className={cn(QUIET, "justify-center")} onClick={onSkip}>
            Seguir no grátis
          </button>
        </div>
      ) : (
        <Loader2 className="size-6 animate-spin" aria-hidden />
      )}
    </div>
  );
}

function ChildStep({ onCreated }: { onCreated: (profileId: string, name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Escreva o nome da criança, com pelo menos 2 letras.");
      return;
    }
    startTransition(async () => {
      const result = await catchActionResult(() =>
        createStudentProfileAction({ name: trimmed, birthDate: null }),
      );
      if (!result.ok) {
        // A criança já pode estar guardada (a primeira tentativa gravou e a
        // resposta se perdeu): aí o grátis recusa a segunda, e o caminho é Hoje.
        setError(
          !isActionRejected(result.error) && result.error.code === "PLAN_LIMIT_REACHED"
            ? "Esta conta já tem uma criança cadastrada. Siga para Hoje, ela está lá."
            : "Não foi possível guardar o nome. Tente de novo em instantes.",
        );
        return;
      }
      rememberLastChild(result.value.id);
      onCreated(result.value.id, trimmed);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-[22px]">
      <StepHeader title="Como se chama a criança?">
        Só o nome basta. Escola, turma e horário podem vir depois, e cada um deixa a Agenda mais
        esperta.
      </StepHeader>
      <label htmlFor="signup-child" className={cn(LABEL, "flex flex-col gap-1.5")}>
        Nome
        <Input
          id="signup-child"
          value={name}
          maxLength={80}
          autoComplete="off"
          className={FIELD}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "signup-child-error" : undefined}
        />
      </label>
      {error ? (
        <p id="signup-child-error" role="alert" className="text-sm text-destructive-ink">
          {error}
        </p>
      ) : null}
      <p className="text-sm leading-normal text-muted-foreground">
        Tem mais de um filho? No Pro cabem até {countWordMasculine(PRO_STUDENT_PROFILE_LIMIT)}. Dá
        para acrescentar depois, em Família.
      </p>
      <div className="mt-auto flex flex-col gap-1">
        <Button type="submit" className={PRIMARY} disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          Continuar
        </Button>
        {/* Uma saída, para quem não quer cadastrar agora: Hoje pede a criança
            nos primeiros passos. O canvas não a desenha. */}
        <Link href="/dashboard" className={cn(QUIET, "justify-center")}>
          Fazer isso depois
        </Link>
      </div>
    </form>
  );
}

/** "três", como no canvas ("No Pro cabem até três"); números maiores ficam em algarismos. */
function countWordMasculine(n: number) {
  return ["zero", "um", "dois", "três", "quatro", "cinco"][n] ?? String(n);
}

const FIRST_NOTICE = [
  {
    mode: "foto",
    icon: CameraIcon,
    label: "Tirar uma foto",
    hint: "agenda, caderno, cartaz ou print",
    tile: "bg-chart-1/14 text-chart-1-ink",
  },
  {
    mode: "colar",
    icon: MessageIcon,
    label: "Colar uma mensagem",
    hint: "do grupo, do Teams ou do Batista ID",
    tile: "bg-chart-2/14 text-chart-2-ink",
  },
  {
    mode: "falar",
    icon: MicIcon,
    label: "Falar",
    hint: "conte o que precisa ser feito",
    tile: "bg-chart-3/14 text-chart-3-ink",
  },
] as const;

function FirstNoticeStep({ profileId, childName }: { profileId: string; childName: string }) {
  const router = useRouter();
  const hrefFor = (mode: string) =>
    `/recados/novo?modo=${mode}&perfil=${encodeURIComponent(profileId)}`;
  const optionClass =
    "flex min-h-[68px] w-full items-center gap-3.5 rounded-[18px] border border-foreground/15 bg-background px-4 py-2.5 text-left hover:bg-muted/60";
  return (
    <div className="flex flex-1 flex-col gap-[22px]">
      <StepHeader title={`Agora, o primeiro recado de ${childName}.`}>
        Pode ser o cartaz de provas, a mensagem do grupo ou a página da agenda. Você confere tudo
        antes de salvar.
      </StepHeader>
      <ul className="flex flex-col gap-2.5">
        {FIRST_NOTICE.map(({ mode, icon: Icon, label, hint, tile }) => {
          const content = (
            <>
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-[14px]",
                  tile,
                )}
              >
                <Icon className="size-6" aria-hidden />
              </span>
              <span>
                <span className="block text-[17px] font-bold">{label}</span>
                <span className="block text-sm text-muted-foreground">{hint}</span>
              </span>
            </>
          );
          return (
            <li key={mode}>
              {mode === "foto" ? (
                // Como na folha "O que chegou?": a câmera (ou a galeria) abre
                // daqui, e a tela do recado já chega com a foto.
                <label
                  className={cn(
                    optionClass,
                    "cursor-pointer focus-within:ring-2 focus-within:ring-ring",
                  )}
                >
                  {content}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      handOffPhoto(file);
                      router.push(hrefFor(mode));
                    }}
                  />
                </label>
              ) : (
                <Link href={hrefFor(mode)} className={optionClass}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex flex-col items-center gap-1.5">
        <p className="text-center text-sm leading-normal text-muted-foreground">
          Dica: com a Agenda instalada no Android, dá para compartilhar a mensagem direto do
          WhatsApp.
        </p>
        <Link href="/dashboard" className={QUIET}>
          Ir para Hoje sem recado
        </Link>
      </div>
    </div>
  );
}
