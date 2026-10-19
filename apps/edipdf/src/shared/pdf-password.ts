import { z } from "zod";

/** Never let a C string boundary silently change the password supplied by the user. */
export function pdfPasswordProblem(value: string, creating = false): string | undefined {
  if (value.length > 127)
    return creating
      ? "Use até 127 bytes UTF-8 na senha; acentos e símbolos podem ocupar mais de um byte."
      : "A senha excede o limite local de 127 caracteres.";
  if (value.includes("\0")) return "A senha não pode conter o caractere nulo.";
  const bytes = new TextEncoder().encode(value);
  if (new TextDecoder("utf-8", { fatal: true }).decode(bytes) !== value)
    return "A senha contém uma sequência Unicode inválida.";
  if (creating && bytes.length > 127)
    return "Use até 127 bytes UTF-8 na senha; acentos e símbolos podem ocupar mais de um byte.";
  return undefined;
}

export const pdfOpeningPasswordSchema = z.string().superRefine((value, context) => {
  const problem = pdfPasswordProblem(value);
  if (problem) context.addIssue({ code: "custom", message: problem });
});
export const pdfNewPasswordSchema = z
  .string()
  .min(1, "Digite uma senha.")
  .superRefine((value, context) => {
    const problem = pdfPasswordProblem(value, true);
    if (problem) context.addIssue({ code: "custom", message: problem });
  });

/** PDFium also tries Latin-1 bytes as UTF-8; an opening password must not match the owner through that path. */
export function distinctPdfPasswords(user: string, owner: string): boolean {
  const alternate = Array.from(new TextEncoder().encode(user), (byte) =>
    String.fromCharCode(byte),
  ).join("");
  return user !== owner && alternate !== owner;
}
