"use client";
import { Button } from "@informach/ui/components/button";
import { Input } from "@informach/ui/components/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { catchActionResult } from "@/lib/action-result";
import {
  inviteFamilyAction,
  revokeFamilyAction,
  revokeInvitationAction,
  updateFamilyAccessAction,
} from "../actions";
import type { FamilyOverview } from "../repository";

export function FamilyPanel({ overview, isPro }: { overview: FamilyOverview; isPro: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [profileIds, setProfileIds] = useState(
    overview.member?.profileIds ?? overview.profiles.map((p) => p.id),
  );
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(kind: "invite" | "access" | "revoke" | "revoke-invitation", id?: string) {
    setBusy(true);
    setMessage("");
    const result =
      kind === "invite"
        ? await catchActionResult(() => inviteFamilyAction({ email, profileIds }))
        : kind === "access" && overview.member
          ? await catchActionResult(() =>
              updateFamilyAccessAction({ id: overview.member?.id ?? "", profileIds }),
            )
          : kind === "revoke" && id
            ? await catchActionResult(() => revokeFamilyAction({ id }))
            : await catchActionResult(() => revokeInvitationAction({ id: id ?? "" }));
    setBusy(false);
    if (!result.ok) {
      setMessage(
        result.error.code === "PRO_REQUIRED"
          ? "Assine o Pro para convidar ou ampliar o acesso."
          : "Não foi possível atualizar. Confira o e-mail verificado, as crianças selecionadas e o acesso atual.",
      );
      return;
    }
    if ("url" in result.value && typeof result.value.url === "string") setUrl(result.value.url);
    else {
      if (kind === "revoke" || kind === "revoke-invitation") setUrl("");
      setMessage("Acesso atualizado.");
    }
    router.refresh();
  }
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Quem cuida junto</h2>
      <p className="text-sm text-muted-foreground">
        O Pro inclui dois adultos com contas próprias. Escolha as crianças que o outro responsável
        poderá acompanhar e atualizar. Você pode remover o acesso a qualquer momento.
      </p>
      {overview.member ? (
        <div className="rounded-lg bg-muted/40 p-4">
          <p className="font-medium">{overview.member.name}</p>
          <p className="break-all text-sm text-muted-foreground">{overview.member.email}</p>
        </div>
      ) : null}
      {!overview.profiles.length ? (
        <p className="text-sm">
          Crie o primeiro perfil em{" "}
          <Link href="/familia" className="text-primary-ink underline">
            Crianças
          </Link>
          .
        </p>
      ) : (
        <>
          {!overview.member ? (
            <label htmlFor="family-email" className="grid gap-2 text-sm font-medium">
              E-mail do responsável
              <Input
                type="email"
                id="family-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="responsavel@exemplo.com"
                autoComplete="email"
              />
            </label>
          ) : null}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Crianças compartilhadas</legend>
            {overview.profiles.map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={profileIds.includes(p.id)}
                  onChange={(e) =>
                    setProfileIds(
                      e.target.checked
                        ? [...profileIds, p.id]
                        : profileIds.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.name}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || !profileIds.length || (!overview.member && !isPro)}
              onClick={() => run(overview.member ? "access" : "invite")}
            >
              {overview.member ? "Salvar acesso" : "Criar convite"}
            </Button>
            {overview.member ? (
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => run("revoke", overview.member?.id)}
              >
                Remover acesso deste responsável
              </Button>
            ) : null}
          </div>
        </>
      )}
      {!isPro ? (
        <p className="text-sm text-muted-foreground">
          Após encerrar o plano, o acesso já compartilhado permanece. Novos convites e ampliações
          exigem o Pro.{" "}
          <Link href="/upgrade" className="text-primary-ink underline">
            Ver plano
          </Link>
        </p>
      ) : null}
      {url ? (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="text-sm">
            Envie este link ao responsável. Ele precisa entrar com o e-mail convidado e verificado
            em até 72 horas.
          </p>
          <Input readOnly value={url} aria-label="Link do convite" />
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setMessage("Link copiado.");
              } catch {
                setMessage("Selecione o link acima e copie.");
              }
            }}
          >
            Copiar convite
          </Button>
        </div>
      ) : null}
      {overview.invitations.map((invitation) => (
        <div
          key={invitation.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
        >
          <span className="break-all text-sm">Convite pendente: {invitation.email}</span>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => run("revoke-invitation", invitation.id)}
          >
            Revogar convite
          </Button>
        </div>
      ))}
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
