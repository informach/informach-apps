"use client";
import { WebSsoEntry } from "@informach/auth/web-sso-entry";
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
      app="bora-treinar"
      environment={ssoEnvironment}
      next={next}
      reauthenticate={reauthenticate}
      buttonClassName="btn primary"
    />
  );
}
