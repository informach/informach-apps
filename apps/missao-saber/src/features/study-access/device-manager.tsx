"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import { useServerAction } from "@/lib/use-server-action";
import { createStudyCodeAction, revokeStudyDeviceAction } from "./actions";

type Device = {
  id: string;
  label: string;
  profileIds: string[];
  expiresAt: string;
  connectedAt: string | null;
  revokedAt: string | null;
};
export function DeviceManager({
  profiles,
  devices,
  connectionUrl,
}: {
  profiles: { id: string; nickname: string }[];
  devices: Device[];
  connectionUrl: string;
}) {
  const [selected, setSelected] = useState<string[]>(profiles[0] ? [profiles[0].id] : []);
  const [label, setLabel] = useState("");
  const [remember, setRemember] = useState(false);
  const [issued, setIssued] = useState<{ id: string; code: string; expiresAt: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [reauth, setReauth] = useState(false);
  const [pending, start] = useServerAction();
  const router = useRouter();
  const names = new Map(profiles.map((profile) => [profile.id, profile.nickname]));
  return (
    <section id="aparelhos" className="mb-10 space-y-5">
      <h2 className="font-display text-xl font-semibold">Aparelhos de estudo</h2>
      <p className="text-sm text-tinta-suave">
        Conecte outro aparelho sem compartilhar sua senha. Ele terá acesso apenas ao estudo dos
        perfis escolhidos. Você pode encerrar a conexão a qualquer momento.
      </p>
      {!!profiles.length && (
        <form
          className="space-y-4 rounded-card border border-sombra bg-creme p-5"
          onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              setError("");
              setReauth(false);
              try {
                const result = await createStudyCodeAction({
                  profileIds: selected,
                  label,
                  remember,
                });
                if (result.ok) {
                  setIssued(result.data);
                  router.refresh();
                } else {
                  setError(result.error);
                  setReauth(result.code === "REAUTH" || result.code === "AUTH");
                }
              } catch {
                setError(
                  "Não foi possível confirmar a criação do código. Atualize a lista de aparelhos antes de tentar novamente.",
                );
              }
            });
          }}
        >
          <label className="block text-sm font-semibold">
            Nome do aparelho
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              required
              minLength={2}
              maxLength={60}
              placeholder="Por exemplo, tablet de casa"
              className="mt-2 block min-h-12 w-full rounded-controle border border-input bg-background px-3"
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">
              Quem poderá estudar neste aparelho?
            </legend>
            {profiles.map((profile) => (
              <label key={profile.id} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(profile.id)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, profile.id]
                        : selected.filter((id) => id !== profile.id),
                    )
                  }
                  className="size-5"
                />
                {profile.nickname}
              </label>
            ))}
          </fieldset>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="mt-1 size-5 shrink-0"
            />
            Lembrar por até 30 dias em aparelho pessoal. Sem marcar, o acesso dura até 12 horas e
            termina com a sessão do navegador.
          </label>
          <BotaoChapa type="submit" disabled={pending || !selected.length}>
            {pending ? "Preparando…" : "Gerar código de conexão"}
          </BotaoChapa>
        </form>
      )}
      {issued && (
        <div role="status" className="rounded-card border border-verde-fundo bg-verde-claro p-5">
          <p className="font-semibold">Código de conexão</p>
          <p className="my-3 select-all font-mono text-2xl tracking-widest">{issued.code}</p>
          <p className="text-sm">
            No outro aparelho, abra{" "}
            <a href={connectionUrl} className="break-all font-semibold underline">
              {connectionUrl}
            </a>{" "}
            e digite este código. Ele expira em dez minutos e só pode ser usado uma vez. Para
            cancelar, encerre a conexão abaixo.
          </p>
        </div>
      )}
      {!devices.length && (
        <p className="text-sm text-tinta-suave">Nenhum aparelho conectado ainda.</p>
      )}
      <ul className="space-y-3">
        {devices.map((device) => {
          const active = !device.revokedAt && new Date(device.expiresAt).getTime() > Date.now();
          return (
            <li key={device.id} className="rounded-controle border border-sombra p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold wrap-anywhere">{device.label}</h3>
                  <p className="mt-1 text-sm text-tinta-suave">
                    {device.profileIds
                      .map((id) => names.get(id))
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="mt-1 text-sm">
                    {device.revokedAt
                      ? "Conexão encerrada"
                      : !active
                        ? "Conexão expirada"
                        : device.connectedAt
                          ? "Conectado para estudar"
                          : "Aguardando o código no outro aparelho"}
                  </p>
                </div>
                {active && (
                  <BotaoChapa
                    medida="p"
                    tom="contorno"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        setError("");
                        try {
                          const result = await revokeStudyDeviceAction(device.id);
                          if (result.ok) {
                            if (issued?.id === device.id) setIssued(null);
                            router.refresh();
                          } else {
                            setError(result.error);
                            setReauth(result.code === "REAUTH" || result.code === "AUTH");
                          }
                        } catch {
                          setError(
                            "Não foi possível confirmar o encerramento. Atualize a lista de aparelhos e tente novamente.",
                          );
                        }
                      })
                    }
                  >
                    Encerrar conexão de {device.label}
                  </BotaoChapa>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm font-semibold text-coral-solido">
          {error}
        </p>
      )}
      {reauth && (
        <Link
          href="/entrar?next=%2Ffamilia%2Fconta%23aparelhos"
          className="inline-flex min-h-11 items-center font-semibold underline"
        >
          Confirmar acesso do responsável
        </Link>
      )}
    </section>
  );
}
