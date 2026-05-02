import { render } from "@react-email/render";
import { createElement, type ReactElement } from "react";
import { AccountDeletionEmail, type AccountDeletionEmailProps } from "./accountDeletion";
import { CreditsPurchasedEmail, type CreditsPurchasedEmailProps } from "./creditsPurchased";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";
import { InvitationEmail, type InvitationEmailProps } from "./invitation";
import { MagicLinkEmail, type MagicLinkEmailProps } from "./magicLink";
import { PasswordResetEmail, type PasswordResetEmailProps } from "./passwordReset";
import { PaymentFailedEmail, type PaymentFailedEmailProps } from "./paymentFailed";
import { PaymentSuccessEmail, type PaymentSuccessEmailProps } from "./paymentSuccess";
import {
  SubscriptionCanceledEmail,
  type SubscriptionCanceledEmailProps,
} from "./subscriptionCanceled";
import {
  SubscriptionRenewedEmail,
  type SubscriptionRenewedEmailProps,
} from "./subscriptionRenewed";
import { VerificationEmail, type VerificationEmailProps } from "./verification";

export { AccountDeletionEmail } from "./accountDeletion";
export { CreditsPurchasedEmail } from "./creditsPurchased";
export { EmailLayout } from "./EmailLayout";
export {
  DEFAULT_LOCALE,
  type Locale,
  SUPPORTED_LOCALES,
} from "./i18n";
export { InvitationEmail } from "./invitation";
export { MagicLinkEmail } from "./magicLink";
export { PasswordResetEmail } from "./passwordReset";
export { PaymentFailedEmail } from "./paymentFailed";
export { PaymentSuccessEmail } from "./paymentSuccess";
export { SubscriptionCanceledEmail } from "./subscriptionCanceled";
export { SubscriptionRenewedEmail } from "./subscriptionRenewed";
export { VerificationEmail } from "./verification";
export type {
  AccountDeletionEmailProps,
  CreditsPurchasedEmailProps,
  InvitationEmailProps,
  MagicLinkEmailProps,
  PasswordResetEmailProps,
  PaymentFailedEmailProps,
  PaymentSuccessEmailProps,
  SubscriptionCanceledEmailProps,
  SubscriptionRenewedEmailProps,
  VerificationEmailProps,
};

export type EmailCategory =
  | "auth.verify-email"
  | "auth.password-reset"
  | "auth.magic-link"
  | "auth.invitation"
  | "auth.account-deletion"
  | "billing.payment-success"
  | "billing.payment-failed"
  | "billing.subscription-renewed"
  | "billing.subscription-canceled"
  | "billing.credits-purchased";

export type RenderTemplatePropsByCategory = {
  "auth.verify-email": VerificationEmailProps;
  "auth.password-reset": PasswordResetEmailProps;
  "auth.magic-link": MagicLinkEmailProps;
  "auth.invitation": InvitationEmailProps;
  "auth.account-deletion": AccountDeletionEmailProps;
  "billing.payment-success": PaymentSuccessEmailProps;
  "billing.payment-failed": PaymentFailedEmailProps;
  "billing.subscription-renewed": SubscriptionRenewedEmailProps;
  "billing.subscription-canceled": SubscriptionCanceledEmailProps;
  "billing.credits-purchased": CreditsPurchasedEmailProps;
};

export type RenderTemplateResult = {
  html: string;
  text: string;
  subject: string;
};

export type RenderTemplate = <Category extends EmailCategory>(
  category: Category,
  props: RenderTemplatePropsByCategory[Category],
) => Promise<RenderTemplateResult>;

type SubjectNamespace =
  | "verification"
  | "passwordReset"
  | "magicLink"
  | "invitation"
  | "accountDeletion"
  | "paymentSuccess"
  | "paymentFailed"
  | "subscriptionRenewed"
  | "subscriptionCanceled"
  | "creditsPurchased";

type CategoryEntry<Category extends EmailCategory> = {
  component: (props: RenderTemplatePropsByCategory[Category]) => ReactElement;
  subjectNamespace: SubjectNamespace;
  subjectValues: (props: RenderTemplatePropsByCategory[Category]) => Record<string, string>;
};

const CATEGORY_REGISTRY: {
  [Category in EmailCategory]: CategoryEntry<Category>;
} = {
  "auth.verify-email": {
    component: VerificationEmail,
    subjectNamespace: "verification",
    subjectValues: ({ appName }) => ({ appName }),
  },
  "auth.password-reset": {
    component: PasswordResetEmail,
    subjectNamespace: "passwordReset",
    subjectValues: ({ appName }) => ({ appName }),
  },
  "auth.magic-link": {
    component: MagicLinkEmail,
    subjectNamespace: "magicLink",
    subjectValues: ({ appName }) => ({ appName }),
  },
  "auth.invitation": {
    component: InvitationEmail,
    subjectNamespace: "invitation",
    subjectValues: ({ appName, organizationName }) => ({
      appName,
      organizationName,
    }),
  },
  "auth.account-deletion": {
    component: AccountDeletionEmail,
    subjectNamespace: "accountDeletion",
    subjectValues: ({ appName }) => ({ appName }),
  },
  "billing.payment-success": {
    component: PaymentSuccessEmail,
    subjectNamespace: "paymentSuccess",
    subjectValues: ({ appName }) => ({ appName }),
  },
  "billing.payment-failed": {
    component: PaymentFailedEmail,
    subjectNamespace: "paymentFailed",
    subjectValues: ({ appName }) => ({ appName }),
  },
  "billing.subscription-renewed": {
    component: SubscriptionRenewedEmail,
    subjectNamespace: "subscriptionRenewed",
    subjectValues: ({ appName, productName }) => ({ appName, productName }),
  },
  "billing.subscription-canceled": {
    component: SubscriptionCanceledEmail,
    subjectNamespace: "subscriptionCanceled",
    subjectValues: ({ appName, productName }) => ({ appName, productName }),
  },
  "billing.credits-purchased": {
    component: CreditsPurchasedEmail,
    subjectNamespace: "creditsPurchased",
    subjectValues: ({ appName }) => ({ appName }),
  },
};

export const renderTemplate: RenderTemplate = async (category, props) => {
  const entry = CATEGORY_REGISTRY[category] as CategoryEntry<typeof category>;
  if (!entry) {
    throw new Error(`renderTemplate: unknown category "${category}"`);
  }

  const locale: Locale = (props as { locale?: Locale }).locale ?? DEFAULT_LOCALE;

  const element = createElement(entry.component, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  const t = getTranslator(entry.subjectNamespace, locale) as unknown as (
    key: string,
    values: Record<string, string>,
  ) => string;
  const subject = t("subject", entry.subjectValues(props));

  return { html, text, subject };
};
