import { describe, expect, it } from "vitest";
import {
  accountDeletionEmailHtml,
  EmailLayout,
  escapeHtml,
  invitationEmailHtml,
  invitationEmailText,
  magicLinkEmailHtml,
  magicLinkEmailText,
  passwordResetEmailHtml,
  passwordResetEmailText,
  verificationEmailHtml,
  verificationEmailText,
} from "../templates";

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#39;");
  });

  it("escapes ampersand first to avoid double-escaping", () => {
    expect(escapeHtml("&<>")).toBe("&amp;&lt;&gt;");
  });

  it("preserves benign characters and unicode", () => {
    expect(escapeHtml("Olá, 你好 🌎")).toBe("Olá, 你好 🌎");
  });

  it("escapes a payload containing all special chars at once", () => {
    expect(escapeHtml(`<img src="x" onerror='alert(1)'/>`)).toBe(
      "&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;/&gt;",
    );
  });
});

describe("verificationEmailHtml", () => {
  const url = "https://app.example.com/verify?token=abc&def=1";
  const appName = "Agenda <da Turma>";

  it("includes the verification URL in the CTA href", () => {
    const html = verificationEmailHtml({ appName, url });
    expect(html).toContain(`href="${url}"`);
  });

  it("escapes the appName everywhere it appears", () => {
    const html = verificationEmailHtml({ appName, url });
    expect(html).toContain("Agenda &lt;da Turma&gt;");
    expect(html).not.toContain("Agenda <da Turma>");
  });

  it("renders the expected CTA label", () => {
    const html = verificationEmailHtml({ appName, url });
    expect(html).toContain(">Confirmar email<");
  });

  it("renders the unsubscribe link in the footer when provided", () => {
    const html = verificationEmailHtml({
      appName: "Cozya",
      url,
      unsubscribeUrl: "https://x/unsub",
      unsubscribeMailto: "unsubscribe@cozya.test",
    });
    expect(html).toContain("https://x/unsub");
    expect(html).toContain("Cancele a assinatura");
    expect(html).toContain("mailto:unsubscribe@cozya.test");
  });

  it("omits the unsubscribe block when no URL is given", () => {
    const html = verificationEmailHtml({ appName: "Cozya", url });
    expect(html).not.toContain("Cancele a assinatura");
  });

  it("includes a hidden preheader by default", () => {
    const html = verificationEmailHtml({ appName: "Cozya", url });
    expect(html).toContain("display:none");
    expect(html).toContain("Confirme seu email para acessar o Cozya");
  });
});

describe("verificationEmailText", () => {
  it("includes the URL on its own line and the appName", () => {
    const text = verificationEmailText({ appName: "Cozya", url: "https://x/y" });
    expect(text).toContain("Cozya");
    expect(text).toContain("\nhttps://x/y\n");
  });
});

describe("passwordResetEmailHtml", () => {
  const url = "https://app.example.com/reset?token=abc";

  it("includes the reset URL and CTA label", () => {
    const html = passwordResetEmailHtml({ appName: "Cozya", url });
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain(">Definir nova senha<");
  });

  it("references the appName", () => {
    const html = passwordResetEmailHtml({ appName: "Cozya", url });
    expect(html).toContain("Cozya");
  });

  it("renders the unsubscribe link when provided", () => {
    const html = passwordResetEmailHtml({
      appName: "Cozya",
      url,
      unsubscribeUrl: "https://x/unsub",
    });
    expect(html).toContain("https://x/unsub");
  });
});

describe("passwordResetEmailText", () => {
  it("contains the URL", () => {
    const text = passwordResetEmailText({ appName: "Cozya", url: "https://x/y" });
    expect(text).toContain("https://x/y");
  });
});

describe("magicLinkEmailHtml", () => {
  const url = "https://app.example.com/magic?token=abc";

  it("includes the magic link URL and CTA", () => {
    const html = magicLinkEmailHtml({ appName: "Cozya", url });
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain(">Entrar<");
  });

  it("renders unsubscribe link in the footer when provided", () => {
    const html = magicLinkEmailHtml({
      appName: "Cozya",
      url,
      unsubscribeUrl: "https://x/unsub",
    });
    expect(html).toContain("https://x/unsub");
    expect(html).toContain("Cancele a assinatura");
  });
});

