export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailTemplateInput = {
  appName: string;
  url: string;
  unsubscribeUrl?: string;
  unsubscribeMailto?: string;
  preheader?: string;
};

export type EmailLayoutInput = {
  appName: string;
  preheader?: string;
  title: string;
  body: string;
  cta: { href: string; label: string };
  unsubscribeUrl?: string;
  unsubscribeMailto?: string;
};

export function verificationEmailHtml(input: EmailTemplateInput): string {
  return EmailLayout({
    appName: input.appName,
    preheader: input.preheader ?? `Confirme seu email para acessar o ${input.appName}.`,
    title: "Verifique seu email",
    body: `<p>Obrigado por se cadastrar no <strong>${escapeHtml(input.appName)}</strong>.</p>
<p>Confirme seu email clicando no botão abaixo. O link é de uso único e expira em breve.</p>`,
    cta: { href: input.url, label: "Confirmar email" },
    unsubscribeUrl: input.unsubscribeUrl,
    unsubscribeMailto: input.unsubscribeMailto,
  });
}

export function verificationEmailText({ appName, url }: EmailTemplateInput): string {
  return `Olá!

Obrigado por se cadastrar no ${appName}. Confirme seu email abrindo o link abaixo:

${url}

O link é de uso único e expira em breve.`;
}

export function passwordResetEmailHtml(input: EmailTemplateInput): string {
  return EmailLayout({
    appName: input.appName,
    preheader: input.preheader ?? `Recuperação de senha no ${input.appName}.`,
    title: "Recuperação de senha",
    body: `<p>Recebemos uma solicitação para redefinir sua senha no <strong>${escapeHtml(input.appName)}</strong>.</p>
<p>Se foi você, defina uma nova senha clicando no botão abaixo. Caso contrário, ignore este email.</p>`,
    cta: { href: input.url, label: "Definir nova senha" },
    unsubscribeUrl: input.unsubscribeUrl,
    unsubscribeMailto: input.unsubscribeMailto,
  });
}

export function passwordResetEmailText({ appName, url }: EmailTemplateInput): string {
  return `Olá!

Recebemos uma solicitação para redefinir sua senha no ${appName}. Se foi você, abra o link abaixo:

${url}

Se não foi você, ignore este email.`;
}

export function magicLinkEmailHtml(input: EmailTemplateInput): string {
  return EmailLayout({
    appName: input.appName,
    preheader: input.preheader ?? `Seu link de acesso para o ${input.appName}.`,
    title: "Seu link de acesso",
    body: `<p>Use o link abaixo para entrar no <strong>${escapeHtml(input.appName)}</strong>. O link é de uso único e expira em breve.</p>`,
    cta: { href: input.url, label: "Entrar" },
    unsubscribeUrl: input.unsubscribeUrl,
    unsubscribeMailto: input.unsubscribeMailto,
  });
}

export function magicLinkEmailText({ appName, url }: EmailTemplateInput): string {
  return `Olá!

Seu link de acesso para o ${appName}:

${url}

O link é de uso único e expira em breve.`;
}

export type InvitationEmailInput = {
  appName: string;
  inviterName: string;
  organizationName: string;
  url: string;
  unsubscribeUrl?: string;
  unsubscribeMailto?: string;
  preheader?: string;
};

export function invitationEmailHtml(input: InvitationEmailInput): string {
  return EmailLayout({
    appName: input.appName,
    preheader:
      input.preheader ??
      `${input.inviterName} convidou você para ${input.organizationName} no ${input.appName}.`,
    title: `Convite para ${input.organizationName}`,
    body: `<p><strong>${escapeHtml(input.inviterName)}</strong> convidou você para participar de <strong>${escapeHtml(input.organizationName)}</strong> no ${escapeHtml(input.appName)}.</p>
<p>Aceite o convite clicando no botão abaixo. O link expira em breve.</p>`,
    cta: { href: input.url, label: "Aceitar convite" },
    unsubscribeUrl: input.unsubscribeUrl,
    unsubscribeMailto: input.unsubscribeMailto,
  });
}

export function invitationEmailText(input: InvitationEmailInput): string {
  return `Olá!

${input.inviterName} convidou você para participar de ${input.organizationName} no ${input.appName}.

Aceite o convite no link abaixo:

${input.url}

O link expira em breve.`;
}

export function accountDeletionEmailHtml(input: EmailTemplateInput): string {
  return EmailLayout({
    appName: input.appName,
    preheader:
      input.preheader ?? `Confirme a exclusão da sua conta no ${input.appName}.`,
    title: "Confirme a exclusão da sua conta",
    body: `<p>Recebemos uma solicitação para excluir sua conta no <strong>${escapeHtml(input.appName)}</strong>.</p>
<p><strong>Esta ação é irreversível.</strong> Todos os seus dados serão removidos permanentemente.</p>
<p>Se foi você, confirme clicando no botão abaixo. O link expira em breve. Se não foi você, ignore este email — sua conta permanece ativa.</p>`,
    cta: { href: input.url, label: "Confirmar exclusão" },
    unsubscribeUrl: input.unsubscribeUrl,
    unsubscribeMailto: input.unsubscribeMailto,
  });
}

export function accountDeletionEmailText({ appName, url }: EmailTemplateInput): string {
  return `Olá!

Recebemos uma solicitação para excluir sua conta no ${appName}.

ESTA AÇÃO É IRREVERSÍVEL. Todos os seus dados serão removidos permanentemente.

Se foi você, confirme abrindo o link abaixo:

${url}

Se não foi você, ignore este email.`;
}

export function EmailLayout(input: EmailLayoutInput): string {
  const preheader = input.preheader
    ? `<div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">${escapeHtml(input.preheader)}</div>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f5f5f5; padding:24px; margin:0;">
    ${preheader}
    <div style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:12px; padding:32px;">
      <header style="margin-bottom:24px;">
        <p style="font-size:13px; font-weight:600; color:#374151; letter-spacing:0.04em; text-transform:uppercase; margin:0;">${escapeHtml(input.appName)}</p>
      </header>
      <h1 style="font-size:20px; margin:0 0 16px;">${escapeHtml(input.title)}</h1>
      ${input.body}
      <p style="margin:24px 0;">
        <a href="${input.cta.href}" style="display:inline-block; background:#111827; color:#ffffff; text-decoration:none; padding:12px 20px; border-radius:8px;">${escapeHtml(input.cta.label)}</a>
      </p>
      ${renderFooter(input)}
    </div>
  </body>
</html>`;
}

function renderFooter(input: EmailLayoutInput): string {
  const lines: string[] = [
    `<p style="font-size:12px; color:#6b7280; margin:0 0 8px;">${escapeHtml(input.appName)}</p>`,
  ];

  if (input.unsubscribeUrl) {
    lines.push(
      `<p style="font-size:12px; color:#6b7280; margin:0 0 8px;">Não quer mais receber este tipo de email? <a href="${input.unsubscribeUrl}" style="color:#6b7280; text-decoration:underline;">Cancele a assinatura</a>.</p>`,
    );
  }

  if (input.unsubscribeMailto) {
    lines.push(
      `<p style="font-size:11px; color:#9ca3af; margin:0;">Ou envie um email para <a href="mailto:${input.unsubscribeMailto}" style="color:#9ca3af; text-decoration:underline;">${escapeHtml(input.unsubscribeMailto)}</a>.</p>`,
    );
  }

  return `<footer style="margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb;">${lines.join("\n")}</footer>`;
}
