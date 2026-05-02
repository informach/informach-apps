import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { renderTemplate } from "../templates";
import { AccountDeletionEmail } from "../templates/accountDeletion";
import { CreditsPurchasedEmail } from "../templates/creditsPurchased";
import { InvitationEmail } from "../templates/invitation";
import { MagicLinkEmail } from "../templates/magicLink";
import { PasswordResetEmail } from "../templates/passwordReset";
import { PaymentFailedEmail } from "../templates/paymentFailed";
import { PaymentSuccessEmail } from "../templates/paymentSuccess";
import { SubscriptionCanceledEmail } from "../templates/subscriptionCanceled";
import { SubscriptionRenewedEmail } from "../templates/subscriptionRenewed";
import { VerificationEmail } from "../templates/verification";

const baseProps = {
  appName: "Test App",
  url: "https://app.example.com/action?token=test-token",
  unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=test",
  unsubscribeMailto: "unsubscribe@app.example.com",
};

describe("renderTemplate", () => {
  it("returns html, text and subject for verify-email", async () => {
    const result = await renderTemplate("auth.verify-email", baseProps);
    expect(result.subject).toBe("Test App — verifique seu email");
    expect(result.html).toContain("Verifique seu email");
    expect(result.html).toContain(baseProps.url);
    expect(result.html).toContain(baseProps.unsubscribeUrl);
    expect(result.html).toContain("Cancele a assinatura");
    expect(result.text).toContain("Test App");
    expect(result.text).toContain(baseProps.url);
  });

  it("returns html, text and subject for password-reset", async () => {
    const result = await renderTemplate("auth.password-reset", baseProps);
    expect(result.subject).toBe("Test App — recuperação de senha");
    expect(result.html).toContain("Recuperação de senha");
    expect(result.html).toContain(baseProps.url);
    expect(result.text).toContain(baseProps.url);
  });

  it("returns html, text and subject for magic-link", async () => {
    const result = await renderTemplate("auth.magic-link", baseProps);
    expect(result.subject).toBe("Test App — seu link de acesso");
    expect(result.html).toContain("Seu link de acesso");
    expect(result.html).toContain(baseProps.url);
  });

  it("returns html, text and subject for invitation", async () => {
    const result = await renderTemplate("auth.invitation", {
      ...baseProps,
      inviterName: "Helena",
      organizationName: "Escola X",
    });
    expect(result.subject).toBe("Test App — convite para Escola X");
    expect(result.html).toContain("Convite para Escola X");
    expect(result.html).toContain("Helena");
    expect(result.html).toContain(baseProps.url);
  });

  it("returns html, text and subject for account-deletion", async () => {
    const result = await renderTemplate("auth.account-deletion", baseProps);
    expect(result.subject).toBe("Test App — confirme a exclusão da conta");
    expect(result.html).toContain("Confirme a exclusão da sua conta");
    expect(result.html).toContain("irreversível");
    expect(result.html).toContain(baseProps.url);
  });

  it("throws on unknown category", async () => {
    await expect(
      renderTemplate(
        // @ts-expect-error testing runtime guard
        "unknown",
        baseProps,
      ),
    ).rejects.toThrow(/unknown category/);
  });

  it("returns html, text and subject for billing.payment-success", async () => {
    const result = await renderTemplate("billing.payment-success", {
      appName: "Test App",
      productName: "Pro Mensal",
      amountFormatted: "R$ 49,90",
      manageBillingUrl: "https://app.example.com/billing",
      unsubscribeUrl: baseProps.unsubscribeUrl,
      unsubscribeMailto: baseProps.unsubscribeMailto,
    });
    expect(result.subject).toBe("Test App — pagamento confirmado");
    expect(result.html).toContain("R$ 49,90");
    expect(result.html).toContain("Pro Mensal");
    expect(result.html).toContain("https://app.example.com/billing");
  });

  it("returns html, text and subject for billing.payment-failed", async () => {
    const result = await renderTemplate("billing.payment-failed", {
      appName: "Test App",
      attempt: 2,
      maxAttempts: 3,
      updatePaymentUrl: "https://app.example.com/billing/portal",
      unsubscribeUrl: baseProps.unsubscribeUrl,
      unsubscribeMailto: baseProps.unsubscribeMailto,
    });
    expect(result.subject).toBe("Test App — falha na cobrança");
    expect(result.html).toContain("tentativa");
    expect(result.html).toContain("2");
    expect(result.html).toContain("3");
    expect(result.html).toContain("Atualizar pagamento");
  });

  it("returns html, text and subject for billing.subscription-renewed", async () => {
    const result = await renderTemplate("billing.subscription-renewed", {
      appName: "Test App",
      productName: "Pro Mensal",
      nextBillingDate: "01/06/2026",
      manageBillingUrl: "https://app.example.com/billing",
      unsubscribeUrl: baseProps.unsubscribeUrl,
      unsubscribeMailto: baseProps.unsubscribeMailto,
    });
    expect(result.subject).toBe("Test App — assinatura renovada");
    expect(result.html).toContain("01/06/2026");
    expect(result.html).toContain("Pro Mensal");
  });

  it("returns html, text and subject for billing.subscription-canceled", async () => {
    const result = await renderTemplate("billing.subscription-canceled", {
      appName: "Test App",
      productName: "Pro Mensal",
      accessUntil: "30/05/2026",
      reactivateUrl: "https://app.example.com/billing",
      unsubscribeUrl: baseProps.unsubscribeUrl,
      unsubscribeMailto: baseProps.unsubscribeMailto,
    });
    expect(result.subject).toBe("Test App — assinatura cancelada");
    expect(result.html).toContain("30/05/2026");
    expect(result.html).toContain("Reativar assinatura");
  });

  it("returns html, text and subject for billing.credits-purchased", async () => {
    const result = await renderTemplate("billing.credits-purchased", {
      appName: "Test App",
      creditAmount: 5000,
      balanceAfter: 12500,
      dashboardUrl: "https://app.example.com/dashboard",
      unsubscribeUrl: baseProps.unsubscribeUrl,
      unsubscribeMailto: baseProps.unsubscribeMailto,
    });
    expect(result.subject).toBe("Test App — créditos adicionados");
    // Locale-aware thousands separator (pt-BR uses dot)
    expect(result.html).toContain("5.000");
    expect(result.html).toContain("12.500");
  });
});