describe("magicLinkEmailText", () => {
  it("contains the URL", () => {
    const text = magicLinkEmailText({ appName: "Cozya", url: "https://x/y" });
    expect(text).toContain("https://x/y");
  });
});

describe("invitationEmailHtml", () => {
  const url = "https://app.example.com/accept-invitation/inv1";

  it("includes inviter name, organization name, and accept URL", () => {
    const html = invitationEmailHtml({
      appName: "Agenda da Turma",
      inviterName: "Helena",
      organizationName: "EM Anchieta",
      url,
    });
    expect(html).toContain("Helena");
    expect(html).toContain("EM Anchieta");
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain(">Aceitar convite<");
  });

  it("escapes evil inviter and organization names", () => {
    const html = invitationEmailHtml({
      appName: "Agenda da Turma",
      inviterName: "<script>alert(1)</script>",
      organizationName: "<bad>",
      url,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;bad&gt;");
  });

  it("renders the unsubscribe link when provided", () => {
    const html = invitationEmailHtml({
      appName: "Agenda da Turma",
      inviterName: "Helena",
      organizationName: "EM Anchieta",
      url,
      unsubscribeUrl: "https://x/unsub",
    });
    expect(html).toContain("https://x/unsub");
    expect(html).toContain("Cancele a assinatura");
  });
});

describe("invitationEmailText", () => {
  it("contains inviter, organization, and URL", () => {
    const text = invitationEmailText({
      appName: "Agenda da Turma",
      inviterName: "Helena",
      organizationName: "EM Anchieta",
      url: "https://x/y",
    });
    expect(text).toContain("Helena");
    expect(text).toContain("EM Anchieta");
    expect(text).toContain("https://x/y");
  });
});

describe("template snapshots (regression guard)", () => {
  const SNAP_INPUT = {
    appName: "Cozya",
    url: "https://app.example.com/verify?token=abc",
    unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=tok",
    unsubscribeMailto: "unsubscribe@cozya.test",
  };

  it("verificationEmailHtml produces a stable HTML output", () => {
    expect(verificationEmailHtml(SNAP_INPUT)).toMatchSnapshot();
  });

  it("passwordResetEmailHtml produces a stable HTML output", () => {
    expect(passwordResetEmailHtml(SNAP_INPUT)).toMatchSnapshot();
  });

  it("magicLinkEmailHtml produces a stable HTML output", () => {
    expect(magicLinkEmailHtml(SNAP_INPUT)).toMatchSnapshot();
  });

  it("invitationEmailHtml produces a stable HTML output", () => {
    expect(
      invitationEmailHtml({
        appName: "Agenda da Turma",
        inviterName: "Helena",
        organizationName: "EM Anchieta",
        url: "https://app.example.com/accept-invitation/inv1",
        unsubscribeUrl: SNAP_INPUT.unsubscribeUrl,
        unsubscribeMailto: SNAP_INPUT.unsubscribeMailto,
      }),
    ).toMatchSnapshot();
  });

  it("accountDeletionEmailHtml produces a stable HTML output", () => {
    expect(accountDeletionEmailHtml(SNAP_INPUT)).toMatchSnapshot();
  });
});

describe("EmailLayout", () => {
  it("renders title, body, CTA, and a custom preheader", () => {
    const html = EmailLayout({
      appName: "Cozya",
      preheader: "Custom preheader text",
      title: "Hello",
      body: "<p>World</p>",
      cta: { href: "https://x", label: "Click" },
    });
    expect(html).toContain("Custom preheader text");
    expect(html).toContain(">Hello<");
    expect(html).toContain("<p>World</p>");
    expect(html).toContain('href="https://x"');
    expect(html).toContain(">Click<");
  });

  it("escapes the appName in the header", () => {
    const html = EmailLayout({
      appName: "<Evil>",
      title: "x",
      body: "",
      cta: { href: "#", label: "y" },
    });
    expect(html).toContain("&lt;Evil&gt;");
    expect(html).not.toContain("<Evil>");
  });

  it("does not render the unsubscribe paragraph when both fields are missing", () => {
    const html = EmailLayout({
      appName: "Cozya",
      title: "x",
      body: "",
      cta: { href: "#", label: "y" },
    });
    expect(html).not.toContain("Cancele a assinatura");
    expect(html).not.toContain("mailto:");
  });
});
