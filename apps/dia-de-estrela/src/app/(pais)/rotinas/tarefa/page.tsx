import { notFound } from "next/navigation";
import { canRecordVoice } from "@/features/acesso/policy";
import { parentPage } from "@/features/familia/view";
import { EditorDeTarefa } from "@/features/rotina/components/editor";
import { getTask } from "@/features/rotina/repository";

export const metadata = { title: "Tarefa" };

const horaDoPeriodo: Record<string, string> = { manha: "07:00", tarde: "15:00", noite: "19:00" };

export default async function Tarefa({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; crianca?: string; periodo?: string }>;
}) {
  const ctx = await parentPage();
  const sp = await searchParams;
  const tarefa = sp.id && /^[\da-f-]{36}$/.test(sp.id) ? await getTask(ctx.ownerId, sp.id) : null;
  if (sp.id && !tarefa) notFound();
  const childId = tarefa?.childId ?? sp.crianca;
  const crianca = ctx.children.find((c) => c.id === childId);
  if (!crianca) notFound();
  return (
    <EditorDeTarefa
      childId={crianca.id}
      childName={crianca.name}
      podeGravar={canRecordVoice(ctx.access)}
      inicial={
        tarefa ?? {
          id: null,
          title: "",
          icon: "star",
          time: horaDoPeriodo[sp.periodo ?? ""] ?? "07:00",
          days: 0b1111111,
          durationMin: null,
          stars: 2,
          steps: [],
          needs: [],
          thenText: null,
          detail: null,
          remind: true,
          requiresApproval: false,
          hasVoice: false,
        }
      }
    />
  );
}
