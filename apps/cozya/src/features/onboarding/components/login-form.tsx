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
import { emailOtp, signIn } from "@/lib/auth-client";
import { type LoginInput, loginSchema, type OtpInput, otpSchema } from "../schemas";

type Step = { kind: "email" } | { kind: "otp"; email: string };

const RESEND_COOLDOWN_SECONDS = 60;

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  return (
    <div className="w-full max-w-md">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-2 pb-4 text-center">
          {step.kind === "otp" && (
            <span
              aria-hidden
              className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <MailCheck className="size-5" />
            </span>
          )}
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {step.kind === "email" ? "Entre no Cozya" : "Confirme o acesso"}
          </CardTitle>
          <CardDescription className="leading-relaxed">
            {step.kind === "email" ? (
              <>Digite seu email para receber um código de acesso.</>
            ) : (
              <>
                Enviamos um código de 6 dígitos para{" "}
                <span className="font-medium text-foreground">{step.email}</span>.
              </>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step.kind === "email" ? (
            <EmailStep
              onSubmitted={(email) => {
                setStep({ kind: "otp", email });
                setResendCooldown(RESEND_COOLDOWN_SECONDS);
              }}
            />
          ) : (
            <OtpStep
              email={step.email}
              resendCooldown={resendCooldown}
              onResendStarted={() => setResendCooldown(RESEND_COOLDOWN_SECONDS)}
              onVerified={() => router.push(nextPath)}
              onBack={() => setStep({ kind: "email" })}
            />
          )}
        </CardContent>

        {step.kind === "email" && (
          <CardFooter className="justify-center pt-2 text-sm text-muted-foreground">
            Ainda não tem conta?{" "}
            <Link href="/signup" className="ml-1 font-medium text-primary hover:underline">
              Criar conta
            </Link>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

function EmailStep({ onSubmitted }: { onSubmitted: (email: string) => void }) {
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const email = values.email.trim().toLowerCase();
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
      toast.error("Não foi possível entrar.", {
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
        <FormField
          control={form.control}
          name="otp"
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
          Entrar
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
                ? "Enviando..."
                : "Reenviar código"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
