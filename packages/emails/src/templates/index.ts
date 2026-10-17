import { render } from "@react-email/render";
import { createElement, type ReactElement } from "react";
import { AccountDeletionEmail, type AccountDeletionEmailProps } from "./accountDeletion";
import { AdminAlertEmail, type AdminAlertEmailProps } from "./adminAlert";
import { AdminWeeklySummaryEmail, type AdminWeeklySummaryEmailProps } from "./adminWeeklySummary";
import {
  BillingCreditsWarningEmail,
  type BillingCreditsWarningEmailProps,
} from "./billingCreditsWarning";
import { CreditsPurchasedEmail, type CreditsPurchasedEmailProps } from "./creditsPurchased";
import { ForgetPasswordEmailOtp, type ForgetPasswordEmailOtpProps } from "./forgetPasswordEmailOtp";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "./i18n";
import { InvitationEmail, type InvitationEmailProps } from "./invitation";
import { MagicLinkEmail, type MagicLinkEmailProps } from "./magicLink";
import { PasswordResetEmail, type PasswordResetEmailProps } from "./passwordReset";
import { PaymentFailedEmail, type PaymentFailedEmailProps } from "./paymentFailed";
import { PaymentSuccessEmail, type PaymentSuccessEmailProps } from "./paymentSuccess";
import { SignInEmailOtp, type SignInEmailOtpProps } from "./signInEmailOtp";
import {
  SignupAttemptOnExistingEmail,
  type SignupAttemptOnExistingEmailProps,
} from "./signupAttemptOnExisting";
import {
  SubscriptionCanceledEmail,
  type SubscriptionCanceledEmailProps,
} from "./subscriptionCanceled";
import {
  SubscriptionRenewedEmail,
  type SubscriptionRenewedEmailProps,
} from "./subscriptionRenewed";
import { VerificationEmail, type VerificationEmailProps } from "./verification";
import { VerifyEmailOtp, type VerifyEmailOtpProps } from "./verifyEmailOtp";

export { AccountDeletionEmail } from "./accountDeletion";
export { AdminAlertEmail } from "./adminAlert";
export { AdminWeeklySummaryEmail } from "./adminWeeklySummary";
export {
  BillingCreditsWarningEmail,
  type CreditsWarningThreshold,
} from "./billingCreditsWarning";
export { CreditsPurchasedEmail } from "./creditsPurchased";
export { EmailLayout } from "./EmailLayout";
export { ForgetPasswordEmailOtp } from "./forgetPasswordEmailOtp";
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
export { SignInEmailOtp } from "./signInEmailOtp";
export { SignupAttemptOnExistingEmail } from "./signupAttemptOnExisting";
export { SubscriptionCanceledEmail } from "./subscriptionCanceled";
export { SubscriptionRenewedEmail } from "./subscriptionRenewed";
export { VerificationEmail } from "./verification";
export { VerifyEmailOtp } from "./verifyEmailOtp";
export type {
  AccountDeletionEmailProps,
  AdminAlertEmailProps,
  AdminWeeklySummaryEmailProps,
  BillingCreditsWarningEmailProps,
  CreditsPurchasedEmailProps,
  ForgetPasswordEmailOtpProps,
  InvitationEmailProps,
  MagicLinkEmailProps,
  PasswordResetEmailProps,
  PaymentFailedEmailProps,
  PaymentSuccessEmailProps,
  SignInEmailOtpProps,
  SignupAttemptOnExistingEmailProps,
  SubscriptionCanceledEmailProps,
  SubscriptionRenewedEmailProps,
  VerificationEmailProps,
  VerifyEmailOtpProps,
};

export type EmailCategory =
  | "admin.alert"
  | "admin.weekly-summary"
  | "auth.verify-email"
  | "auth.verify-email-otp"
  | "auth.sign-in-otp"
  | "auth.forget-password-otp"
  | "auth.password-reset"
  | "auth.magic-link"
  | "auth.invitation"
  | "auth.account-deletion"
  | "auth.signup-attempt-on-existing"
  | "billing.payment-success"
  | "billing.payment-failed"
  | "billing.subscription-renewed"
  | "billing.subscription-canceled"
  | "billing.credits-purchased"
  | "billing.credits-warning";

