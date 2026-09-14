import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import { GraduationCap } from "lucide-react";
import Link from "next/link";

type Props = {
  count: number;
};

export function ProfilesWithoutTurmaWidget({ count }: Props) {
  const isPlural = count > 1;
  return (
    <Card className="border-chart-3/40 bg-gradient-to-br from-secondary/10 via-secondary/5 to-chart-3/10">
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary">
            <GraduationCap className="size-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              {isPlural
                ? `${count} estudantes ainda sem turma`
                : "Vincule seu estudante a uma turma"}
            </p>
            <p className="text-sm text-muted-foreground">
              Cadastre uma nova turma ou entre numa existente com o código pra começar a organizar
              tarefas, provas e recados.
            </p>
          </div>
        </div>
        <Button asChild variant="secondary" className="shrink-0">
          <Link href="/familia/turmas">Ver turmas</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
