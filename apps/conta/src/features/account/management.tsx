import { getCollectionApps } from "@informach/config/collections";
import { AccountActionForm, AssociationForm } from "./forms";
import { PersonTransferRequests, RequestPersonTransfer } from "./management-transfer";
import type { accountOverview } from "./service";

type Overview = Awaited<ReturnType<typeof accountOverview>>;
const capability = {
  read: "Ver",
  write: "Editar",
  manage: "Gerenciar acessos",
  use_ai: "Usar créditos de IA",
};
const actionOrder = ["read", "write", "use_ai", "manage"] as const;
const appName = (app: string) =>
  getCollectionApps("compasso").find((item) => item.slug === app)?.name ?? app;

export function ReceiveInvitation() {
  return (
    <details className="sheet management-panel">
      <summary>Recebi um convite</summary>
      <p>
        Entre com o e-mail que recebeu o convite. Participar da família não libera automaticamente
        os dados de outras pessoas.
      </p>
      <AccountActionForm
        values={{ operation: "accept-invitation" }}
        submitLabel="Entrar na família"
      >
        <label>
          Código recebido
          <input
            name="token"
            required
            minLength={43}
            maxLength={43}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </AccountActionForm>
    </details>
  );
}

export function FamilyManagement({ data, actorId }: { data: Overview; actorId: string }) {
  if (!data.group || !data.management) return null;
  const { group, management } = data;
  return (
    <div className="management-stack">
      <PersonTransferRequests
        transfers={management.transfers}
        actorId={actorId}
        groupId={group.id}
      />
      <details className="sheet management-panel">
        <summary>Pessoas, perfis e permissões</summary>
        <p>
          Uma pessoa pode ter um histórico em cada aplicativo. Escolha separadamente quem pode ver,
          editar, compartilhar ou usar IA.
        </p>
        {management.people.map((person) => (
          <details className="management-item" key={person.id}>
            <summary>Gerenciar {person.displayName}</summary>
            {person.canManageIdentity && !person.accountId && (
              <AccountActionForm
                values={{
                  operation: "update-person",
                  groupId: group.id,
                  personId: person.id,
                  expectedVersion: person.version,
                  avatar: person.avatar,
                }}
                submitLabel="Salvar pessoa"
              >
                <label>
                  Nome da pessoa
                  <input
                    name="displayName"
                    defaultValue={person.displayName}
                    required
                    maxLength={80}
                  />
                </label>
                <label>
                  Cor do perfil
                  <input name="color" type="color" defaultValue={person.color} required />
                </label>
                <p className="small-note">
                  Nome e cor são compartilhados entre os aplicativos desta pessoa.
                </p>
              </AccountActionForm>
            )}
            {person.canManageIdentity && person.kind === "unclassified" && (
              <AccountActionForm
                values={{
                  operation: "classify-person",
                  groupId: group.id,
                  personId: person.id,
                  expectedVersion: person.version,
                }}
                submitLabel="Confirmar tipo de perfil"
              >
                <label>
                  Quem usa este perfil?
                  <select name="kind">
                    <option value="dependent">Criança ou adolescente</option>
                    <option value="adult">Adulto</option>
                  </select>
                </label>
              </AccountActionForm>
            )}
            {management.profiles
              .filter((profile) => profile.personId === person.id)
              .map((profile) => (
                <section className="profile-access" key={profile.id}>
                  <h4>{appName(profile.app)}</h4>
                  {profile.actions.includes("manage") ? (
                    <>
                      <ul className="access-list">
                        {management.members.map((member) => {
                          const granted = profile.grants
                            .filter((grant) => grant.userId === member.userId)
                            .map((grant) => capability[grant.action]);
                          return granted.length ? (
                            <li key={member.userId}>
                              <strong>{member.name}</strong>
                              <span>{granted.join(" · ")}</span>
                            </li>
                          ) : null;
                        })}
                      </ul>
                      {management.members.some((member) => member.userId !== actorId) && (
                        <AccountActionForm
                          values={{
                            operation: "change-access",
                            groupId: group.id,
                            personId: person.id,
                            app: profile.app,
                          }}
                          submitLabel="Atualizar permissão"
                        >
                          <label>
                            Adulto
                            <select name="userId">
                              {management.members
                                .filter((member) => member.userId !== actorId)
                                .map((member) => (
                                  <option key={member.userId} value={member.userId}>
                                    {member.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label>
                            Permissão
                            <select
                              name="action"
                              defaultValue={
                                profile.actions.includes("read") ? "read" : profile.actions[0]
                              }
                            >
                              {actionOrder
                                .filter((action) => profile.actions.includes(action))
                                .map((action) => (
                                  <option key={action} value={action}>
                                    {capability[action]}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label>
                            Alteração
                            <select name="change">
                              <option value="grant">Permitir</option>
                              <option value="revoke">Retirar permissão</option>
                            </select>
                          </label>
                          <p className="small-note">
                            Cada permissão é independente. Gerenciar acessos permite compartilhar as
                            permissões que o adulto já possui.
                          </p>
                        </AccountActionForm>
                      )}
                      {person.canManageIdentity && !person.accountId && (
                        <details className="association-panel">
                          <summary>Associar a uma pessoa já cadastrada</summary>
                          <AssociationForm
                            groupId={group.id}
                            source={person}
                            app={profile.app}
                            appName={appName(profile.app)}
                            targets={management.people.filter(
                              (target) =>
                                target.canManageIdentity &&
                                target.id !== person.id &&
                                !management.profiles.some(
                                  (existing) =>
                                    existing.personId === target.id && existing.app === profile.app,
                                ),
                            )}
                          />
                        </details>
                      )}
                    </>
                  ) : (
                    <p className="small-note">
                      {profile.actions.length
                        ? `Seu acesso: ${profile.actions.map((action) => capability[action]).join(" · ")}.`
                        : "A gestão de acesso a este histórico pertence ao responsável no aplicativo."}
                    </p>
                  )}
                </section>
              ))}
            {!management.profiles.some((profile) => profile.personId === person.id) && (
              <p className="small-note">
                Nenhum perfil de aplicativo disponível para você. Ao começar a usar um app, escolha
                esta pessoa para manter o cadastro compartilhado.
              </p>
            )}
            {person.canManageIdentity && !person.accountId && (
              <RequestPersonTransfer
                groupId={group.id}
                person={person}
                members={management.members}
                actorId={actorId}
              />
            )}
            {person.canManageIdentity && !person.accountId && (
              <details className="archive-panel">
                <summary>Arquivar nesta família</summary>
                <AccountActionForm
                  values={{ operation: "archive-person", groupId: group.id, personId: person.id }}
                  submitLabel="Arquivar pessoa"
                >
                  <p>
                    O acesso aos históricos fica suspenso nesta família. Os dados são preservados e
                    a pessoa poderá ser restaurada, respeitando as vagas disponíveis.
                  </p>
                  <label className="check-label">
                    <input name="confirmed" type="checkbox" required />
                    Quero arquivar {person.displayName} nesta família.
                  </label>
                </AccountActionForm>
              </details>
            )}
          </details>
        ))}
        {management.archivedPeople.length > 0 && (
          <details className="management-item">
            <summary>Pessoas arquivadas</summary>
            {management.archivedPeople.map((person) => (
              <div key={person.id}>
                <AccountActionForm
                  values={{ operation: "restore-person", groupId: group.id, personId: person.id }}
                  submitLabel={`Restaurar ${person.displayName}`}
                >
                  <label className="check-label">
                    <input name="confirmed" type="checkbox" required />
                    Quero restaurar {person.displayName} e os acessos anteriormente concedidos aos
                    seus perfis nesta família.
                  </label>
                </AccountActionForm>
                <RequestPersonTransfer
                  groupId={group.id}
                  person={person}
                  members={management.members}
                  actorId={actorId}
                />
              </div>
            ))}
          </details>
        )}
      </details>
      {group.role === "administrator" && (
        <details className="sheet management-panel">
          <summary>Adultos e convites</summary>
          <p>
            Cada adulto entra com a própria conta. O convite dura 48 horas e deve ser compartilhado
            por você com o destinatário.
          </p>
          <AccountActionForm
            values={{ operation: "invite", groupId: group.id }}
            submitLabel="Criar convite"
          >
            <label>
              E-mail do adulto
              <input type="email" name="email" required maxLength={254} autoComplete="off" />
            </label>
          </AccountActionForm>
          {management.invitations.map((invitation) => (
            <div className="management-item" key={invitation.id}>
              <p>
                Convite pendente: <strong>{invitation.email}</strong>
              </p>
              <AccountActionForm
                values={{
                  operation: "revoke-invitation",
                  groupId: group.id,
                  invitationId: invitation.id,
                }}
                submitLabel="Revogar convite"
              />
            </div>
          ))}
          {management.members
            .filter((member) => member.userId !== actorId)
            .map((member) => (
              <details className="management-item" key={member.userId}>
                <summary>{member.name}</summary>
                <AccountActionForm
                  values={{
                    operation: "transfer-administration",
                    groupId: group.id,
                    userId: member.userId,
                  }}
                  submitLabel="Transferir administração"
                >
                  <p>
                    Você passará a integrante. A assinatura e as permissões sobre pessoas continuam
                    com seus titulares atuais.
                  </p>
                  <label className="check-label">
                    <input type="checkbox" name="confirmed" required />
                    Quero que {member.name} administre esta família.
                  </label>
                </AccountActionForm>
                <AccountActionForm
                  values={{ operation: "revoke-member", groupId: group.id, userId: member.userId }}
                  submitLabel="Remover adulto"
                >
                  <p>
                    Os acessos deste adulto serão revogados. A assinatura não é cancelada por esta
                    ação.
                  </p>
                  <label className="check-label">
                    <input type="checkbox" name="confirmed" required />
                    Quero remover {member.name} da família.
                  </label>
                </AccountActionForm>
              </details>
            ))}
        </details>
      )}
    </div>
  );
}
