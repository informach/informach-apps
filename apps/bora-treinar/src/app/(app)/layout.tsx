import { ofertas } from "@/features/billing/ofertas";
import { PlanosProvider } from "@/features/billing/planos";
import { configuredPrice, products } from "@/features/billing/service";
import { familyView } from "@/features/familia/view";
import { FilaOffline } from "@/features/sessoes/fila-offline";
import { requirePageUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const { access } = await familyView(user.id);
  return (
    // A folha de planos mora aqui: qualquer cadeado das telas logadas a abre com o motivo.
    <PlanosProvider
      estado={{
        ofertas: ofertas(products),
        configurados: products.filter((p) => configuredPrice(p.id)).map((p) => p.id),
        assinante: access.subscribed,
        teste: { active: access.trial.active, started: access.trial.started },
      }}
    >
      <FilaOffline />
      {children}
    </PlanosProvider>
  );
}
