"use client";
import { Ban, KeyRound, LogOut, MailCheck, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, FormMessage } from "@/components/form";
import type { ActionResult } from "@/lib/action";
import type { ProductKey } from "@/lib/products";
import {
  banAction,
  changeRoleAction,
  resendVerificationAction,
  revokeSessionsAction,
  unbanAction,
} from "../actions";
import {
  BAN_DURATIONS,
  BAN_REASONS,
  type BanDuration,
  joinNames,
  ROLE_REASONS,
  SESSION_REASONS,
  UNBAN_REASONS,
} from "../service";
import { Choice, ConfirmSheet, NoteField } from "./confirm-sheet";

type Sheet = "verify" | "sessions" | "ban" | "unban" | "role" | null;

export type PersonActionsProps = {
  person: {
    id: string;
    firstName: string;
    emailVerified: boolean;
    banActive: boolean;
    role: string;
    isSelf: boolean;
    isStaffTarget: boolean;
  };
  staff: { role: "owner" | "admin"; firstName: string };
  verificationProducts: Array<{ key: ProductKey; name: string }>;
  /** Falso quando a conta ainda não aparece em produto nenhum e a lista traz todos. */
  verificationProductsDetected: boolean;
  hasEdiComputer: boolean;
  activeSubscriptionNames: string[];
};

const ROLE_OPTIONS = [
  { value: "member", label: "member: pessoa comum, sem acesso ao Bastidores" },
  { value: "admin", label: "admin: suporte, sem Dinheiro e sem mudar papéis" },
  { value: "owner", label: "owner: vê tudo e decide papéis" },
];

