import Link from "next/link";
import { redirect } from "next/navigation";
import { UpgradeOffer } from "@/features/billing/components/upgrade-offer";
import {
  PRO_ADULTS,
  PRO_READS_PER_MONTH,
  parseCycleQueryParam,
} from "@/features/billing/plans-content";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { getAddEntitlement } from "@/features/notices/trial";
import { PRO_STUDENT_PROFILE_LIMIT } from "@/features/students/limits";
import { listStudentProfilesForUser } from "@/features/students/service";
import { redirectIfUnauthenticated } from "@/lib/auth";

export const metadata = {
  title: "Pro",
};

/**
 * Por que a pessoa chegou aqui. Cada porta do Pro manda o seu motivo, e a
 * página abre respondendo a ele em vez de mostrar uma tabela de planos.
 */
const REASONS = {
  imprimir: {
    title: "A semana em PDF faz parte do Pro.",
    description: "Uma folha por semana, um bloco por dia, para a porta da geladeira.",
  },
  crianca: {
    title: `No Pro cabem até ${PRO_STUDENT_PROFILE_LIMIT} crianças.`,
    description: "Cada uma com a sua turma, o seu horário e a sua vez.",
  },
  adulto: {
    title: "Para outro adulto acompanhar com o login dele, a casa precisa do Pro.",
    description: "Você escolhe quais crianças ele vê, e o que um marca o outro vê na hora.",
  },
  lembretes: {
    title: "O resumo do dia e os lembretes fazem parte do Pro.",
    description:
      "O resumo chega na hora que você escolher, e o lembrete avisa antes do prazo, no e-mail ou no celular.",
  },
} as const;

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await redirectIfUnauthenticated("/upgrade");
  const params = await searchParams;
  const cycleParam = typeof params.cycle === "string" ? params.cycle : undefined;
  const reason = typeof params.motivo === "string" ? params.motivo : undefined;

  // O plano que vale é o da família: o adulto convidado de uma casa Pro não
  // precisa assinar de novo. Quem assina cuida do plano em Assinatura.
  const [family, entitlement, profiles] = await Promise.all([
    getFamilyEntitlements(user.id),
    getAddEntitlement(user.id),
    listStudentProfilesForUser(user.id),
  ]);
  if (family.proOwnerIds.includes(user.id)) redirect("/settings/billing");
  // Só quem não tem criança própria é "da casa Pro". Quem cuida junto numa casa
  // Pro e cadastrou os próprios filhos no grátis continua podendo assinar: esta
  // página é a única porta do pagamento fora do cadastro.
  const ownsChildren = profiles.some((profile) => profile.userId === user.id);
  if (family.enabled && !ownsChildren) {
    return (
      <main className="mx-auto w-full max-w-md space-y-3 px-4 py-10">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
          A casa já tem o Pro.
        </h1>
        <p className="text-[15px] text-muted-foreground">
          Quem assina cuida do plano em Assinatura. Tudo do Pro já vale para você.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center font-bold text-primary-ink"
        >
          Voltar para Hoje
        </Link>
      </main>
    );
  }

  const trialEnded = entitlement.trialLeft === 0;
  // `Object.hasOwn`, e não `in`: `?motivo=toString` acharia o protótipo.
  const known =
    reason && Object.hasOwn(REASONS, reason) ? REASONS[reason as keyof typeof REASONS] : null;
  const { title, description } = known ?? {
    title: trialEnded ? "Os recados de teste acabaram." : "O Pro é para a casa inteira.",
    description: trialEnded
      ? `${
          entitlement.organizedFromNotices > 0
            ? `Com eles, a Agenda organizou ${
                entitlement.organizedFromNotices === 1
                  ? "1 atividade"
                  : `${entitlement.organizedFromNotices} atividades`
              } para vocês. `
            : ""
        }Para continuar mandando recados para ela ler, o Pro tem ${PRO_READS_PER_MONTH} leituras por mês.`
      : `Até ${PRO_STUDENT_PROFILE_LIMIT} crianças, ${PRO_ADULTS} adultos, ${PRO_READS_PER_MONTH} recados lidos por mês, resumos e lembretes.`,
  };

  return (
    <main className="flex w-full justify-center px-4 py-8 md:py-14">
      <UpgradeOffer
        title={title}
        description={description}
        initialCycle={parseCycleQueryParam(cycleParam)}
      />
    </main>
  );
}
