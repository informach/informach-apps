import { Tabs, TabsList, TabsTrigger } from "@informach/ui/components/tabs";
import Link from "next/link";

type ProfileOption = {
  id: string;
  name: string;
};

type Props = {
  profiles: ProfileOption[];
  active: string | null;
};

// Tabs persistidas via querystring `?perfil=<id>`. Cada trigger é um Link real
// (asChild) — evita JS pra navegação, faz SSR-render da nova página com
// scroll preservado, e o RSC busca dados novos do servidor. Esconde-se
// quando há menos de 2 perfis (1 perfil = sem ambiguidade).
export function ProfileFilterTabs({ profiles, active }: Props) {
  if (profiles.length < 2) return null;

  return (
    <Tabs value={active ?? "all"}>
      <TabsList className="flex w-full max-w-full flex-nowrap justify-start overflow-x-auto">
        <TabsTrigger value="all" asChild>
          <Link href="/dashboard" prefetch={false} scroll={false}>
            Todos
          </Link>
        </TabsTrigger>
        {profiles.map((p) => (
          <TabsTrigger key={p.id} value={p.id} asChild>
            <Link href={`/dashboard?perfil=${p.id}`} prefetch={false} scroll={false}>
              {p.name}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
