import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { renderTemplate } from "../templates";
import { AccountDeletionEmail } from "../templates/accountDeletion";
import { InvitationEmail } from "../templates/invitation";
import { MagicLinkEmail } from "../templates/magicLink";
import { PasswordResetEmail } from "../templates/passwordReset";
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
});
