export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`@informach/emails: ${feature} is not implemented yet`);
    this.name = "NotImplementedError";
  }
}

export type EmailAddress = string;

export type SendEmailInput = {
  to: EmailAddress | EmailAddress[];
  subject: string;
  html?: string;
  text?: string;
  from?: EmailAddress;
};

export async function sendEmail(_input: SendEmailInput): Promise<void> {
  throw new NotImplementedError("sendEmail");
}

export async function sendWelcomeEmail(_to: EmailAddress, _userName: string): Promise<void> {
  throw new NotImplementedError("sendWelcomeEmail");
}

export async function sendPaymentConfirmationEmail(
  _to: EmailAddress,
  _amount: number,
  _productName: string,
): Promise<void> {
  throw new NotImplementedError("sendPaymentConfirmationEmail");
}

export async function sendAccessGrantedEmail(
  _to: EmailAddress,
  _productName: string,
): Promise<void> {
  throw new NotImplementedError("sendAccessGrantedEmail");
}
