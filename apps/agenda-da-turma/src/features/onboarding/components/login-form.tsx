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
import { Tabs, TabsList, TabsTrigger } from "@informach/ui/components/tabs";
import { ArrowLeft, ArrowRight, KeyRound, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type Control, type FieldValues, type Path, useForm } from "react-hook-form";
import { emailOtp, forgetPassword, signIn } from "@/lib/auth-client";
import {
  type ForgotPasswordInput,
  forgotPasswordSchema,
  type LoginInput,
  loginSchema,
  type OtpInput,
  otpSchema,
  type PasswordLoginInput,
  passwordLoginSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
} from "../schemas";

type Step =
  | { kind: "auth" }
  | { kind: "otp"; email: string }
  | { kind: "reset-email" }
  | { kind: "reset-otp"; email: string };

type LoginMode = "password" | "otp";

const RESEND_COOLDOWN_SECONDS = 60;

export function LoginForm({ nextPath, defaultEmail }: { nextPath: string; defaultEmail?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "auth" });
  const [mode, setMode] = useState<LoginMode>("password");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const title =
    step.kind === "auth"
      ? "Entre na Agenda da Turma"
      : step.kind === "reset-email"
        ? "Recupere sua senha"
        : step.kind === "reset-otp"
          ? "Crie uma nova senha"
          : "Confirme o acesso";

  const description =
    step.kind === "auth"
      ? "Use sua senha ou entre com um código enviado por email."
      : step.kind === "reset-email"
        ? "Enviaremos um código de verificação para seu email."
        : step.kind === "reset-otp"
          ? `Digite o código enviado para ${step.email}.`
          : `Enviamos um código de 6 dígitos para ${step.email}.`;

  return (
    <div className="w-full max-w-md">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-2 pb-4 text-center">
          {step.kind !== "auth" && (
            <span
              aria-hidden
              className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary-ink"
            >
              {step.kind === "reset-email" ? (
                <KeyRound className="size-5" />
              ) : (
                <MailCheck className="size-5" />
              )}
            </span>
          )}
          <CardTitle className="text-2xl font-semibold tracking-tight">{title}</CardTitle>
          <CardDescription className="leading-relaxed">{description}</CardDescription>
        </CardHeader>

        <CardContent>
          {step.kind === "auth" ? (
            <div className="space-y-5">
              <Tabs value={mode} onValueChange={(value) => setMode(value as LoginMode)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="password">Senha</TabsTrigger>
                  <TabsTrigger value="otp">Código</TabsTrigger>
                </TabsList>
              </Tabs>
              {mode === "password" ? (
                <PasswordStep
                  defaultEmail={defaultEmail}
                  onForgotPassword={() => setStep({ kind: "reset-email" })}
                  onVerified={() => router.push(nextPath)}
                />
              ) : (
                <EmailOtpRequestStep
                  defaultEmail={defaultEmail}
                  onSubmitted={(email) => {
                    setStep({ kind: "otp", email });
                    setResendCooldown(RESEND_COOLDOWN_SECONDS);
                  }}
                />
              )}
            </div>
          ) : step.kind === "reset-email" ? (
            <ResetEmailStep
              onSubmitted={(email) => {
                setStep({ kind: "reset-otp", email });
                setResendCooldown(RESEND_COOLDOWN_SECONDS);
              }}
              onBack={() => setStep({ kind: "auth" })}
            />
          ) : step.kind === "reset-otp" ? (
            <ResetPasswordStep
              email={step.email}
              resendCooldown={resendCooldown}
              onBack={() => setStep({ kind: "reset-email" })}
              onResendStarted={() => setResendCooldown(RESEND_COOLDOWN_SECONDS)}
              onVerified={() => {
                toast.success("Senha atualizada.");
                setMode("password");
                setStep({ kind: "auth" });
              }}
            />
          ) : (
            <OtpStep
              email={step.email}
              resendCooldown={resendCooldown}
              onResendStarted={() => setResendCooldown(RESEND_COOLDOWN_SECONDS)}
              onVerified={() => router.push(nextPath)}
              onBack={() => setStep({ kind: "auth" })}
            />
          )}
        </CardContent>

        {step.kind === "auth" && (
          <CardFooter className="justify-center pt-2 text-sm text-muted-foreground">
            Ainda não tem conta?{" "}
            <Link
              href={`/signup?next=${encodeURIComponent(nextPath)}`}
              className="ml-1 font-medium text-primary-ink hover:underline"
            >
              Criar conta
            </Link>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

function PasswordStep({
  defaultEmail,
  onForgotPassword,
  onVerified,
}: {
  defaultEmail?: string;
  onForgotPassword: () => void;
  onVerified: () => void;
}) {
  const form = useForm<PasswordLoginInput>({
    resolver: zodResolver(passwordLoginSchema),
    defaultValues: { email: defaultEmail ?? "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await signIn.email({
      email: values.email,
      password: values.password,
    });

    if (error) {
      toast.error("Não foi possível entrar.", {
        description: error.message ?? "Verifique email e senha e tente novamente.",
      });
      return;
    }

    onVerified();
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-5">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-3">
                <FormLabel>Senha</FormLabel>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0 py-0 text-xs"
                  onClick={onForgotPassword}
                >
                  Esqueci minha senha
                </Button>
              </div>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          Entrar
          {!form.formState.isSubmitting && <ArrowRight className="ml-2 size-4" aria-hidden />}
        </Button>
      </form>
    </Form>
  );
}

function EmailOtpRequestStep({
  defaultEmail,
  onSubmitted,
}: {
  defaultEmail?: string;
  onSubmitted: (email: string) => void;
}) {
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: defaultEmail ?? "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const email = values.email;
    const { error } = await emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });

    if (error) {
      toast.error("Não foi possível enviar o código.", {
        description: error.message ?? "Tente novamente em instantes.",
      });
      return;
    }

    onSubmitted(email);
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-5">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
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
          Enviar código
          {!form.formState.isSubmitting && <ArrowRight className="ml-2 size-4" aria-hidden />}
        </Button>
      </form>
    </Form>
  );
}

function ResetEmailStep({
  onSubmitted,
  onBack,
}: {
  onSubmitted: (email: string) => void;
  onBack: () => void;
}) {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const email = values.email;
    const { error } = await forgetPassword.emailOtp({ email });

    if (error) {
      toast.error("Não foi possível enviar o código.", {
        description: error.message ?? "Tente novamente em instantes.",
      });
      return;
    }

    onSubmitted(email);
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-5">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          )}
          Enviar código
        </Button>
        <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onBack}>
          <ArrowLeft className="mr-1 size-4" aria-hidden />
          Voltar para login
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
    const { error } = await signIn.emailOtp({
      email: values.email,
      otp: values.otp,
    });

    if (error) {
      handleOtpError(error, form.setError);
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
        type: "sign-in",
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
        <OtpField control={form.control} disabled={form.formState.isSubmitting} />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={form.formState.isSubmitting || form.watch("otp").length < 6}
        >
          {form.formState.isSubmitting && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          )}
          Entrar
        </Button>
        <OtpActions
          resendCooldown={resendCooldown}
          resending={resending}
          onBack={onBack}
          onResend={handleResend}
        />
      </form>
    </Form>
  );
}

