import "server-only";
import { isDeepStrictEqual } from "node:util";
import { and, count, db, desc, eq, inArray, isNull, sql } from "@informach/db";
import {
  missaoContentControls as controls,
  missaoExperiments as experiments,
  missaoNotes as notes,
  missaoProfiles as profiles,
  missaoLabExecutions as runs,
  missaoSessions as sessions,
} from "@informach/db/schema";
import { z } from "zod";
import { withBillingLifecycleWait } from "@/features/billing/repository";
import { getAccess } from "@/features/billing/service";
import { resolvedCourse } from "@/features/content/catalog";
import { lessonSchema } from "@/features/content/types";
import { allowedProfileIds } from "@/features/family/profile-access";
import { effectiveGrade } from "@/features/family/school-year";
import { lockOwner, recordHint } from "@/features/learning/repository";
import { dashboard } from "@/features/learning/service";
import { assertAllowed } from "@/lib/errors";
import { experimentSchema } from "../schemas";
import { eligibleExperiences, findExperience, type LabExperience } from "./catalog";
import { loadTool } from "./modules";
import {
  type LabDocument,
  labAssessmentSchema,
  labAttachmentSchema,
  labDocumentSchema,
  saveLabSchema,
  startLabSchema,
} from "./schemas";
import type { ToolLaunch } from "./types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Run = typeof runs.$inferSelect;
const identitySchema = z.object({ profileId: z.string().uuid(), id: z.string().uuid() });
type BillingAccess = Awaited<ReturnType<typeof getAccess>>;
async function laboratoryTransaction<T>(
  userId: string,
  operation: (tx: Tx, billingAccess: BillingAccess) => Promise<T>,
) {
  return withBillingLifecycleWait(userId, async () => {
    const billingAccess = await getAccess(userId);
    return db.transaction(async (tx) => {
      await lockOwner(tx, userId);
      return operation(tx, billingAccess);
    });
  });
}
async function lockedAccess(
  tx: Tx,
  userId: string,
  profileId: string,
  experienceId: string,
  billingAccess: BillingAccess,
) {
  const ordered = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .orderBy(profiles.createdAt, profiles.id);
  const profile = ordered.find((row) => row.id === profileId);
  assertAllowed(profile, "PROFILE", "Perfil não encontrado.");
  const grade = effectiveGrade(profile);
  const course = resolvedCourse({ ...profile, grade });
  const experience = findExperience(experienceId);
  assertAllowed(
    course && experience,
    "LAB_ACCESS",
    "Esta experiência não está disponível neste perfil.",
  );
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`missao:content:${experience.lessonId}`}, 0))`,
  );
  const [decision] = await tx
    .select({ status: controls.status })
    .from(controls)
    .where(
      and(
        eq(controls.lessonId, experience.lessonId),
        inArray(controls.status, ["available", "suspended"]),
      ),
    )
    .orderBy(desc(controls.createdAt), desc(controls.id))
    .limit(1);
  const eligible = eligibleExperiences({
    grade,
    courseId: course.id,
    paid: billingAccess.paid,
    profileAllowed: allowedProfileIds(ordered, billingAccess.profileLimit).includes(profileId),
    contentStates: new Map(decision ? [[experience.lessonId, decision]] : []),
  });
  assertAllowed(
    eligible.some((entry) => entry.id === experienceId),
    "LAB_ACCESS",
    "Esta experiência não está disponível na faixa escolar, trilha ou plano deste perfil.",
  );
  return { experience, grade, courseId: course.id };
}
async function access(userId: string, profileId: string, experienceId: string) {
  const data = await dashboard(userId, profileId);
  assertAllowed(data.profile && data.course, "PROFILE", "Selecione um perfil e uma trilha.");
  const experience = eligibleExperiences({
    grade: data.profile.grade,
    courseId: data.course.id,
    paid: data.access.paid,
    profileAllowed: data.profileAllowed,
    contentStates: data.contentStates,
  }).find((entry) => entry.id === experienceId);
  assertAllowed(
    experience,
    "LAB_ACCESS",
    "Esta experiência não está disponível na faixa escolar, trilha ou plano deste perfil.",
  );
  return { experience, grade: data.profile.grade, courseId: data.course.id };
}
async function ownedRun(tx: Tx, userId: string, profileId: string, id: string) {
  const [row] = await tx
    .select({ run: runs })
    .from(runs)
    .innerJoin(profiles, eq(runs.profileId, profiles.id))
    .where(and(eq(runs.id, id), eq(profiles.id, profileId), eq(profiles.userId, userId)));
  assertAllowed(row, "NOT_FOUND", "Experiência não encontrada neste perfil.");
  assertAllowed(
    row.run.version === findExperience(row.run.experienceId)?.version,
    "LAB_VERSION",
    "Esta experiência usa uma versão anterior. O registro permanece preservado nos dados da família.",
  );
  return row.run;
}
function launchFor(experience: LabExperience, grade: number, variant: 0 | 1): ToolLaunch {
  return { family: experience.family, mode: experience.mode, grade, variant };
}
async function normalize(experience: LabExperience, grade: number, raw: unknown) {
  const document = labDocumentSchema.parse(raw);
  const tool = await loadTool(experience.family);
  assertAllowed(
    tool.modes.includes(experience.mode),
    "LAB_VERSION",
    "Esta experiência precisa de atualização.",
  );
  const launch = launchFor(experience, grade, 0);
  return {
    ...document,
    state: tool.parse(launch, document.state),
    transferState: tool.parse({ ...launch, variant: 1 }, document.transferState),
    comparison: document.comparison ? tool.parse(launch, document.comparison) : null,
  };
}
async function view(run: Run, experience: LabExperience) {
  assertAllowed(
    run.version === experience.version,
    "LAB_VERSION",
    "Esta experiência pertence a uma versão anterior. Suas anotações estão preservadas no caderno.",
  );
  const tool = await loadTool(experience.family);
  return {
    id: run.id,
    profileId: run.profileId,
    experience,
    grade: run.grade,
    revision: run.revision,
    document: await normalize(experience, run.grade, run.document),
    assessment: run.assessment ? labAssessmentSchema.parse(run.assessment) : null,
    context: run.context,
    updatedAt: run.updatedAt.toISOString(),
    activity: tool.activity(launchFor(experience, run.grade, 0)),
    transfer: tool.activity(launchFor(experience, run.grade, 1)),
  };
}
export type LabExecutionView = Awaited<ReturnType<typeof view>>;

export async function startLab(userId: string, raw: unknown) {
  const input = startLabSchema.parse(raw);
  const requestSource =
    !input.duplicateId && !input.noteId && !input.legacyKind && !input.context
      ? "new"
      : JSON.stringify([
          input.duplicateId ?? null,
          input.noteId ?? null,
          input.legacyKind ?? null,
          input.context ?? null,
        ]);
  assertAllowed(
    [input.duplicateId, input.noteId, input.legacyKind, input.context].filter(Boolean).length <= 1,
    "LAB_CONTEXT",
    "Escolha uma única origem para a nova experiência.",
  );
  const [retry] = await db
    .select({ run: runs })
    .from(runs)
    .innerJoin(profiles, eq(runs.profileId, profiles.id))
    .where(
      and(eq(runs.id, input.id), eq(profiles.id, input.profileId), eq(profiles.userId, userId)),
    );
  if (retry) {
    const allowed = await access(userId, input.profileId, input.experienceId);
    assertAllowed(
      retry.run.experienceId === input.experienceId && retry.run.requestSource === requestSource,
      "CONFLICT",
      "Este identificador já está em uso.",
    );
    return view(retry.run, allowed.experience);
  }
  // Register assistance before a tool can be seen or an answer submitted.
  if (input.context) {
    const [source] = await db
      .select({ profileId: sessions.profileId, snapshot: sessions.snapshot })
      .from(sessions)
      .innerJoin(profiles, eq(sessions.profileId, profiles.id))
      .where(
        and(
          eq(sessions.id, input.context.sessionId),
          eq(profiles.userId, userId),
          eq(profiles.id, input.profileId),
        ),
      );
    const experience = findExperience(input.experienceId);
    const lesson = source ? lessonSchema.parse(source.snapshot) : null;
    assertAllowed(
      lesson &&
        experience?.lessonId === lesson.id &&
        experience.itemIds.includes(input.context.itemId) &&
        lesson.items.some((item) => item.id === input.context?.itemId),
      "LAB_CONTEXT",
      "A experiência não pertence a esta questão.",
    );
    await access(userId, input.profileId, input.experienceId);
    await recordHint(userId, { ...input.context, level: 1 });
  }
  return laboratoryTransaction(userId, async (tx, billingAccess) => {
    const allowed = await lockedAccess(
      tx,
      userId,
      input.profileId,
      input.experienceId,
      billingAccess,
    );
    const [existing] = await tx.select().from(runs).where(eq(runs.id, input.id));
    if (existing) {
      assertAllowed(
        existing.profileId === input.profileId &&
          existing.experienceId === input.experienceId &&
          existing.requestSource === requestSource,
        "CONFLICT",
        "Este identificador já está em uso. Abra a experiência salva.",
      );
      return view(existing, allowed.experience);
    }
    // A mission opens its existing investigation across navigation/devices. The owner
    // lock serializes simultaneous first opens with different client request IDs.
    // Copies have a different requestSource and must never replace this original.
    if (input.context) {
      const [continuing] = await tx
        .select()
        .from(runs)
        .where(
          and(
            eq(runs.profileId, input.profileId),
            eq(runs.experienceId, input.experienceId),
            eq(runs.version, allowed.experience.version),
            eq(runs.requestSource, requestSource),
          ),
        )
        .orderBy(desc(runs.createdAt), desc(runs.id))
        .limit(1);
      if (continuing) return view(continuing, allowed.experience);
    }
    const tool = await loadTool(allowed.experience.family);
    const first = tool.activity(launchFor(allowed.experience, allowed.grade, 0));
    const transfer = tool.activity(launchFor(allowed.experience, allowed.grade, 1));
    let document: LabDocument = {
      stage: "prediction",
      free: false,
      state: first.initialState,
      transferState: transfer.initialState,
      comparison: null,
      prediction: "",
      observation: "",
      explanation: "",
      answer: "",
      transferAnswer: "",
      rubric: [],
    };
    let legacy = null;
    let context = input.context ?? null;
    let runGrade = allowed.grade;
    if (input.legacyKind) {
      const target = legacyTargets[input.legacyKind];
      assertAllowed(
        allowed.experience.family === target.family && allowed.experience.mode === target.mode,
        "LAB_CONTEXT",
        "Esta ferramenta não é compatível com a montagem antiga.",
      );
      const [original] = await tx
        .select()
        .from(experiments)
        .where(
          and(eq(experiments.profileId, input.profileId), eq(experiments.kind, input.legacyKind)),
        );
      assertAllowed(original, "NOT_FOUND", "Montagem antiga não encontrada neste perfil.");
      const state = experimentSchema.parse(original.state);
      const imported =
        state.kind === "groups"
          ? (await import("./reasoning/combinatorics")).adaptLegacyGroups(state)
          : state.kind === "bars"
            ? (await import("./elementary")).adaptLegacyBars(state)
            : (await import("./elementary")).adaptLegacyGrid(state);
      legacy = {
        version: 1,
        experimentId: original.id,
        revision: original.revision,
        state: original.state,
      };
      document = {
        ...document,
        state: imported,
        prediction: state.previsao,
        observation: state.observacao,
        stage: "investigate",
        free: true,
      };
    }
    if (input.duplicateId) {
      const original = await ownedRun(tx, userId, input.profileId, input.duplicateId);
      assertAllowed(
        original.experienceId === input.experienceId,
        "LAB_CONTEXT",
        "Escolha a mesma experiência para duplicar.",
      );
      runGrade = original.grade;
      document = await normalize(allowed.experience, runGrade, original.document);
      context ??= original.context;
    }
    if (input.noteId) {
      const [note] = await tx
        .select()
        .from(notes)
        .where(and(eq(notes.id, input.noteId), eq(notes.profileId, input.profileId)));
      assertAllowed(
        note?.labAttachment,
        "NOT_FOUND",
        "Investigação não encontrada no caderno deste perfil.",
      );
      const attachment = labAttachmentSchema.parse(note.labAttachment);
      assertAllowed(
        attachment.experienceId === input.experienceId &&
          (attachment.experienceVersion ?? 1) === allowed.experience.version,
        "LAB_CONTEXT",
        "Escolha a experiência registrada no caderno.",
      );
      runGrade =
        attachment.grade ??
        (await ownedRun(tx, userId, input.profileId, attachment.executionId)).grade;
      document = await normalize(allowed.experience, runGrade, attachment.document);
      context ??= attachment.missionContext
        ? {
            sessionId: attachment.missionContext.sessionId,
            itemId: attachment.missionContext.itemId,
          }
        : null;
    }
    const [created] = await tx
      .insert(runs)
      .values({
        id: input.id,
        profileId: input.profileId,
        experienceId: input.experienceId,
        version: allowed.experience.version,
        grade: runGrade,
        courseId: allowed.courseId,
        context,
        requestSource,
        legacy,
        document: await normalize(allowed.experience, runGrade, document),
        events: [
          { kind: "explored", at: new Date().toISOString(), revision: 1, summary: first.title },
        ],
      })
      .returning();
    assertAllowed(created, "SAVE", "Não foi possível iniciar a experiência.");
    return view(created, allowed.experience);
  });
}

export async function readLab(userId: string, raw: unknown) {
  const input = identitySchema.parse(raw);
  return laboratoryTransaction(userId, async (tx, billingAccess) => {
    const run = await ownedRun(tx, userId, input.profileId, input.id);
    const allowed = await lockedAccess(
      tx,
      userId,
      input.profileId,
      run.experienceId,
      billingAccess,
    );
    return view(run, allowed.experience);
  });
}
export async function saveLab(userId: string, raw: unknown) {
  const input = saveLabSchema.parse(raw);
  return laboratoryTransaction(userId, async (tx, billingAccess) => {
    const run = await ownedRun(tx, userId, input.profileId, input.id);
    const { experience } = await lockedAccess(
      tx,
      userId,
      input.profileId,
      run.experienceId,
      billingAccess,
    );
    const document = await normalize(experience, run.grade, input.document);
    if (
      isDeepStrictEqual(run.document, document) &&
      [input.revision, input.revision + 1].includes(run.revision)
    )
      return { revision: run.revision, updatedAt: run.updatedAt.toISOString() };
    assertAllowed(
      run.revision === input.revision,
      "CONFLICT",
      "Outra aba ou aparelho salvou uma versão nova. Reabra a versão salva ou guarde suas mudanças em uma cópia.",
    );
    const now = new Date();
    const tool = await loadTool(experience.family);
    const rubric = tool.activity(launchFor(experience, run.grade, 0)).rubric;
    const concluded =
      document.stage === "transfer" &&
      rubric.every((_, index) => document.rubric.includes(index)) &&
      (run.grade <= 4 || document.explanation.trim().length >= 5);
    const events = [...run.events];
    if (concluded && !events.some((event) => event.kind === "investigation_concluded"))
      events.push({
        kind: "investigation_concluded",
        at: now.toISOString(),
        revision: run.revision + 1,
        summary: tool.summarize(launchFor(experience, run.grade, 0), document.state),
      });
    await tx
      .update(runs)
      .set({ document, revision: run.revision + 1, updatedAt: now, assessment: null, events })
      .where(eq(runs.id, run.id));
    return { revision: run.revision + 1, updatedAt: now.toISOString() };
  });
}
export async function assessLab(userId: string, raw: unknown) {
  const input = identitySchema
    .extend({
      revision: z.number().int().positive(),
      variant: z.union([z.literal(0), z.literal(1)]),
    })
    .parse(raw);
  return laboratoryTransaction(userId, async (tx, billingAccess) => {
    const run = await ownedRun(tx, userId, input.profileId, input.id);
    const { experience } = await lockedAccess(
      tx,
      userId,
      input.profileId,
      run.experienceId,
      billingAccess,
    );
    assertAllowed(
      input.revision === run.revision,
      "CONFLICT",
      "Salve sua montagem antes de conferir.",
    );
    const document = await normalize(experience, run.grade, run.document);
    const tool = await loadTool(experience.family);
    const answer = input.variant === 1 ? document.transferAnswer : document.answer;
    assertAllowed(
      answer.trim().length > 0,
      "LAB_ANSWER",
      "Registre sua resposta ou explicação antes de conferir.",
    );
    const assessment = tool.assess(
      launchFor(experience, run.grade, input.variant),
      input.variant === 1 ? document.transferState : document.state,
      answer,
    );
    const updatedAt = input.variant === 1 ? new Date() : run.updatedAt;
    if (input.variant === 1) {
      const events = [...run.events];
      const kind = assessment.correct ? "transfer_solved" : "transfer_reflected";
      if (assessment.correct !== false && !events.some((event) => event.kind === kind)) {
        events.push({
          kind,
          at: new Date().toISOString(),
          revision: run.revision,
          summary: assessment.summary,
        });
      }
      await tx.update(runs).set({ assessment, events, updatedAt }).where(eq(runs.id, run.id));
    }
    return { ...assessment, updatedAt: updatedAt.toISOString() };
  });
}
export async function listLabs(userId: string, profileId: string) {
  const data = await dashboard(userId, z.string().uuid().parse(profileId));
  assertAllowed(data.profile, "PROFILE", "Perfil não encontrado.");
  const allowed = new Set(
    data.course
      ? eligibleExperiences({
          grade: data.profile.grade,
          courseId: data.course.id,
          paid: data.access.paid,
          profileAllowed: data.profileAllowed,
          contentStates: data.contentStates,
        }).map((entry) => entry.id)
      : [],
  );
  const rows = await db
    .select({
      id: runs.id,
      experienceId: runs.experienceId,
      updatedAt: runs.updatedAt,
      revision: runs.revision,
      assessment: runs.assessment,
    })
    .from(runs)
    .where(eq(runs.profileId, profileId))
    .orderBy(desc(runs.updatedAt));
  return rows
    .filter((run) => allowed.has(run.experienceId))
    .map((run) => ({
      ...run,
      title: findExperience(run.experienceId)?.title ?? "Experiência preservada",
      updatedAt: run.updatedAt.toISOString(),
    }));
}
export async function readLabNote(userId: string, profileId: string, noteId: string) {
  identitySchema.parse({ profileId, id: noteId });
  const [row] = await db
    .select({ attachment: notes.labAttachment })
    .from(notes)
    .innerJoin(profiles, eq(notes.profileId, profiles.id))
    .where(and(eq(notes.id, noteId), eq(profiles.id, profileId), eq(profiles.userId, userId)));
  assertAllowed(
    row?.attachment,
    "NOT_FOUND",
    "Investigação não encontrada no caderno deste perfil.",
  );
  const attachment = labAttachmentSchema.parse(row.attachment);
  await access(userId, profileId, attachment.experienceId);
  return { ...attachment, noteId };
}
const legacyTargets = {
  bars: { family: "L03", mode: "mudancas-sucessivas", title: "Barras e descontos" },
  grid: { family: "L05", mode: "area-e-contorno", title: "Malha e contorno" },
  groups: { family: "L12", mode: "possivel-ou-garantido", title: "Grupos e gavetas" },
};
export async function legacyLabChoices(
  userId: string,
  profileId: string,
  eligible: LabExperience[],
) {
  const rows = await db
    .select({ experiment: experiments })
    .from(experiments)
    .innerJoin(profiles, eq(experiments.profileId, profiles.id))
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)));
  return rows.flatMap(({ experiment }) => {
    const target = legacyTargets[experiment.kind];
    const experience = eligible.find(
      (entry) => entry.family === target.family && entry.mode === target.mode,
    );
    return experience
      ? [{ kind: experiment.kind, title: target.title, experienceId: experience.id }]
      : [];
  });
}
export async function labToNotebook(userId: string, raw: unknown) {
  const input = identitySchema
    .extend({ noteId: z.string().uuid(), revision: z.number().int().positive() })
    .parse(raw);
  return laboratoryTransaction(userId, async (tx, billingAccess) => {
    const run = await ownedRun(tx, userId, input.profileId, input.id);
    const { experience } = await lockedAccess(
      tx,
      userId,
      input.profileId,
      run.experienceId,
      billingAccess,
    );
    const [previous] = await tx.select().from(notes).where(eq(notes.id, input.noteId));
    if (previous) {
      assertAllowed(
        previous.profileId === input.profileId && previous.labAttachment,
        "CONFLICT",
        "Este registro do caderno já existe.",
      );
      const attachment = labAttachmentSchema.parse(previous.labAttachment);
      assertAllowed(
        attachment.executionId === run.id &&
          (attachment.revision === undefined
            ? input.revision === run.revision &&
              isDeepStrictEqual(attachment.document, run.document)
            : attachment.revision === input.revision),
        "CONFLICT",
        "Este registro já guardou outra montagem. Guarde suas mudanças em um novo registro.",
      );
      return { id: previous.id };
    }
    assertAllowed(
      run.revision === input.revision,
      "CONFLICT",
      "Salve sua montagem antes de guardar no caderno.",
    );
    const [total] = await tx
      .select({ value: count() })
      .from(notes)
      .where(and(eq(notes.profileId, input.profileId), isNull(notes.archivedAt)));
    assertAllowed(
      (total?.value ?? 0) < 100,
      "LIMIT",
      "Arquive uma anotação para abrir espaço no caderno.",
    );
    const document = await normalize(experience, run.grade, run.document);
    const tool = await loadTool(experience.family);
    const launch = launchFor(experience, run.grade, 0);
    const [mission] = run.context
      ? await tx
          .select()
          .from(sessions)
          .where(and(eq(sessions.id, run.context.sessionId), eq(sessions.profileId, run.profileId)))
      : [];
    const lesson = mission ? lessonSchema.parse(mission.snapshot) : null;
    const item = lesson?.items.find((entry) => entry.id === run.context?.itemId);
    const missionContext =
      mission && lesson && item
        ? { sessionId: mission.id, itemId: item.id, title: lesson.title, prompt: item.prompt }
        : null;
    const attachment = labAttachmentSchema.parse({
      version: 1,
      executionId: run.id,
      experienceId: experience.id,
      experienceVersion: run.version,
      grade: run.grade,
      revision: run.revision,
      title: experience.title,
      skill: experience.skill,
      question: tool.activity(launch).prompt,
      savedAt: new Date().toISOString(),
      summary: tool.summarize(launch, document.state),
      document,
      assessment: run.assessment ? labAssessmentSchema.parse(run.assessment) : null,
      transfer:
        document.stage === "transfer" || document.transferAnswer || run.assessment
          ? {
              question: tool.activity({ ...launch, variant: 1 }).prompt,
              summary: tool.summarize({ ...launch, variant: 1 }, document.transferState),
            }
          : null,
      missionContext,
    });
    await tx.insert(notes).values({
      id: input.noteId,
      profileId: input.profileId,
      text: `${experience.title}\n${document.explanation || document.observation || attachment.summary}`.slice(
        0,
        1000,
      ),
      labAttachment: attachment,
      sessionId: missionContext?.sessionId,
      itemId: missionContext?.itemId,
    });
    return { id: input.noteId };
  });
}
