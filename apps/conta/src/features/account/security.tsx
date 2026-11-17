"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AccountDetails({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const result = await authClient.updateUser({ name: value.trim() });
      if (!result.error) router.refresh();
      setMessage(
        result.error
          ? "Não conseguimos salvar. Tente novamente."
          : "Seu nome foi atualizado em sua conta.",
      );
    } catch {
      setMessage("Não conseguimos conectar agora.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={save} className="form-stack">
      <label>
        Seu nome
        <input
          required
          maxLength={80}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="name"
        />
      </label>
      <label>
        E-mail
        <input type="email" value={email} readOnly />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Salvar nome"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function PasswordForm() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    try {
      const result = await authClient.changePassword({
        currentPassword: String(data.get("currentPassword") ?? ""),
        newPassword: String(data.get("newPassword") ?? ""),
        revokeOtherSessions: true,
      });
      if (result.error) {
        setMessage("Confira sua senha atual e tente novamente.");
        return;
      }
      form.reset();
      setMessage("Senha atualizada. As outras entradas e seus apps vinculados foram encerrados.");
    } catch {
      setMessage("Não conseguimos conectar agora.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={save} className="form-stack">
      <label>
        Senha atual
        <input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </label>
      <label>
        Nova senha
        <input
          type="password"
          name="newPassword"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Atualizando…" : "Atualizar senha"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Não foi possível sair. Tente novamente.");
        return;
      }
      window.location.assign("/entrar");
    } catch {
      setError("Não foi possível conectar agora.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <button className="text-button" type="button" onClick={signOut} disabled={pending}>
        {pending ? "Saindo…" : "Sair deste navegador"}
      </button>
      <p role="status">{error}</p>
    </div>
  );
}
