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
import { ArrowLeft, Camera, Loader2, MessageSquareText, Mic } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { type BillingCycle, FREE_TRIAL_READS } from "@/features/billing/plans-content";
import { rememberLastChild } from "@/features/notices/last-child";
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

/**
 * O cadastro: conta, código, a criança e o primeiro recado.
 *
 * Antes terminava na escolha de plano, antes de a pessoa ver a Agenda fazer
 * qualquer coisa, e com quatro zeros esperando em Hoje. Agora o plano sai do
 * caminho (o Pro aparece quando faz falta) e o cadastro termina onde a família
 * queria chegar: o recado que está na cabeça dela. Quem escolheu o Pro na
 * página de vendas vai direto ao pagamento depois do código; quem foi
 * convidado entra na casa de quem convidou.
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
    <div className="w-full max-w-md space-y-6">
      <OnboardingStepper steps={steps} currentStep={currentStep} />

      <section className="space-y-5 rounded-[20px] border border-foreground/15 bg-background p-5 sm:p-6">
        {step.kind === "form" ? (
          <>
            <header className="space-y-2">
              <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">
                {path.kind === "checkout"
                  ? "Crie a conta para assinar o Pro"
                  : path.kind === "next"
                    ? "Crie a sua conta"
                    : "Vamos começar pelo recado que está te preocupando."}
              </h1>
              <p className="text-[15px] text-muted-foreground">
                {path.kind === "checkout"
                  ? "Depois de confirmar o e-mail, você vai direto para o pagamento."
                  : path.kind === "next"
                    ? "Depois de confirmar o e-mail, você entra na casa de quem te convidou."
                    : `Crie a conta e, logo em seguida, mande ele. Os ${FREE_TRIAL_READS} primeiros são por nossa conta.`}
              </p>
            </header>
            <FormStep
              afterLogin={afterLogin}
              onSubmitted={(email) => {
                setStep({ kind: "otp", email });
                setResendCooldown(RESEND_COOLDOWN_SECONDS);
              }}
            />
            <p className="text-center text-sm text-muted-foreground">
              Já tem conta?{" "}
              <Link
                href={afterLogin ? `/login?next=${encodeURIComponent(afterLogin)}` : "/login"}
                className="inline-flex min-h-11 items-center font-bold text-primary-ink hover:underline"
              >
                Entrar
              </Link>
            </p>
          </>
        ) : step.kind === "otp" ? (
          <>
            <header className="space-y-2">
              <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">
                Confira seu e-mail
              </h1>
              <p className="text-[15px] text-muted-foreground">
                Mandamos um código de 6 números para{" "}
                <span className="font-semibold text-foreground">{step.email}</span>.
              </p>
            </header>
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
      </section>
    </div>
  );
}

function FormStep({
  afterLogin,
  onSubmitted,
}: {
  /** Para onde o login leva quem descobre que já tem conta. */
  afterLogin: string | null;
  onSubmitted: (email: string) => void;
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
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Seu nome</FormLabel>
              <FormControl>
                <Input type="text" autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" inputMode="email" {...field} />
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
            <FormItem>
              <FormLabel>Senha</FormLabel>
              {/* Uma senha só, com "Mostrar": repetir a senha era um campo a
                  mais no celular para conferir o que um botão mostra. */}
              <div className="flex gap-2">
                <FormControl>
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    {...field}
                  />
                </FormControl>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 shrink-0 rounded-xl"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? "Esconder" : "Mostrar"}
                </Button>
              </div>
              <FormDescription>Pelo menos 8 caracteres.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          size="lg"
          className="min-h-12 w-full rounded-xl text-base font-extrabold"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          Criar conta
        </Button>
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

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-5">
        <FormField
          control={form.control}
          name="otp"
          render={({ field }) => (
            <FormItem className="flex flex-col items-center gap-3">
              <FormLabel className="sr-only">Código de 6 números</FormLabel>
              <FormControl>
                <InputOTP
                  maxLength={6}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  autoFocus
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
                    <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
                    <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
                    <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
                    <InputOTPSlot index={4} className="h-12 w-12 text-lg" />
                    <InputOTPSlot index={5} className="h-12 w-12 text-lg" />
                  </InputOTPGroup>
                </InputOTP>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="text-center text-sm text-muted-foreground">
          {resendCooldown > 0
            ? `Não chegou? Dá para pedir outro em ${resendCooldown} segundos. Olhe também o spam.`
            : "Não chegou? Olhe também o spam, ou peça outro código."}
        </p>
        <Button
          type="submit"
          size="lg"
          className="min-h-12 w-full rounded-xl text-base font-extrabold"
          disabled={form.formState.isSubmitting || form.watch("otp").length < 6}
        >
          {form.formState.isSubmitting && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          )}
          Confirmar
        </Button>
        <div className="flex items-center justify-between text-sm">
          <Button type="button" variant="ghost" className="min-h-11" onClick={onBack}>
            <ArrowLeft className="mr-1 size-4" aria-hidden />
            Voltar
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={handleResend}
            disabled={resendCooldown > 0 || resending}
          >
            {resending ? "Mandando…" : "Pedir outro código"}
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
    <div className="space-y-4" aria-live="polite">
      <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">
        {failed ? "O pagamento não abriu" : "Abrindo o pagamento do Pro"}
      </h1>
      <p className="text-[15px] text-muted-foreground">
        {failed
          ? "Dá para tentar de novo agora ou seguir no grátis e assinar depois, em Assinatura."
          : `Plano ${cycle === "annual" ? "anual" : "mensal"}. Você volta para a Agenda logo depois.`}
      </p>
      {failed ? (
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 rounded-xl font-bold" onClick={onRetry} disabled={pending}>
            Tentar de novo
          </Button>
          <Button variant="ghost" className="min-h-11 rounded-xl" onClick={onSkip}>
            Seguir no grátis
          </Button>
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
    <form onSubmit={submit} className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">
          Como se chama a criança?
        </h1>
        <p className="text-[15px] text-muted-foreground">
          Só o nome basta. Escola, turma e horário podem vir depois, e cada um deixa a Agenda mais
          esperta.
        </p>
      </header>
      <label htmlFor="signup-child" className="grid gap-2 text-sm font-semibold">
        Nome
        <Input
          id="signup-child"
          value={name}
          maxLength={80}
          autoComplete="off"
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
      <p className="text-sm text-muted-foreground">
        Tem mais de um filho? No Pro cabem até {PRO_STUDENT_PROFILE_LIMIT}. Dá para acrescentar
        depois, em Família.
      </p>
      <Button
        type="submit"
        size="lg"
        className="min-h-12 w-full rounded-xl text-base font-extrabold"
        disabled={pending}
      >
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
        Continuar
      </Button>
      {/* Uma saída, para quem não quer cadastrar agora: Hoje pede a criança
          nos primeiros passos. */}
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center text-sm font-bold text-primary-ink"
      >
        Fazer isso depois
      </Link>
    </form>
  );
}

const FIRST_NOTICE = [
  {
    mode: "foto",
    icon: Camera,
    label: "Tirar uma foto",
    hint: "agenda, caderno, cartaz ou print",
  },
  {
    mode: "colar",
    icon: MessageSquareText,
    label: "Colar uma mensagem",
    hint: "do grupo, do Teams ou do Batista ID",
  },
  { mode: "falar", icon: Mic, label: "Falar", hint: "conte o que precisa ser feito" },
] as const;

function FirstNoticeStep({ profileId, childName }: { profileId: string; childName: string }) {
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">
          Agora, o primeiro recado de {childName}.
        </h1>
        <p className="text-[15px] text-muted-foreground">
          Pode ser o cartaz de provas, a mensagem do grupo ou a página da agenda. Você confere tudo
          antes de salvar.
        </p>
      </header>
      <ul className="space-y-2">
        {FIRST_NOTICE.map(({ mode, icon: Icon, label, hint }) => (
          <li key={mode}>
            <Link
              href={`/recados/novo?modo=${mode}&perfil=${encodeURIComponent(profileId)}`}
              className="flex min-h-16 items-center gap-3 rounded-2xl border border-foreground/15 px-4 py-3 hover:bg-muted/60"
            >
              <Icon className="size-6 shrink-0" aria-hidden />
              <span>
                <span className="block text-[15px] font-extrabold">{label}</span>
                <span className="block text-sm text-muted-foreground">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Dica: com a Agenda instalada no Android, dá para compartilhar a mensagem direto do WhatsApp.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center text-sm font-bold text-primary-ink"
      >
        Ir para Hoje sem recado
      </Link>
    </div>
  );
}
