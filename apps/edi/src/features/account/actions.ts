"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActions } from "../../lib/action";
import { getAuth } from "../../lib/auth";
import { createSuiteCheckout, getBilling } from "../../lib/billing";
import { getEnv } from "../../lib/env";
import { stripeDestination } from "../../lib/stripe-destination";
import { withBillingLifecycle } from "../billing/lifecycle";
import { deactivateDevice, getAccount } from "./service";
export async function loadAccount() {
  const incoming = new Headers(await headers());
  const user = await getAuth().requireUser(incoming);
  const account = await getAccount(user.id);
  return {
    user: { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified },
    ...account,
    access: account.access.allowed
      ? { ...account.access, paidThrough: account.access.paidThrough.toISOString() }
      : account.access,
  };
}
export async function deactivateDeviceAction(deviceId: string) {
  return getActions()
    .input(z.uuid())
    .auth({ require: "user" })
    .rateLimit({ key: "edi:revoke", max: 10, window: "1m" })
    .run(async ({ input, ctx }) => {
      if (!ctx.actor) throw new Error("Missing authenticated actor");
      await deactivateDevice(ctx.actor.id, input);
      revalidatePath("/conta");
      return { ok: true };
    })(deviceId);
}
export async function checkoutAction(productId: string) {
  const result = await getActions()
    .input(z.enum(["edi_suite_monthly", "edi_suite_annual"]))
    .auth({ require: "user" })
    .rateLimit({ key: "edi:checkout", max: 5, window: "1m" })
    .run(async ({ input, ctx }) => {
      if (!ctx.actor?.emailVerified) throw new Error("Confirme seu e-mail antes de assinar.");
      return createSuiteCheckout(ctx.actor.id, input);
    })(productId);
  redirect(stripeDestination(result.url));
}
export async function billingPortalAction() {
  const result = await getActions()
    .input(z.object({}))
    .auth({ require: "user" })
    .rateLimit({ key: "edi:billing-portal", max: 10, window: "1m" })
    .run(async ({ ctx }) => {
      if (!ctx.actor) throw new Error("Missing authenticated actor");
      const actor = ctx.actor;
      return withBillingLifecycle(actor.id, () =>
        getBilling().createPortalSession({
          subject: { type: "user", id: actor.id },
          returnUrl: `${getEnv().NEXT_PUBLIC_APP_URL}/conta`,
        }),
      );
    })({});
  redirect(stripeDestination(result.url));
}