export function PersonActions({
  person,
  staff,
  verificationProducts,
  verificationProductsDetected,
  hasEdiComputer,
  activeSubscriptionNames,
}: PersonActionsProps) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [justBanned, setJustBanned] = useState(false);
  const [pending, startTransition] = useTransition();

  const [product, setProduct] = useState<ProductKey | "">(verificationProducts[0]?.key ?? "");
  const [sessionReason, setSessionReason] = useState<string>(SESSION_REASONS[0]);
  const [banReason, setBanReason] = useState<string>(BAN_REASONS[0]);
  const [unbanReason, setUnbanReason] = useState<string>(UNBAN_REASONS[0]);
  const [roleReason, setRoleReason] = useState<string>(ROLE_REASONS[0]);
  const [duration, setDuration] = useState<BanDuration>("7");
  const [note, setNote] = useState("");
  const [role, setRole] = useState(person.role === "member" ? "admin" : "member");

  function open(next: Sheet) {
    setNote("");
    setResult(null);
    setSheet(next);
  }

  function run(work: () => Promise<ActionResult>, after?: (result: ActionResult) => void) {
    startTransition(async () => {
      const outcome = await work();
      setResult(outcome);
      if (outcome.ok) {
        setSheet(null);
        after?.(outcome);
        router.refresh();
      }
    });
  }

  const banBlocked = person.isSelf
    ? "Você não pode banir a própria conta."
    : person.isStaffTarget
      ? "Conta da equipe: um owner muda o papel para member antes de banir."
      : null;

  const otherReason = (choice: string) => choice === "Outro motivo";
  const subscriptionLine = activeSubscriptionNames.length
    ? `As assinaturas não são canceladas. Se for o caso, cancele no Stripe: ${joinNames(activeSubscriptionNames)} ${
        activeSubscriptionNames.length > 1 ? "estão em vigor" : "está em vigor"
      }.`
    : "Nada é cobrado nem cancelado.";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          disabled={person.emailVerified}
          title={person.emailVerified ? "O e-mail já está confirmado" : undefined}
          onClick={() => open("verify")}
        >
          <MailCheck aria-hidden="true" className="size-4" />
          Reenviar código de confirmação
        </Button>
        <Button variant="ghost" onClick={() => open("sessions")}>
          <LogOut aria-hidden="true" className="size-4" />
          Encerrar sessões
        </Button>
        {person.banActive ? (
          <Button variant="ghost" onClick={() => open("unban")}>
            <KeyRound aria-hidden="true" className="size-4" />
            Desbanir conta
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="border-bad text-bad"
            disabled={Boolean(banBlocked)}
            title={banBlocked ?? undefined}
            onClick={() => open("ban")}
          >
            <Ban aria-hidden="true" className="size-4" />
            Banir conta
          </Button>
        )}
        {staff.role === "owner" && !person.isSelf ? (
          <Button variant="ghost" onClick={() => open("role")}>
            <UserCog aria-hidden="true" className="size-4" />
            Mudar papel
          </Button>
        ) : null}
      </div>
      {banBlocked && !person.banActive ? (
        <p className="m-0 text-[13px] text-ink-muted">{banBlocked}</p>
      ) : null}

      {result && sheet === null ? (
        <div className="grid gap-2">
          <FormMessage tone={result.ok ? "ok" : "bad"}>
            {result.ok ? result.message : result.error}
          </FormMessage>
          {justBanned && result.ok ? (
            <Button
              variant="ghost"
              className="justify-self-start"
              disabled={pending}
              onClick={() => {
                setUnbanReason(UNBAN_REASONS[0]);
                open("unban");
              }}
            >
              Desbanir agora
            </Button>
          ) : null}
        </div>
      ) : null}

      <ConfirmSheet
        open={sheet === "verify"}
        title={`Mandar um código novo para ${person.firstName}?`}
        consequences={[
          "O próprio produto manda o código para o e-mail da conta, com o nome dele.",
          "O código vale por 10 minutos e é digitado na tela do produto escolhido.",
          ...(verificationProductsDetected
            ? []
            : [
                "A conta ainda não usou nenhum produto: escolha aquele em que a pessoa se cadastrou. Na dúvida, pergunte pelo direct.",
              ]),
        ]}
        onClose={() => setSheet(null)}
      >
        <Choice
          id="confirmar-produto"
          label="Por qual produto"
          value={product}
          options={verificationProducts.map((item) => ({ value: item.key, label: item.name }))}
          onChange={(value) => setProduct(value as ProductKey)}
        />
        <SheetError result={sheet === "verify" ? result : null} />
        <SheetButtons
          pending={pending}
          confirm="Enviar código"
          onCancel={() => setSheet(null)}
          onConfirm={() =>
            product && run(() => resendVerificationAction({ userId: person.id, app: product }))
          }
        />
      </ConfirmSheet>

      <ConfirmSheet
        open={sheet === "sessions"}
        title={`Encerrar as sessões de ${person.firstName}?`}
        consequences={[
          "A pessoa sai de todos os produtos e precisa entrar de novo.",
          "No Cozya e na Agenda da Turma, a saída pode levar até 5 minutos, por causa do cache do navegador.",
          "Assinaturas, créditos e o que a pessoa criou continuam iguais.",
          ...(hasEdiComputer
            ? ["O computador da Suíte Edi segue conectado: ele usa a própria licença."]
            : []),
        ]}
        onClose={() => setSheet(null)}
      >
        <Choice
          id="sessoes-motivo"
          label="Motivo"
          value={sessionReason}
          options={SESSION_REASONS}
          onChange={setSessionReason}
        />
        <NoteField
          id="sessoes-nota"
          label={
            otherReason(sessionReason)
              ? "Qual o motivo (sem dados pessoais)"
              : "Nota para a equipe (opcional, sem dados pessoais)"
          }
          required={otherReason(sessionReason)}
          value={note}
          onChange={setNote}
        />
        <AuditLine name={staff.firstName} />
        <SheetError result={sheet === "sessions" ? result : null} />
        <SheetButtons
          pending={pending}
          confirm="Encerrar sessões"
          onCancel={() => setSheet(null)}
          onConfirm={() =>
            run(() =>
              revokeSessionsAction({
                userId: person.id,
                reason: sessionReason,
                note: note || undefined,
              }),
            )
          }
        />
      </ConfirmSheet>

      <ConfirmSheet
        open={sheet === "ban"}
        title={`Banir a conta de ${person.firstName}?`}
        consequences={[
          "A pessoa sai de todos os produtos e não entra de novo enquanto o banimento valer. No Cozya e na Agenda da Turma, a saída pode levar até 5 minutos.",
          ...(hasEdiComputer
            ? [
                "Na Suíte Edi, o computador para de abrir as ferramentas na próxima validação da licença, em até 72 horas.",
              ]
            : []),
          subscriptionLine,
          "Nada do que a pessoa criou é apagado. Excluir a conta é outro caminho, pedido pela própria pessoa.",
        ]}
        onClose={() => setSheet(null)}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice
            id="banir-motivo"
            label="Motivo"
            value={banReason}
            options={BAN_REASONS}
            onChange={setBanReason}
          />
          <Choice
            id="banir-prazo"
            label="Até quando"
            value={duration}
            options={Object.entries(BAN_DURATIONS).map(([value, label]) => ({ value, label }))}
            onChange={(value) => setDuration(value as BanDuration)}
          />
        </div>
        <NoteField
          id="banir-nota"
          label={
            otherReason(banReason)
              ? "Qual o motivo (sem dados pessoais)"
              : "Nota para a equipe (opcional, sem dados pessoais)"
          }
          required={otherReason(banReason)}
          value={note}
          onChange={setNote}
        />
        <AuditLine name={staff.firstName} />
        <SheetError result={sheet === "ban" ? result : null} />
        <SheetButtons
          pending={pending}
          danger
          confirm="Banir conta"
          onCancel={() => setSheet(null)}
          onConfirm={() =>
            run(
              () =>
                banAction({
                  userId: person.id,
                  reason: banReason,
                  note: note || undefined,
                  duration,
                }),
              () => setJustBanned(true),
            )
          }
        />
      </ConfirmSheet>

      <ConfirmSheet
        open={sheet === "unban"}
        title={`Desbanir a conta de ${person.firstName}?`}
        consequences={[
          "A pessoa volta a entrar em todos os produtos agora.",
          "Assinaturas e créditos continuam como estavam.",
        ]}
        onClose={() => setSheet(null)}
      >
        <Choice
          id="desbanir-motivo"
          label="Motivo"
          value={unbanReason}
          options={UNBAN_REASONS}
          onChange={setUnbanReason}
        />
        <NoteField
          id="desbanir-nota"
          label={
            otherReason(unbanReason)
              ? "Qual o motivo (sem dados pessoais)"
              : "Nota para a equipe (opcional, sem dados pessoais)"
          }
          required={otherReason(unbanReason)}
          value={note}
          onChange={setNote}
        />
        <AuditLine name={staff.firstName} />
        <SheetError result={sheet === "unban" ? result : null} />
        <SheetButtons
          pending={pending}
          confirm="Desbanir"
          onCancel={() => setSheet(null)}
          onConfirm={() =>
            run(
              () =>
                unbanAction({
                  userId: person.id,
                  reason: unbanReason,
                  note: note || undefined,
                }),
              () => setJustBanned(false),
            )
          }
        />
      </ConfirmSheet>

      <ConfirmSheet
        open={sheet === "role"}
        title={`Mudar o papel de ${person.firstName}?`}
        consequences={[
          `Hoje a conta tem o papel ${person.role}.`,
          role === "member"
            ? "Com member, a conta perde o acesso ao Bastidores no próximo clique."
            : "Com papel de equipe, a pessoa entra no Bastidores depois de criar uma senha, confirmar o e-mail e ativar as duas etapas.",
          "As sessões abertas da conta no Bastidores e na Suíte Edi, no navegador, são encerradas.",
          "Nos produtos nada muda: planos, créditos e dados continuam iguais.",
        ]}
        onClose={() => setSheet(null)}
      >
        <Choice
          id="papel-novo"
          label="Novo papel"
          value={role}
          options={ROLE_OPTIONS}
          onChange={setRole}
        />
        <Choice
          id="papel-motivo"
          label="Motivo"
          value={roleReason}
          options={ROLE_REASONS}
          onChange={setRoleReason}
        />
        <NoteField
          id="papel-nota"
          label={
            otherReason(roleReason)
              ? "Qual o motivo (sem dados pessoais)"
              : "Nota para a equipe (opcional, sem dados pessoais)"
          }
          required={otherReason(roleReason)}
          value={note}
          onChange={setNote}
        />
        <AuditLine name={staff.firstName} />
        <SheetError result={sheet === "role" ? result : null} />
        <SheetButtons
          pending={pending}
          confirm="Mudar papel"
          onCancel={() => setSheet(null)}
          onConfirm={() =>
            run(() =>
              changeRoleAction({
                userId: person.id,
                role: role as "member" | "admin" | "owner",
                reason: roleReason,
                note: note || undefined,
              }),
            )
          }
        />
      </ConfirmSheet>
    </div>
  );
}

/** Toda ação que muda algo pede motivo, e o motivo vai junto para a auditoria. */
function AuditLine({ name }: { name: string }) {
  return (
    <p className="m-0 text-[13px] text-ink-muted">
      Fica registrado na auditoria em nome de {name}, com o motivo.
    </p>
  );
}

function SheetError({ result }: { result: ActionResult | null }) {
  if (!result || result.ok) return null;
  return <FormMessage tone="bad">{result.error}</FormMessage>;
}

function SheetButtons({
  pending,
  confirm,
  danger,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  confirm: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant={danger ? "danger" : "primary"} disabled={pending} onClick={onConfirm}>
        {pending ? "Um instante..." : confirm}
      </Button>
      <Button variant="ghost" disabled={pending} onClick={onCancel}>
        Voltar
      </Button>
    </div>
  );
}
