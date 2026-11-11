"use client";
import { getAppUrl } from "@informach/config/domains";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import { createProfileAction } from "@/features/learning/actions";
import { ssoEnvironment } from "@/lib/auth-client";
import { useServerAction } from "@/lib/use-server-action";

const draftSchema = z.object({
  personId: z.union([z.string().uuid(), z.literal("")]),
  grade: z.number().int().min(2).max(12).nullable(),
  courseId: z.string().max(40),
  consent: z.boolean(),
  step: z.union([z.literal(1), z.literal(2)]),
});
type Draft = z.infer<typeof draftSchema>;

export function ProfileSetup({
  courses,
  grades,
  ownerId,
  familyGroupId,
  people,
}: {
  courses: { id: string; label: string; grades: number[]; description: string }[];
  grades: { value: number; label: string }[];
  ownerId: string;
  familyGroupId: string;
  people: { id: string; name: string }[];
}) {
  const key = `missao-setup:v2:${ownerId}:${familyGroupId}`;
  const [draft, setDraft] = useState<Draft>({
    personId: "",
    grade: null,
    courseId: "",
    consent: false,
    step: 1,
  });
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [pending, start] = useServerAction();
  const router = useRouter();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(key);
      const parsed = saved ? draftSchema.safeParse(JSON.parse(saved)) : null;
      if (parsed?.success && people.some((person) => person.id === parsed.data.personId))
        setDraft(parsed.data);
    } catch {
      /* The form remains usable when browser draft storage is unavailable. */
    }
    setLoaded(true);
  }, [key, people]);
  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(draft));
    } catch {
      /* Back/forward within this form still preserves the in-memory draft. */
    }
  }, [draft, key, loaded]);
  useEffect(() => {
    if (draft.step === 2) title.current?.focus();
  }, [draft.step]);
  const eligible = courses.filter(
    (course) => draft.grade !== null && course.grades.includes(draft.grade),
  );
  return (
    <div className="mx-auto max-w-2xl">
      <ol
        aria-label="Etapas de preparação"
        className="mb-8 grid grid-cols-3 gap-3 text-xs text-tinta-suave sm:text-sm"
      >
        {["Quem vai estudar", "Por onde começar", "Tudo pronto"].map((label, index) => (
          <li
            key={label}
            aria-current={draft.step === index + 1 ? "step" : undefined}
            className={`border-t-4 pt-3 ${draft.step === index + 1 ? "border-verde-solido font-bold text-tinta" : "border-sombra"}`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <form
        className="space-y-6 rounded-card border border-sombra bg-creme p-5 sm:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage("");
          if (draft.step === 1) {
            setDraft({ ...draft, step: 2 });
            return;
          }
          start(async () => {
            try {
              const result = await createProfileAction({
                personId: draft.personId,
                grade: draft.grade,
                courseId: draft.courseId,
                consent: draft.consent,
                birthMonth: null,
              });
              if (!result.ok) {
                setMessage(result.error);
                setNeedsLogin(result.code === "REAUTH" || result.code === "AUTH");
                return;
              }
              try {
                sessionStorage.removeItem(key);
              } catch {
                /* Successful server creation does not depend on local draft cleanup. */
              }
              router.push(`/familia/pronto?perfil=${result.data.id}`);
            } catch {
              setMessage(
                "Não foi possível confirmar a criação. Confira os estudantes cadastrados antes de tentar novamente.",
              );
            }
          });
        }}
      >
        <h2 ref={title} tabIndex={-1} className="text-2xl font-bold text-tinta">
          {draft.step === 1
            ? "Quem vai estudar?"
            : `Um começo para ${people.find((person) => person.id === draft.personId)?.name ?? "o estudante"}`}
        </h2>
        {draft.step === 1 ? (
          <>
            <div>
              <label htmlFor="setup-person" className="block text-sm font-semibold">
                Pessoa da família
              </label>
              <select
                id="setup-person"
                value={draft.personId}
                disabled={!loaded || pending}
                required
                onChange={(event) => setDraft({ ...draft, personId: event.target.value })}
                className="mt-2 min-h-12 w-full rounded-controle border border-input bg-background px-3"
              >
                <option value="" disabled>
                  Escolha quem vai estudar
                </option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm text-tinta-suave">
                A pessoa é a mesma nos outros apps.{" "}
                <a className="underline" href={getAppUrl("conta", ssoEnvironment)}>
                  Cadastrar ou gerenciar pessoas na Minha conta
                </a>
                .
              </p>
            </div>
            <div>
              <label htmlFor="setup-grade" className="block text-sm font-semibold">
                Ano escolar
              </label>
              <select
                id="setup-grade"
                required
                value={draft.grade ?? ""}
                onChange={(event) => {
                  const grade = Number(event.target.value);
                  setDraft({
                    ...draft,
                    grade,
                    courseId: courses.find((course) => course.grades.includes(grade))?.id ?? "",
                  });
                }}
                className="mt-2 min-h-12 w-full rounded-controle border border-input bg-background px-3"
              >
                <option value="" disabled>
                  Escolha o ano
                </option>
                {grades.map((grade) => (
                  <option key={grade.value} value={grade.value}>
                    {grade.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm text-tinta-suave">
                Usamos o ano para mostrar atividades adequadas. Nome e avatar são gerenciados na
                Minha conta.
              </p>
            </div>
            <label className="flex items-start gap-3 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={draft.consent}
                onChange={(event) => setDraft({ ...draft, consent: event.target.checked })}
                required
                className="mt-1 size-5 shrink-0"
              />
              <span>
                Sou responsável legal, maior de 18 anos. Autorizo o perfil e o registro de
                tentativas, pistas e descobertas para acompanhar a aprendizagem, conforme a{" "}
                <Link href="/privacidade" target="_blank" className="underline underline-offset-4">
                  política de privacidade
                </Link>
                .
              </span>
            </label>
            <BotaoChapa
              type="submit"
              disabled={!loaded || !people.some((person) => person.id === draft.personId)}
            >
              Continuar para a trilha
            </BotaoChapa>
          </>
        ) : (
          <>
            <p className="text-sm text-tinta-suave">
              Estas trilhas atendem ao ano escolar escolhido. Veja os assuntos e escolha um começo;
              a trilha pode ser alterada depois.
            </p>
            <fieldset className="space-y-3">
              <legend className="mb-3 font-semibold">Primeira trilha</legend>
              {eligible.map((course, index) => (
                <label
                  key={course.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-controle border-2 p-4 ${draft.courseId === course.id ? "border-verde-fundo bg-verde-claro" : "border-sombra"}`}
                >
                  <input
                    type="radio"
                    name="first-course"
                    value={course.id}
                    checked={draft.courseId === course.id}
                    onChange={() => setDraft({ ...draft, courseId: course.id })}
                    required
                    className="mt-1 size-5 shrink-0"
                  />
                  <span>
                    <span className="block font-semibold">{course.label}</span>
                    <span className="mt-1 block text-sm text-tinta-suave">
                      {course.description}
                    </span>
                    {index === 0 && (
                      <span className="mt-2 block text-xs font-semibold">
                        Sugestão inicial para este ano escolar.
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <BotaoChapa
                type="submit"
                disabled={
                  !loaded || pending || !eligible.some((course) => course.id === draft.courseId)
                }
              >
                {pending ? "Criando perfil…" : "Criar perfil"}
              </BotaoChapa>
              <BotaoChapa
                type="button"
                tom="contorno"
                disabled={pending}
                onClick={() => setDraft({ ...draft, step: 1 })}
              >
                Voltar
              </BotaoChapa>
            </div>
          </>
        )}
        {message && (
          <p role="alert" className="text-sm font-semibold text-coral-solido">
            {message}
          </p>
        )}
        {needsLogin && (
          <Link
            className="inline-flex min-h-11 items-center font-semibold underline"
            href="/entrar?next=%2Ffamilia%2Fpreparar"
          >
            Confirmar acesso e continuar o cadastro
          </Link>
        )}
      </form>
    </div>
  );
}
