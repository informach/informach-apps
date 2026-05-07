import { describe, expect, it } from "vitest";
import {
  forgotPasswordSchema,
  loginSchema,
  passwordLoginSchema,
  resetPasswordSchema,
  signupSchema,
} from "./schemas";

describe("onboarding schemas", () => {
  it("normalizes account emails at form boundaries", () => {
    expect(
      signupSchema.parse({
        name: "Maria",
        email: "  MARIA@Example.COM ",
        password: "12345678",
        confirmPassword: "12345678",
      }).email,
    ).toBe("maria@example.com");

    expect(
      passwordLoginSchema.parse({
        email: "  MARIA@Example.COM ",
        password: "12345678",
      }).email,
    ).toBe("maria@example.com");

    expect(loginSchema.parse({ email: "  MARIA@Example.COM " }).email).toBe("maria@example.com");

    expect(forgotPasswordSchema.parse({ email: "  MARIA@Example.COM " }).email).toBe(
      "maria@example.com",
    );

    expect(
      resetPasswordSchema.parse({
        email: "  MARIA@Example.COM ",
        otp: "123456",
        password: "12345678",
        confirmPassword: "12345678",
      }).email,
    ).toBe("maria@example.com");
  });
});
