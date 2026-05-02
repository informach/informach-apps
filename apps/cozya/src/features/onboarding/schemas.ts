import { z } from "zod";

export const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome (mínimo 2 caracteres)."),
    email: z.string().trim().email("Informe um email válido."),
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

export const loginSchema = z.object({
  email: z.string().trim().email("Informe um email válido."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const otpSchema = z.object({
  email: z.string().email(),
  otp: z
    .string()
    .length(6, "O código tem 6 dígitos.")
    .regex(/^\d{6}$/, "O código deve conter apenas números."),
});

export type OtpInput = z.infer<typeof otpSchema>;

export const proCheckoutSchema = z.object({
  cycle: z.enum(["monthly", "annual"]),
});

export type ProCheckoutInput = z.infer<typeof proCheckoutSchema>;
