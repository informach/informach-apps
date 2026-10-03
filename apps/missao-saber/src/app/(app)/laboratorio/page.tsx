import Link from "next/link";
import { z } from "zod";
import { EmptyProfile } from "@/components/empty-profile";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { courseLessons } from "@/features/content/catalog";
import { eligibleExperiences } from "@/features/labs/runtime/catalog";
import { LabLibrary } from "@/features/labs/runtime/library";
import { recommendLabs } from "@/features/labs/runtime/recommendation";
import {
  legacyLabChoices,
  listLabs,
  readLab,
  readLabNote,
} from "@/features/labs/runtime/repository";
import { AppError } from "@/lib/errors";
import { currentDashboard } from "@/lib/view";

export const metadata = { title: "Laboratório" };
export default async function Laboratory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await currentDashboard();
  if (!data.profile || !data.course) return <EmptyProfile />;
  const query = z
    .object({
      exec: z.string().uuid().optional(),
      note: z.string().uuid().optional(),
      ideia: z.string().max(160).optional(),
    })
    .safeParse(await searchParams);
  const experiences = eligibleExperiences({
    grade: data.profile.grade,
    courseId: data.course.id,
    paid: data.access.paid,
    profileAllowed: data.profileAllowed,
    contentStates: data.contentStates,
  });
  const saved = await listLabs(data.userId, data.profile.id);
  const legacy = await legacyLabChoices(data.userId, data.profile.id, experiences);
  let initial = null;
  let snapshot: Awaited<ReturnType<typeof readLabNote>> | undefined;
  let error = query.success ? "" : "O endereço desta experiência é inválido.";
  if (query.success && query.data.exec) {
    try {
      initial = await readLab(data.userId, { profileId: data.profile.id, id: query.data.exec });
    } catch (cause) {
      if (cause instanceof AppError) error = cause.message;
      else throw cause;
    }
  }
  if (query.success && query.data.note) {
    try {
      snapshot = await readLabNote(data.userId, data.profile.id, query.data.note);
    } catch (cause) {
      if (cause instanceof AppError) error = cause.message;
      else throw cause;
    }
  }
  const recommendation = recommendLabs({
    experiences,
    lessons: courseLessons(data.course),
    attemptedItemIds: data.attemptedItemIds,
    pausedLessonId: data.paused?.lessonId,
  });
  const contextual = query.success
    ? experiences.find((experience) => experience.id === query.data.ideia)
    : undefined;
  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="ceu">Experimente uma ideia</Etiqueta>}
        titulo="Pensar com as mãos."
        apoio="Faça uma previsão, experimente, explique o que descobriu e tente um novo caso. Cada experiência acompanha sua faixa escolar e sua trilha."
      />
      {error && (
        <p role="alert" className="mb-4 rounded-card border-2 border-coral p-4">
          {error}{" "}
          <Link className="underline" href="/laboratorio">
            Voltar à biblioteca
          </Link>
        </p>
      )}
      <LabLibrary
        key={data.profile.id}
        profileId={data.profile.id}
        experiences={experiences}
        saved={saved}
        recommendation={
          contextual ? { ...recommendation, primaryId: contextual.id } : recommendation
        }
        initial={initial}
        snapshot={snapshot}
        legacy={legacy}
      />
      <p className="mt-7 text-sm text-tinta-suave">
        Suas montagens antigas continuam preservadas nos dados da família.{" "}
        <Link className="underline" href="/familia">
          Abrir área da família
        </Link>
      </p>
    </>
  );
}
