"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { forgetProfileAction } from "@/features/learning/actions";
import { authClient } from "@/lib/auth-client";

export function SignOut() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="rounded-md font-semibold text-tinta-suave underline underline-offset-4 hover:text-tinta"
        onClick={() =>
          start(async () => {
            setError("");
            try {
              const result = await authClient.signOut();
              if (result.error) {
                setError("Não foi possível sair. Tente novamente.");
                return;
              }
              await forgetProfileAction();
              router.push("/");
              router.refresh();
            } catch {
              setError("Não foi possível sair. Tente novamente.");
            }
          })
        }
      >
        {pending ? "Saindo…" : "Sair da conta"}
      </button>
      {error && (
        <span role="alert" className="font-semibold text-coral-fundo">
          {error}
        </span>
      )}
    </span>
  );
}