function ResetPasswordStep({
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
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email, otp: "", password: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await emailOtp.resetPassword({
      email: values.email,
      otp: values.otp,
      password: values.password,
    });

    if (error) {
      handleOtpError(error, form.setError);
      return;
    }

    onVerified();
  });

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    try {
      const { error } = await forgetPassword.emailOtp({ email });
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
        <OtpField control={form.control} disabled={form.formState.isSubmitting} />
        <div className="space-y-5">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nova senha</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
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
                <FormLabel>Confirmar senha</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={form.formState.isSubmitting || form.watch("otp").length < 6}
        >
          {form.formState.isSubmitting && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          )}
          Atualizar senha
        </Button>
        <OtpActions
          resendCooldown={resendCooldown}
          resending={resending}
          onBack={onBack}
          onResend={handleResend}
        />
      </form>
    </Form>
  );
}

function OtpField<TFieldValues extends FieldValues & { otp: string }>({
  control,
  disabled,
}: {
  control: Control<TFieldValues>;
  disabled?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={"otp" as Path<TFieldValues>}
      render={({ field }) => (
        <FormItem className="flex flex-col items-center gap-3">
          <FormLabel className="sr-only">Código de acesso</FormLabel>
          <FormControl>
            <InputOTP
              maxLength={6}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              autoFocus
              disabled={disabled}
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
  );
}

function OtpActions({
  resendCooldown,
  resending,
  onBack,
  onResend,
}: {
  resendCooldown: number;
  resending: boolean;
  onBack: () => void;
  onResend: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <Button type="button" variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1 size-4" aria-hidden />
        Voltar
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onResend}
        disabled={resendCooldown > 0 || resending}
      >
        {resendCooldown > 0
          ? `Reenviar em ${resendCooldown}s`
          : resending
            ? "Enviando..."
            : "Reenviar código"}
      </Button>
    </div>
  );
}

function handleOtpError(
  error: { code?: string; message?: string },
  setError: (name: "otp", error: { message: string }) => void,
) {
  const code = error.code ?? "";
  const message = error.message ?? "";
  if (code === "INVALID_OTP" || /invalid/i.test(message)) {
    setError("otp", { message: "Código inválido. Tente novamente." });
    return;
  }
  if (code === "OTP_EXPIRED" || /expired/i.test(message)) {
    toast.error("O código expirou.", {
      description: 'Clique em "Reenviar código" para gerar um novo.',
    });
    return;
  }
  if (code === "TOO_MANY_ATTEMPTS" || /attempts/i.test(message)) {
    toast.error("Muitas tentativas.", {
      description: "Reenvie o código e tente novamente.",
    });
    return;
  }
  toast.error("Não foi possível concluir a confirmação.", {
    description: message || "Tente novamente em instantes.",
  });
}
