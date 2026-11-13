"use client";
import { WebSsoEntry } from "@informach/auth/web-sso-entry";
import { concluirEntradaAction } from "@/features/aparelho/actions";
import { ssoEnvironment } from "@/lib/auth-client";

export function AuthForm({
  next,
  reauthenticate = false,
}: {
  next: string;
  reauthenticate?: boolean;
}) {
  return (
    <WebSsoEntry
      app="dia-de-estrela"
      environment={ssoEnvironment}
      next={next}
      reauthenticate={reauthenticate}
      buttonClassName="bp bp-ceu"
      complete={concluirEntradaAction}
    />
  );
}
