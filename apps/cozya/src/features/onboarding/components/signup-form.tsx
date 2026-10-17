"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@informach/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@informach/ui/components/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@informach/ui/components/form";
import { Input } from "@informach/ui/components/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@informach/ui/components/input-otp";
import { toast } from "@informach/ui/components/sonner";
import { ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { emailOtp, signUp } from "@/lib/auth-client";
import { type OtpInput, otpSchema, type SignupInput, signupSchema } from "../schemas";
import { OnboardingStepper } from "./onboarding-stepper";

type Step = { kind: "form" } | { kind: "otp"; email: string; name: string };

const RESEND_COOLDOWN_SECONDS = 60;

export function SignupForm({
  verifiedRedirectTo = "/hoje",
  withPlan = false,
}: {
  verifiedRedirectTo?: string;
  /** Only who chose the Pro on the sales page has a plan step after the code. */
  withPlan?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [resendCooldown, setResendCooldown] = useState(0);

  // Cooldown timer for "Reenviar código".
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  return (
    <div className="w-full max-w-md space-y-6">
      <OnboardingStepper currentStep={step.kind === "form" ? 1 : 2} withPlan={withPlan} />

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-2 pb-4 text-center">
          {step.kind === "otp" && (
            <span
              aria-hidden
              className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-brand-ink"
            >
              <MailCheck className="size-5" />
            </span>
          )}
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {step.kind === "form" ? "Crie sua conta" : "Confirme seu e-mail"}
          </CardTitle>
          <CardDescription className="leading-relaxed">
            {step.kind === "form" ? (
              <>Só nome, e-mail e senha. Sem cartão.</>
            ) : (
              <>
                Enviamos um código de 6 dígitos para{" "}
                <span className="font-medium text-foreground">{step.email}</span>.
              </>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step.kind === "form" ? (
            <FormStep
              verifiedRedirectTo={verifiedRedirectTo}
              onSubmitted={(email, name) => {
                setStep({ kind: "otp", email, name });
                setResendCooldown(RESEND_COOLDOWN_SECONDS);
              }}
            />
          ) : (
            <OtpStep
              email={step.email}
              resendCooldown={resendCooldown}
              onResendStarted={() => setResendCooldown(RESEND_COOLDOWN_SECONDS)}
              onVerified={() => router.push(verifiedRedirectTo)}
              onBack={() => setStep({ kind: "form" })}
            />
          )}
        </CardContent>

        {step.kind === "form" && (
          <CardFooter className="justify-center pt-2 text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link
              href={`/login?next=${encodeURIComponent(verifiedRedirectTo)}`}
              className="ml-1 font-medium text-brand-ink hover:underline"
            >
              Entrar
            </Link>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

function FormStep({
  verifiedRedirectTo,
  onSubmitted,
}: {
  verifiedRedirectTo: string;
  onSubmitted: (email: string, name: string) => void;
}) {
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  const [duplicateEmail, setDuplicateEmail] = useState<string | null>(null);

  // Limpa o aviso de duplicata assim que o usuário trocar o e-mail.
  useEffect(() => {
    const sub = form.watch((values, info) => {
      if (info.name === "email" && duplicateEmail && values.email !== duplicateEmail) {
        setDuplicateEmail(null);
      }
    });
    return () => sub.unsubscribe();
  }, [form, duplicateEmail]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (duplicateEmail && values.email === duplicateEmail) {
      // Já marcado como duplicado neste mesmo email — não reenviar.
      return;
    }

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
        description: error.message ?? "Tente novamente em instantes.",
      });
      return;
    }

    onSubmitted(values.email, values.name);
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-5">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input type="text" autoComplete="name" placeholder="Seu nome" {...field} />
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
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  {...field}
                />
              </FormControl>
              {duplicateEmail ? (
                <p className="text-sm font-medium text-destructive">
                  Já existe uma conta com esse email.{" "}
                  <Link
                    href={`/login?email=${encodeURIComponent(duplicateEmail)}&next=${encodeURIComponent(verifiedRedirectTo)}`}
                    className="font-semibold underline underline-offset-2"
                  >
                    Ir para o login
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
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Pelo menos 8 caracteres"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirme a senha</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repita a senha"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          Continuar
          {!form.formState.isSubmitting && <ArrowRight className="ml-2 size-4" aria-hidden />}
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
        form.setError("otp", { message: "Código inválido. Tente novamente." });
        return;
      }
      if (code === "OTP_EXPIRED" || /expired/i.test(message)) {
        toast.error("O código expirou.", {
          description: 'Clique em "Reenviar código" para gerar um novo.',
        });
        form.resetField("otp");
        return;
      }
      if (code === "TOO_MANY_ATTEMPTS" || /attempts/i.test(message)) {
        toast.error("Muitas tentativas.", {
          description: "Reenvie o código e tente novamente.",
        });
        return;
      }
      toast.error("Não foi possível verificar.", {
        description: message || "Tente novamente em instantes.",
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
        toast.error("Não foi possível reenviar o código.", {
          description: error.message ?? "Tente novamente em instantes.",
        });
        return;
      }
      onResendStarted();
      toast.success("Novo código enviado.", {
        description: `Confira o email em ${email}.`,
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
        <FormField
          control={form.control}
          name="otp"
          render={({ field }) => (
            <FormItem className="flex flex-col items-center gap-3">
              <FormLabel className="sr-only">Código de verificação</FormLabel>
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
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={form.formState.isSubmitting || form.watch("otp").length < 6}
        >
          {form.formState.isSubmitting && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          )}
          Verificar
        </Button>
        <div className="flex items-center justify-between text-sm">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 size-4" aria-hidden />
            Voltar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResend}
            disabled={resendCooldown > 0 || resending}
          >
            {resendCooldown > 0
              ? `Reenviar em ${resendCooldown}s`
              : resending
                ? "Enviando…"
                : "Reenviar código"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
