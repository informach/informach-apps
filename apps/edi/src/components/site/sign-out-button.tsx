"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "../../lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <button
        type="button"
        className="button button--quiet button--sm"
        disabled={!hydrated || busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            const result = await authClient.signOut();
            if (result.error) {
              setFailed(true);
              return;
            }
            router.push("/");
            router.refresh();
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        Sair
      </button>
      <span role="status" className={failed ? "small form-message--error" : "visually-hidden"}>
        {failed ? "Não foi possível sair agora. Tente novamente." : ""}
      </span>
    </>
  );
}
