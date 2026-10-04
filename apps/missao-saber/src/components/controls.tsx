"use client";
import { Label } from "@informach/ui/components/label";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
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
  // Botão sem formulário: antes da hidratação o clique não faz nada.
  const hydrated = useHydrated();
  return (
    <div className={largo ? "w-full" : undefined}>
      <BotaoChapa
        type="button"
        tom={tom}
        medida={medida}
        className={largo ? "w-full" : undefined}
        disabled={!hydrated || pending || disabled}
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
        <p role="alert" className="mt-2 text-sm font-semibold text-coral-solido">
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
  /* A escolha vive em estado local para o select mostrar a trilha nova na
     hora; quando o servidor confirma e a página revalida, `current` chega
     igual e nada muda. Se a troca falha, volta para a trilha confirmada. */
  const [selected, setSelected] = useState(current);
  const [confirmed, setConfirmed] = useState(current);
  if (confirmed !== current) {
    setConfirmed(current);
    setSelected(current);
  }
  /* Sem useTransition de propósito: no Next 16, uma action que revalida a
     árvore dentro de startTransition pode deixar o pending preso para
     sempre (vercel/next.js#86055); a jornada, que é longa, reproduzia isso
     em produção. O router.refresh() depois da action garante que card e
     caminho acompanhem a trilha nova. Ver também o comentário sobre a
     ausência de loading.tsx em app/(app)/layout.tsx. */
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="min-w-52">
      <Label htmlFor="trilha" className="mb-1.5 font-display font-semibold">
        Sua trilha
      </Label>
      {/* Select nativo de propósito: a página é renderizada no servidor e um
          seletor controlado por JS ficaria em branco até a hidratação.
          autoComplete="off" impede o navegador de restaurar, num recarregamento,
          a opção escolhida antes por cima da trilha que o servidor mandou. */}
      <select
        id="trilha"
        autoComplete="off"
        className="block h-12 w-full rounded-controle border-2 border-sombra bg-creme px-3 font-semibold text-tinta"
        value={selected}
        // Sem `disabled`: no Windows, a seta num select fechado já dispara a
        // troca, e um select desabilitado perderia o foco no meio dela.
        aria-disabled={saving}
        aria-busy={saving}
        onChange={async (event) => {
          if (saving) return;
          const id = event.target.value;
          setSelected(id);
          setError("");
          setSaving(true);
          try {
            const result = await courseAction(profileId, id);
            if (result.ok) router.refresh();
            else {
              setSelected(current);
              setError(result.error);
            }
          } catch {
            setSelected(current);
            setError("Não foi possível trocar de trilha.");
          } finally {
            setSaving(false);
          }
        }}
      >
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.label}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-coral-solido">
          {error}
        </p>
      )}
    </div>
  );
}
