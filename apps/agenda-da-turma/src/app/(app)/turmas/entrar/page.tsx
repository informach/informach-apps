import Link from "next/link";
import { BackButton } from "@/components/app-shell/back-button";
import { listStudentProfilesForUser } from "@/features/students/service";
import { JoinByLinkPanel } from "@/features/turmas/components/join-by-link-panel";
import { findTurmaForInvite } from "@/features/turmas/service";
import { formatTurmaShort } from "@/features/turmas/utils";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Entrar na turma" };

/**
 * O código da turma vira link.
 *
 * Ele já era a credencial: quem o tem vincula qualquer criança àquela sala.
 * Pedir que alguém o digite à mão no meio de um grupo de mensagens é atrito
 * sem ganho de segurança — mandar o link é o mesmo ato, com menos erro de
 * digitação. A escolha da criança continua sendo um passo explícito aqui.
 */
export default async function JoinTurmaByLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const code = (params.codigo ?? "").trim().toUpperCase();
  const [turma, profiles] = await Promise.all([
    code ? findTurmaForInvite(code) : Promise.resolve(null),
    listStudentProfilesForUser(user.id),
  ]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 pb-28 sm:px-8">
      <div className="flex items-start gap-2">
        <BackButton href="/familia/turmas" label="Voltar às turmas" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Entrar na turma</h1>
          <p className="text-sm text-muted-foreground">
            Alguém da turma compartilhou este convite com você.
          </p>
        </div>
      </div>
      {!turma ? (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Convite não encontrado</h2>
          <p className="text-sm text-muted-foreground">
            {code
              ? "Esse código não corresponde a nenhuma turma. Confira o link com quem enviou."
              : "O link veio sem código de turma. Peça o link completo a quem enviou."}
          </p>
          <Link href="/familia/turmas" className="inline-flex min-h-11 items-center underline">
            Ver minhas turmas
          </Link>
        </section>
      ) : (
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{turma.schoolName}</h2>
            <p className="text-sm text-muted-foreground">
              {formatTurmaShort(turma)} · {turma.year} · {turma.cityName}, {turma.stateUf}
            </p>
          </div>
          {profiles.length ? (
            <JoinByLinkPanel code={code} profiles={profiles} />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Cadastre quem você acompanha antes de entrar na turma. Só o nome basta.
              </p>
              <Link href="/familia" className="inline-flex min-h-11 items-center underline">
                Cadastrar criança
              </Link>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
