"use client";
import { Label } from "@informach/ui/components/label";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SessionMode } from "@/features/content/types";
import { courseAction, startAction } from "@/features/learning/actions";
import { BotaoChapa } from "./ui/botao-chapa";
import type { Tom } from "./ui/chapa";

export function StartButton({
  profileId,
  lessonId,
  mode = "mission",
  children,
  disabled = false,
  tom = "verde",
  medida = "m",
  largo = false,
}: {
  profileId: string;
  lessonId: string;
  mode?: SessionMode;
  children: React.ReactNode;
  disabled?: boolean;
  tom?: Tom | "contorno";
  medida?: "g" | "m" | "p";
  largo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  return (
    <div className={largo ? "w-full" : undefined}>
      <BotaoChapa
        type="button"
        tom={tom}
        medida={medida}
        className={largo ? "w-full" : undefined}
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            setError("");
            try {
              const result = await startAction({ profileId, lessonId, mode, requestKey: key });
              if (result.ok) router.push(`/missao/${result.data.id}`);
              else setError(result.error);
            } catch {
              setError("A conexão falhou. Tente novamente para retomar a mesma missão.");
            }
          })
        }
      >
        {pending ? "Abrindo…" : children}
      </BotaoChapa>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-coral-fundo">
          {error}
        </p>
      )}
    </div>
  );
}

export function CoursePicker({
  profileId,
  current,
  courses,
}: {
  profileId: string;
  current: string;
  courses: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="min-w-52">
      <Label htmlFor="trilha" className="mb-1.5 font-display font-semibold">
        Sua trilha
      </Label>
      {/* Select nativo de propósito: a página é renderizada no servidor e um
          seletor controlado por JS ficaria em branco até a hidratação. */}
      <select
        id="trilha"
        className="block h-12 w-full rounded-controle border-2 border-sombra bg-creme px-3 font-semibold text-tinta"
        value={current}
        disabled={pending}
        onChange={(event) => {
          const id = event.target.value;
          start(async () => {
            try {
              const result = await courseAction(profileId, id);
              if (result.ok) router.refresh();
              else setError(result.error);
            } catch {
              setError("Não foi possível trocar de trilha.");
            }
          });
        }}
      >
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.label}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-coral-fundo">
          {error}
        </p>
      )}
    </div>
  );
}
