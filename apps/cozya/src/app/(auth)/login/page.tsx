import { webAppDestination, webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { WebSsoEntry } from "@informach/auth/web-sso-entry";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserServer } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata = { title: "Entrar" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reautenticar?: string }>;
}) {
  const params = await searchParams;
  const next = webAppDestination(params.next, "/hoje");
  const reauthenticate = params.reautenticar === "1";
  if ((await getCurrentUserServer()) && !reauthenticate) redirect(next as Route);
  return (
    <section className="mx-auto max-w-md rounded-2xl border bg-card p-6 shadow-sm">
      <h1 className="mb-4 text-2xl font-semibold">Sua conta compartilhada</h1>
      <WebSsoEntry
        app="cozya"
        environment={webSsoEnvironment("cozya", env.NEXT_PUBLIC_APP_URL)}
        next={next}
        reauthenticate={reauthenticate}
        buttonClassName="mt-4 min-h-11 w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground"
      />
    </section>
  );
}