describe("template snapshots", () => {
  it("VerificationEmail HTML matches snapshot", async () => {
    const html = await render(<VerificationEmail {...baseProps} />);
    expect(html).toMatchSnapshot();
  });

  it("VerificationEmail plain text matches snapshot", async () => {
    const text = await render(<VerificationEmail {...baseProps} />, { plainText: true });
    expect(text).toMatchSnapshot();
  });

  it("PasswordResetEmail HTML matches snapshot", async () => {
    const html = await render(<PasswordResetEmail {...baseProps} />);
    expect(html).toMatchSnapshot();
  });

  it("MagicLinkEmail HTML matches snapshot", async () => {
    const html = await render(<MagicLinkEmail {...baseProps} />);
    expect(html).toMatchSnapshot();
  });

  it("InvitationEmail HTML matches snapshot", async () => {
    const html = await render(
      <InvitationEmail {...baseProps} inviterName="Helena" organizationName="Escola X" />,
    );
    expect(html).toMatchSnapshot();
  });

  it("AccountDeletionEmail HTML matches snapshot", async () => {
    const html = await render(<AccountDeletionEmail {...baseProps} />);
    expect(html).toMatchSnapshot();
  });

  it("PaymentSuccessEmail HTML matches snapshot", async () => {
    const html = await render(
      <PaymentSuccessEmail
        appName="Test App"
        productName="Pro Mensal"
        amountFormatted="R$ 49,90"
        manageBillingUrl="https://app.example.com/billing"
        unsubscribeUrl={baseProps.unsubscribeUrl}
        unsubscribeMailto={baseProps.unsubscribeMailto}
      />,
    );
    expect(html).toMatchSnapshot();
  });

  it("PaymentFailedEmail HTML matches snapshot", async () => {
    const html = await render(
      <PaymentFailedEmail
        appName="Test App"
        attempt={2}
        maxAttempts={3}
        updatePaymentUrl="https://app.example.com/billing/portal"
        unsubscribeUrl={baseProps.unsubscribeUrl}
        unsubscribeMailto={baseProps.unsubscribeMailto}
      />,
    );
    expect(html).toMatchSnapshot();
  });

  it("SubscriptionRenewedEmail HTML matches snapshot", async () => {
    const html = await render(
      <SubscriptionRenewedEmail
        appName="Test App"
        productName="Pro Mensal"
        nextBillingDate="01/06/2026"
        manageBillingUrl="https://app.example.com/billing"
        unsubscribeUrl={baseProps.unsubscribeUrl}
        unsubscribeMailto={baseProps.unsubscribeMailto}
      />,
    );
    expect(html).toMatchSnapshot();
  });

  it("SubscriptionCanceledEmail HTML matches snapshot", async () => {
    const html = await render(
      <SubscriptionCanceledEmail
        appName="Test App"
        productName="Pro Mensal"
        accessUntil="30/05/2026"
        reactivateUrl="https://app.example.com/billing"
        unsubscribeUrl={baseProps.unsubscribeUrl}
        unsubscribeMailto={baseProps.unsubscribeMailto}
      />,
    );
    expect(html).toMatchSnapshot();
  });

  it("CreditsPurchasedEmail HTML matches snapshot", async () => {
    const html = await render(
      <CreditsPurchasedEmail
        appName="Test App"
        creditAmount={5000}
        balanceAfter={12500}
        dashboardUrl="https://app.example.com/dashboard"
        unsubscribeUrl={baseProps.unsubscribeUrl}
        unsubscribeMailto={baseProps.unsubscribeMailto}
      />,
    );
    expect(html).toMatchSnapshot();
  });
});
