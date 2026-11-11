"use client";
import { type ReactNode, useActionState, useState } from "react";
import { type FormState, familyAction } from "./actions";

export function FamilyForm({
  operation,
  groupId,
}: {
  operation: "create-family" | "add-person" | "start-trial";
  groupId?: string;
}) {
  const [state, action, pending] = useActionState(familyAction, { ok: false, message: "" });
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="operation" value={operation} />
      {groupId && <input type="hidden" name="groupId" value={groupId} />}
      {operation === "create-family" && (
        <label>
          Como você chama sua família?
          <input
            name="name"
            required
            maxLength={80}
            placeholder="Família Oliveira"
            autoComplete="off"
          />
        </label>
      )}
      {operation === "add-person" && (
        <>
          <label>
            Nome
            <input name="displayName" required maxLength={80} autoComplete="off" />
          </label>
          <label>
            Perfil
            <select name="kind" defaultValue="dependent">
              <option value="dependent">Criança ou adolescente</option>
              <option value="adult">Adulto sem login</option>
            </select>
          </label>
        </>
      )}
      <button type="submit" disabled={pending}>
        {pending
          ? "Salvando…"
          : operation === "start-trial"
            ? "Experimentar 14 dias sem cartão"
            : operation === "add-person"
              ? "Adicionar pessoa"
              : "Criar minha família"}
      </button>
      <p role="status" className={state.ok ? "success" : "form-message"}>
        {state.message}
      </p>
    </form>
  );
}

export function AccountActionForm({
  values,
  submitLabel,
  submitVariant = "primary",
  children,
}: {
  values: Record<string, string | number>;
  submitLabel: string;
  submitVariant?: "primary" | "secondary";
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(familyAction, {
    ok: false,
    message: "",
  });
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="form-stack">
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <button
        type="submit"
        disabled={pending}
        className={submitVariant === "secondary" ? "secondary" : undefined}
      >
        {pending ? "Salvando…" : submitLabel}
      </button>
      <p role="status" className={state.ok ? "success" : "form-message"}>
        {state.message}
      </p>
      {state.reauthenticate && (
        <a
          href={`/entrar?next=${encodeURIComponent(values.groupId ? `/?familia=${values.groupId}` : "/")}`}
        >
          Confirmar minha entrada ↗
        </a>
      )}
      {state.invitation && (
        <div className="invitation-code">
          <label>
            Código do convite
            <input
              readOnly
              value={state.invitation.token}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.invitation?.token ?? "");
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Código copiado" : "Copiar código"}
          </button>
          <p className="small-note">
            Válido até{" "}
            {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
              new Date(state.invitation.expiresAt),
            )}
            . O adulto deve entrar na própria conta e escolher “Recebi um convite”. O código só
            funciona com o e-mail convidado.
          </p>
        </div>
      )}
    </form>
  );
}

export function AssociationForm({
  groupId,
  source,
  app,
  appName,
  targets,
}: {
  groupId: string;
  source: { id: string; displayName: string; version: number };
  app: string;
  appName: string;
  targets: { id: string; displayName: string; version: number }[];
}) {
  const [targetId, setTargetId] = useState("");
  const target = targets.find((person) => person.id === targetId);
  if (!targets.length)
    return <p className="small-note">Não há outra pessoa elegível para esta associação.</p>;
  return (
    <AccountActionForm
      submitLabel="Associar este perfil"
      values={{
        operation: "associate-profile",
        groupId,
        sourcePersonId: source.id,
        personId: target?.id ?? "",
        expectedSourceVersion: source.version,
        expectedTargetVersion: target?.version ?? 0,
        app,
      }}
    >
      <label>
        Este perfil pertence a quem?
        <select required value={targetId} onChange={(event) => setTargetId(event.target.value)}>
          <option value="">Escolha a pessoa</option>
          {targets.map((person) => (
            <option key={person.id} value={person.id}>
              {person.displayName}
            </option>
          ))}
        </select>
      </label>
      <p>
        O histórico de {source.displayName} em {appName} ficará vinculado a{" "}
        {target?.displayName ?? "uma pessoa escolhida por você"}. Revise os acessos compartilhados
        antes de confirmar. Históricos do mesmo aplicativo não são combinados.
      </p>
      <label className="check-label">
        <input name="confirmed" type="checkbox" required />
        Confirmo que os dois perfis são da mesma pessoa.
      </label>
    </AccountActionForm>
  );
}
