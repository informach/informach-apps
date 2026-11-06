import { canInviteGuardian, canUsePush } from "@/features/acesso/policy";
import { listDevices } from "@/features/aparelho/repository";
import { products } from "@/features/billing/service";
import {
  AjustesDaCasa,
  AjustesNoAparelho,
  Aparelhos,
  Conta,
  Criancas,
  Plano,
  Push,
  SegundoResponsavel,
  TrocarPin,
} from "@/features/familia/components/ajustes";
import { parentPage } from "@/features/familia/view";
import { pushConfigured } from "@/features/lembretes/push";
import { hasPushSubscription } from "@/features/lembretes/repository";
import { guardianState } from "@/features/responsavel/repository";
import { env } from "@/lib/env";

export const metadata = { title: "Ajustes" };

export default async function Ajustes({
  searchParams,
}: {
  searchParams: Promise<{ pagamento?: string; pin?: string }>;
}) {
  const ctx = await parentPage();
  const sp = await searchParams;
  if (ctx.mode === "pin") return <AjustesNoAparelho />;
  const family = ctx.family;
  const [devices, guardian, comPush] = await Promise.all([
    listDevices(ctx.ownerId),
    guardianState(ctx.ownerId),
    hasPushSubscription(ctx.userId),
  ]);
  const titular = ctx.role === "owner";
  const precos = Object.fromEntries(products.map((p) => [p.id, p.listPrice?.amountCents ?? 0]));
  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-xs font-extrabold tracking-[0.12em] text-tinta-suave">AJUSTES</p>
        <h1 className="font-display text-3xl font-extrabold leading-tight">Família e lembretes</h1>
      </header>
      {sp.pagamento === "recebido" && (
        <p role="status" className="cartao bg-folha-clara p-4 font-bold text-folha-escura">
          Pagamento recebido. O plano Família é liberado assim que a confirmação chegar.
        </p>
      )}
      <Plano
        titular={titular}
        pago={ctx.access.paid}
        assinatura={
          ctx.subscription
            ? {
                productId: ctx.subscription.productId,
                cancelAtPeriodEnd: !!ctx.subscription.cancelAtPeriodEnd,
                currentPeriodEnd: (
                  ctx.subscription.cancelAtPeriodEnd ?? ctx.subscription.currentPeriodEnd
                ).toISOString(),
              }
            : null
        }
        precos={precos}
        criancas={ctx.children.map((c) => ({ id: c.id, name: c.name, allowed: c.allowed }))}
      />
      <Criancas
        titular={titular}
        limite={ctx.access.childLimit}
        criancas={ctx.children.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      />
      <Aparelhos
        criancas={ctx.children.filter((c) => c.allowed).map((c) => ({ id: c.id, name: c.name }))}
        aparelhos={devices.map((d) => ({
          id: d.id,
          label: d.label,
          childIds: d.childIds,
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          ativo: !d.revokedAt && d.expiresAt.getTime() > Date.now(),
        }))}
        nomes={Object.fromEntries(ctx.children.map((c) => [c.id, c.name]))}
      />
      {family && (
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
      <TrocarPin />
      <SegundoResponsavel
        titular={titular}
        permitido={canInviteGuardian(ctx.access)}
        estado={{
          guardian: guardian.guardian
            ? { email: guardian.guardian.email, name: guardian.guardian.name }
            : null,
          invite: guardian.invite
            ? { email: guardian.invite.email, expiresAt: guardian.invite.expiresAt.toISOString() }
            : null,
        }}
      />
      <Conta email={ctx.email} titular={titular} />
    </div>
  );
}
