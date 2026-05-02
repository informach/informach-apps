import { Alert, AlertDescription, AlertTitle } from "@informach/ui/components/alert";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { BookOpen, CreditCard, Plus, Search, Sparkles } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const showWelcome = params.welcome === "1";

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 md:px-8">
      {showWelcome && (
        <Alert>
          <Sparkles className="h-4 w-4" aria-hidden />
          <AlertTitle>Bem-vindo ao Cozya!</AlertTitle>
          <AlertDescription>
            Sua conta está pronta. Comece organizando suas primeiras receitas.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Minhas receitas</h1>
          <p className="text-sm text-muted-foreground">
            Comece salvando receitas e acompanhe seus créditos do Pro.
          </p>
        </div>
        <Button>
          <Plus className="mr-2 size-4" aria-hidden />
          Nova receita
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receitas</CardTitle>
            <BookOpen className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums tracking-tight">0</div>
            <p className="text-xs text-muted-foreground">Nenhuma receita cadastrada ainda.</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Favoritas</CardTitle>
            <Search className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums tracking-tight">0</div>
            <p className="text-xs text-muted-foreground">Use a busca depois de criar receitas.</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Plano e créditos
            </CardTitle>
            <CreditCard className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Veja assinatura, portal de cobrança e histórico de créditos.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/billing">Abrir billing</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
