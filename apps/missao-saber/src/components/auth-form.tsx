"use client";
import { WebSsoEntry } from "@informach/auth/web-sso-entry";
import { completeParentSignInAction } from "@/features/study-access/actions";
import { announceContextChange } from "@/features/study-access/context-change";
import { ssoEnvironment } from "@/lib/auth-client";

async function completeEntry(next: string) {
  const result = await completeParentSignInAction(next);
  if (result.ok) announceContextChange("/familia");
  return result;
}

export function AuthForm({
  next,
  reauthenticate = false,
}: {
  next: string;
  reauthenticate?: boolean;
}) {
  return (
    <WebSsoEntry
      app="missao-saber"
      environment={ssoEnvironment}
      next={next}
      reauthenticate={reauthenticate}
      buttonClassName="min-h-12 rounded-controle bg-verde-solido px-5 py-3 font-semibold text-sobre-verde"
      complete={completeEntry}
    />
  );
}
