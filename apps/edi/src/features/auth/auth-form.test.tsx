// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";

// Only the transport-facing SDK and router are replaced. The rendered form,
// its transitions, validation and user actions are the production component.
const endpoints = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  verify: vi.fn(),
  resend: vi.fn(),
  reset: vi.fn(),
  forget: vi.fn(),
}));
vi.mock("../../lib/auth-client", () => ({
  authClient: {
    signIn: { email: endpoints.signIn },
    signUp: { email: endpoints.signUp },
    emailOtp: {
      verifyEmail: endpoints.verify,
      sendVerificationOtp: endpoints.resend,
      resetPassword: endpoints.reset,
    },
    forgetPassword: { emailOtp: endpoints.forget },
  },
}));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
beforeEach(() => {
  vi.resetAllMocks();
  endpoints.resend.mockResolvedValue({ error: null });
});
afterEach(cleanup);
describe("pending email verification recovery", () => {
  it("can resume after a reload and request a code without knowing a password", async () => {
    const original = render(<AuthForm />);
    original.unmount();
    render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cadastro pendente" }));
    expect(screen.queryByLabelText("Senha")).toBeNull();
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "pending@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reenviar código de confirmação" }));
    await screen.findByText(/Se houver uma conta pendente/);
    expect(
      screen.getByRole("button", { name: "Aguarde para reenviar" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(endpoints.resend).toHaveBeenCalledWith({
      email: "pending@example.test",
      type: "email-verification",
    });
  });
  it("keeps invalid or expired codes recoverable and confirms the latest valid code", async () => {
    endpoints.verify
      .mockResolvedValueOnce({ error: { message: "Código inválido" } })
      .mockResolvedValueOnce({ error: { message: "Código expirado" } })
      .mockResolvedValueOnce({ error: null });
    render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cadastro pendente" }));
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "pending@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Código recebido por e-mail"), {
      target: { value: "123456" },
    });
    const submit = () => fireEvent.click(screen.getByRole("button", { name: "Confirmar e-mail" }));
    submit();
    await screen.findByText("Código inválido");
    submit();
    await screen.findByText("Código expirado");
    expect(
      screen
        .getByRole("button", { name: "Reenviar código de confirmação" })
        .hasAttribute("disabled"),
    ).toBe(false);
    submit();
    await screen.findByText("E-mail confirmado. Entre para continuar.");
    expect(screen.getByRole("button", { name: /^Entrar$/ })).toBeTruthy();
  });
  it("routes an unverified sign-in back to verification without accepting a session", async () => {
    endpoints.signIn.mockResolvedValue({ error: { code: "EMAIL_NOT_VERIFIED" } });
    render(<AuthForm />);
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "pending@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /^Entrar$/ }));
    await waitFor(() => expect(screen.getByLabelText("Código recebido por e-mail")).toBeTruthy());
    expect(screen.queryByLabelText("Senha")).toBeNull();
  });
});
describe("return path and first tab", () => {
  it("sends a signed-in visitor to the allowlisted destination it came from", async () => {
    endpoints.signIn.mockResolvedValue({ error: null });
    render(<AuthForm next="/conectar" />);
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "marina@example.test" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /^Entrar$/ }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/conectar"));
    expect(router.refresh).toHaveBeenCalled();
  });
  it("opens on the sign-up tab when the visitor came to subscribe", () => {
    render(<AuthForm initialMode="signup" />);
    expect(screen.getByRole("tab", { name: "Criar conta" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("tab", { name: "Entrar" }).getAttribute("aria-selected")).toBe("false");
  });
});
