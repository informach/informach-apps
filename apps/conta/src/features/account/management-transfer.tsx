import { AccountActionForm } from "./forms";
import type { accountOverview } from "./service";

type Management = NonNullable<Awaited<ReturnType<typeof accountOverview>>["management"]>;

export function RequestPersonTransfer({
  groupId,
  person,
  members,
  actorId,
}: {
  groupId: string;
  person: { id: string; displayName: string | null; version: number };
  members: Management["members"];
  actorId: string;
}) {
  const recipients = members.filter((member) => member.userId !== actorId);
  if (!recipients.length) return null;
  return (
    <details className="archive-panel person-transfer-form">
      <summary>Transferir o cadastro de {person.displayName}</summary>
      <p>
        Outro adulto poderá assumir o nome, a cor e o avatar compartilhados desta pessoa, após
        aceitar o pedido na própria conta. As permissões e os históricos continuam sendo geridos
        separadamente em cada aplicativo.
      </p>
      <AccountActionForm
        values={{
          operation: "request-person-transfer",
          groupId,
          personId: person.id,
          expectedVersion: person.version,
        }}
        submitLabel="Pedir transferência do cadastro"
      >
        <label>
          Adulto que assumirá o cadastro
          <select name="targetUserId" required>
            {recipients.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input type="checkbox" name="confirmed" required />
          Quero transferir minha responsabilidade pelo cadastro de {person.displayName}.
        </label>
      </AccountActionForm>
    </details>
  );
}

export function PersonTransferRequests({
  transfers,
  actorId,
  groupId,
}: {
  transfers: Management["transfers"];
  actorId: string;
  groupId: string;
}) {
  if (!transfers.length) return null;
  return (
    <section className="sheet person-transfer-requests">
      <h3>Transferências de cadastro</h3>
      {transfers.map((request) => (
        <div className="management-item" key={request.id}>
          <h4>{request.personName}</h4>
          <p>
            {request.sourceName} pediu que {request.targetName} assuma o cadastro compartilhado.
          </p>
          <p className="small-note">
            Válido até{" "}
            {request.expiresAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. As
            permissões dos aplicativos permanecem como estão.
          </p>
          {request.targetUserId === actorId && (
            <AccountActionForm
              values={{
                operation: "resolve-person-transfer",
                groupId,
                requestId: request.id,
                decision: "accept",
              }}
              submitLabel="Aceitar responsabilidade pelo cadastro"
            >
              <label className="check-label">
                <input type="checkbox" name="confirmed" required />
                Aceito assumir o cadastro de {request.personName}.
              </label>
            </AccountActionForm>
          )}
          <AccountActionForm
            values={{
              operation: "resolve-person-transfer",
              requestId: request.id,
              decision: "revoke",
              confirmed: "on",
            }}
            submitLabel={request.targetUserId === actorId ? "Recusar pedido" : "Cancelar pedido"}
            submitVariant="secondary"
          />
        </div>
      ))}
    </section>
  );
}