export type RenderTemplatePropsByCategory = {
  "admin.alert": AdminAlertEmailProps;
  "admin.weekly-summary": AdminWeeklySummaryEmailProps;
  "auth.verify-email": VerificationEmailProps;
  "auth.verify-email-otp": VerifyEmailOtpProps;
  "auth.sign-in-otp": SignInEmailOtpProps;
  "auth.forget-password-otp": ForgetPasswordEmailOtpProps;
  "auth.password-reset": PasswordResetEmailProps;
  "auth.magic-link": MagicLinkEmailProps;
  "auth.invitation": InvitationEmailProps;
  "auth.account-deletion": AccountDeletionEmailProps;
  "auth.signup-attempt-on-existing": SignupAttemptOnExistingEmailProps;
  "billing.payment-success": PaymentSuccessEmailProps;
  "billing.payment-failed": PaymentFailedEmailProps;
  "billing.subscription-renewed": SubscriptionRenewedEmailProps;
  "billing.subscription-canceled": SubscriptionCanceledEmailProps;
  "billing.credits-purchased": CreditsPurchasedEmailProps;
  "billing.credits-warning": BillingCreditsWarningEmailProps;
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
  | "adminAlert"
  | "adminWeeklySummary"
  | "verification"
  | "verifyEmailOtp"
  | "signInEmailOtp"
  | "forgetPasswordEmailOtp"
  | "passwordReset"
  | "magicLink"
  | "invitation"
  | "accountDeletion"
  | "signupAttemptOnExisting"
  | "paymentSuccess"
  | "paymentFailed"
  | "subscriptionRenewed"
  | "subscriptionCanceled"
  | "creditsPurchased"
  | "billingCreditsWarning";

type CategoryEntry<Category extends EmailCategory> = {
  component: (props: RenderTemplatePropsByCategory[Category]) => ReactElement;
  subjectNamespace: SubjectNamespace;
  subjectValues: (props: RenderTemplatePropsByCategory[Category]) => Record<string, string>;
};

const CATEGORY_REGISTRY: {
  [Category in EmailCategory]: CategoryEntry<Category>;
} = {
  "admin.alert": {
    component: AdminAlertEmail,
    subjectNamespace: "adminAlert",
    subjectValues: ({ kind, serviceName }) => ({ kind, serviceName }),
  },
  "admin.weekly-summary": {
    component: AdminWeeklySummaryEmail,
    subjectNamespace: "adminWeeklySummary",
    subjectValues: ({ weekLabel }) => ({ weekLabel }),
  },
  "auth.verify-email": {
    component: VerificationEmail,
    subjectNamespace: "verification",
    subjectValues: ({ appName }) => ({ appName }),
  },
  "auth.verify-email-otp": {
    component: VerifyEmailOtp,
    subjectNamespace: "verifyEmailOtp",
    subjectValues: ({ appName }) => ({ appName }),
  },
  "auth.sign-in-otp": {
    component: SignInEmailOtp,
    subjectNamespace: "signInEmailOtp",
    subjectValues: ({ appName }) => ({ appName }),
  },
  "auth.forget-password-otp": {
    component: ForgetPasswordEmailOtp,
    subjectNamespace: "forgetPasswordEmailOtp",
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
  "auth.signup-attempt-on-existing": {
    component: SignupAttemptOnExistingEmail,
    subjectNamespace: "signupAttemptOnExisting",
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
  "billing.credits-warning": {
    component: BillingCreditsWarningEmail,
    subjectNamespace: "billingCreditsWarning",
    subjectValues: ({ appName, remaining, total }) => ({
      appName,
      remaining: String(remaining),
      total: String(total),
    }),
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

/**
 * Renders an app-owned element (built on `EmailLayout`) to html and plain
 * text. For bodies that are assembled per send and never persisted, such as a
 * weekly report about a child, and therefore have no category template here.
 */
export async function renderEmailElement(element: ReactElement) {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
