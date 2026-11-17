import { getAppUrl } from "@informach/config/domains";
import { canUsePush } from "@/features/acesso/policy";
import { listDevices } from "@/features/aparelho/repository";
import {
  AjustesDaCasa,
  AjustesNoAparelho,
  Aparelhos,
  Conta,
  Criancas,
  Plano,
  Push,
  TrocarPin,
} from "@/features/familia/components/ajustes";
import { activationChoices } from "@/features/familia/context-repository";
import { parentPage } from "@/features/familia/view";
import { pushConfigured } from "@/features/lembretes/push";
import { hasPushSubscription } from "@/features/lembretes/repository";
import { env } from "@/lib/env";

export const metadata = { title: "Ajustes" };

export default async function Ajustes({
  searchParams,
}: {
  searchParams: Promise<{ pagamento?: string; pin?: string }>;
}) {
  const ctx = await parentPage();
  await searchParams;
  if (ctx.mode === "pin") return <AjustesNoAparelho />;
  const family = ctx.family;
  const [devices, people, comPush] = await Promise.all([
    listDevices(ctx.actor),
    ctx.role === "administrator" ? activationChoices(ctx.actor) : [],
    hasPushSubscription(ctx.userId),
  ]);
  const titular = ctx.role === "administrator";
  const environment =
    new URL(env.NEXT_PUBLIC_APP_URL).hostname === "localhost" ? "development" : "production";
  const contaUrl = `${getAppUrl("conta", environment)}/?familia=${ctx.actor.familyGroupId}#familia`;
  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-xs font-extrabold tracking-[0.12em] text-tinta-suave">AJUSTES</p>
        <h1 className="font-display text-3xl font-extrabold leading-tight">Família e lembretes</h1>
      </header>
      <Plano
        familyGroupId={ctx.actor.familyGroupId}
        administrador={titular}
        pago={ctx.access.paid}
        limite={ctx.access.childLimit}
        criancas={ctx.children}
      />
      <Criancas
        administrador={titular}
        limite={ctx.access.childLimit}
        criancas={ctx.children}
        pessoas={people}
        contaUrl={contaUrl}
      />
      <Aparelhos
        criancas={ctx.children
          .filter((c) => c.allowed && c.canWrite)
          .map((c) => ({ id: c.id, name: c.name }))}
        aparelhos={devices.map((d) => ({
          id: d.id,
          label: d.label,
          childIds: d.childIds,
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          ativo: d.currentParticipation && !d.revokedAt && d.expiresAt.getTime() > Date.now(),
        }))}
        nomes={Object.fromEntries(ctx.children.map((c) => [c.id, c.name]))}
      />
      {family && titular && (
        <AjustesDaCasa
          inicial={{
            timezone: family.timezone,
            starsPerReal: family.starsPerReal,
            warnBefore: family.warnBefore,
            repeatEvery: family.repeatEvery,
            alertAfter: family.alertAfter,
            sound: family.sound,
            voice: family.voice,
            calm: family.calm,
            chestBonus: family.chestBonus,
          }}
        />
      )}
      <Push
        disponivel={pushConfigured()}
        permitido={canUsePush(ctx.access)}
        ativo={comPush}
        chavePublica={env.VAPID_PUBLIC_KEY}
      />
      {titular && <TrocarPin />}
      <Conta email={ctx.email} />
    </div>
  );
}
