import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email("Informe um email válido.");

export const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome (mínimo 2 caracteres)."),
    email: emailSchema,
    password: z
      .string()
      .min(8, "A senha deve ter pelo menos 8 caracteres.")
      .max(72, "A senha pode ter no máximo 72 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem.",
  });

export type SignupInput = z.infer<typeof signupSchema>;

export const passwordLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha."),
});

export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;

export const loginSchema = z.object({
  email: emailSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const otpSchema = z.object({
  email: emailSchema,
  otp: z
    .string()
    .length(6, "O código tem 6 dígitos.")
    .regex(/^\d{6}$/, "O código deve conter apenas números."),
});

export type OtpInput = z.infer<typeof otpSchema>;

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    otp: z
      .string()
      .length(6, "O código tem 6 dígitos.")
      .regex(/^\d{6}$/, "O código deve conter apenas números."),
    password: z
      .string()
      .min(8, "A senha deve ter pelo menos 8 caracteres.")
      .max(72, "A senha pode ter no máximo 72 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem.",
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const proCheckoutSchema = z.object({
  cycle: z.enum(["monthly", "annual"]),
});

export type ProCheckoutInput = z.infer<typeof proCheckoutSchema>;
