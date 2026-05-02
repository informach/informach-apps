import { Alert, AlertDescription, AlertTitle } from "@informach/ui/components/alert";
import { Sparkles } from "lucide-react";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const showWelcome = params.welcome === "1";

  return (
    <div className="space-y-6 p-8">
      {showWelcome && (
        <Alert>
          <Sparkles className="h-4 w-4" aria-hidden />
          <AlertTitle>Bem-vindo ao Cozya!</AlertTitle>
          <AlertDescription>
            Sua conta está pronta. Comece organizando suas primeiras receitas.
          </AlertDescription>
        </Alert>
      )}
      <div>dashboard placeholder</div>
    </div>
  );
}
