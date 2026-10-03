"use client";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import { flushPendingLabs } from "@/features/labs/runtime/pending-work";
import { useServerAction } from "@/lib/use-server-action";
import { announceContextChange } from "./context-change";
import { safeDestination } from "./policy";

const connectionResult = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.object({ destination: z.string() }) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

async function connect(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = connectionResult.parse(await response.json());
  if (!result.ok) return result.error;
  announceContextChange("/hoje");
  window.location.assign(safeDestination(result.data.destination, "study"));
  return "";
}

export function EnterStudy({
  profiles,
  selected,
  next = "/hoje",
}: {
  profiles: { id: string; nickname: string }[];
  selected?: string;
  next?: string;
}) {
  const [chosen, setChosen] = useState(selected ?? profiles[0]?.id ?? "");
  const [shared, setShared] = useState(false);
  const [remember, setRemember] = useState(false);
  const [pending, start] = useServerAction();
  const [error, setError] = useState("");
  const profile = profiles.find((item) => item.id === chosen);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          setError("");
          try {
            const ids = shared
              ? [chosen, ...profiles.filter((item) => item.id !== chosen).map((item) => item.id)]
              : [chosen];
            setError(
              await connect("/api/estudo/entrar", {
                profileIds: ids,
                label: "Aparelho compartilhado",
                remember,
                next,
              }),
            );
          } catch {
            setError("Não foi possível abrir o estudo. Confira a conexão e tente novamente.");
          }
        });
      }}
      className="space-y-5"
    >
      <div>
        <label className="block text-sm font-semibold" htmlFor="study-profile">
          Quem vai estudar agora?
        </label>
        <select
          id="study-profile"
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
          required
          className="mt-2 min-h-12 w-full rounded-controle border-2 border-sombra bg-creme px-3"
        >
          {profiles.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nickname}
            </option>
          ))}
        </select>
      </div>
      <p className="rounded-card bg-verde-claro p-4 text-sm text-tinta">
        Agora é a vez de {profile?.nickname ?? "estudar"}. Você pode ajudar na leitura; deixe que as
        respostas expressem o pensamento do estudante.
      </p>
      {profiles.length > 1 && (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={shared}
            onChange={(event) => setShared(event.target.checked)}
            className="mt-1 size-5 shrink-0"
          />
          Permitir trocar entre os {profiles.length} estudantes desta família neste aparelho.
        </label>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="mt-1 size-5 shrink-0"
        />
        Manter o acesso de estudo por até 30 dias neste aparelho pessoal. Sem marcar, ele dura até
        12 horas e termina ao encerrar a sessão do navegador.
      </label>
      <p className="text-sm text-tinta-suave">
        Ao começar, o acesso do responsável neste aparelho será encerrado. Para voltar à sua área,
        entre novamente com sua conta.
      </p>
      <BotaoChapa type="submit" disabled={pending || !profile}>
        {pending
          ? "Preparando o estudo…"
          : `Começar estudo com ${profile?.nickname ?? "estudante"}`}
      </BotaoChapa>
      {error && (
        <p role="alert" className="text-sm font-semibold text-coral-solido">
          {error}
        </p>
      )}
    </form>
  );
}

export function ConnectStudy({ next = "/hoje" }: { next?: string }) {
  const [code, setCode] = useState("");
  const [pending, start] = useServerAction();
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          setError("");
          try {
            setError(await connect("/api/estudo/conectar", { code, next }));
          } catch {
            setError("Não foi possível conectar. Confira sua internet e tente novamente.");
          }
        });
      }}
      className="space-y-5"
    >
      <div>
        <label htmlFor="connection-code" className="font-semibold">
          Código de conexão
        </label>
        <input
          id="connection-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCDE-23456"
          minLength={10}
          maxLength={30}
          required
          className="mt-2 block min-h-12 w-full rounded-controle border-2 border-sombra bg-creme px-4 font-mono text-lg uppercase tracking-widest"
        />
      </div>
      <p className="text-sm text-tinta-suave">
        Peça ao responsável para abrir Conta → Aparelhos de estudo e gerar um código. Ele vale por
        dez minutos e só pode ser usado uma vez.
      </p>
      <BotaoChapa type="submit" disabled={pending}>
        {pending ? "Conectando…" : "Entrar para estudar"}
      </BotaoChapa>
      {error && (
        <p role="alert" className="text-sm font-semibold text-coral-solido">
          {error}
        </p>
      )}
    </form>
  );
}

export function ParentSpaceLink() {
  const [error, setError] = useState("");
  const [pending, start] = useServerAction();
  return (
    <span className="inline-flex max-w-44 flex-col items-end">
      <Link
        href="/entrar?next=%2Ffamilia"
        className="inline-flex min-h-11 items-center rounded-controle px-2 text-right text-xs font-semibold text-tinta-suave underline-offset-4 hover:underline sm:text-sm"
        aria-disabled={pending}
        onClick={(event) => {
          event.preventDefault();
          if (pending) return;
          start(async () => {
            if (!(await flushPendingLabs())) {
              setError("Guarde sua investigação antes de abrir a área do responsável.");
              return;
            }
            window.location.assign("/entrar?next=%2Ffamilia");
          });
        }}
      >
        Área do responsável
      </Link>
      {error && (
        <span role="alert" className="text-xs text-coral-solido">
          {error}
        </span>
      )}
    </span>
  );
}
