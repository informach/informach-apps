import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import { Users } from "lucide-react";
import Link from "next/link";

export function NoStudentsWidget() {
  return (
    <Card className="border-chart-1/40 bg-gradient-to-br from-primary/10 via-primary/5 to-chart-1/10">
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Users className="size-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              Comece organizando a rotina das crianças
            </p>
            <p className="text-sm text-muted-foreground">
              Crie um perfil para cada filho ou filha. Assim você consegue separar tarefas, provas e
              recados por estudante.
            </p>
          </div>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/perfis">Criar perfil</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
