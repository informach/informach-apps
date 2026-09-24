import { describe, expect, it } from "vitest";
import {
  generateInboxToken,
  INBOX_TOKEN_LENGTH,
  inboxAddress,
  senderDomain,
  tokenFromRecipient,
} from "./address";

describe("generateInboxToken", () => {
  it("has no characters that get confused when read out loud", () => {
    const token = generateInboxToken(() => 0.999999);
    expect(token).toHaveLength(INBOX_TOKEN_LENGTH);
    expect(token).not.toMatch(/[0O1IL]/);
  });
});

describe("tokenFromRecipient", () => {
  const domain = "recados.informach.com.br";
  it("reads the token from the envelope, with or without a display name", () => {
    expect(tokenFromRecipient(`recados+ABC23456XY@${domain}`, domain)).toBe("ABC23456XY");
    expect(tokenFromRecipient(`"Escola" <Recados+ABC23456XY@${domain}>`, domain)).toBe(
      "ABC23456XY",
    );
  });
  it("refuses anything that is not this domain's deposit address", () => {
    expect(tokenFromRecipient("recados+ABC23456XY@outrodominio.com", domain)).toBeNull();
    expect(tokenFromRecipient(`contato+ABC23456XY@${domain}`, domain)).toBeNull();
    expect(tokenFromRecipient(`recados@${domain}`, domain)).toBeNull();
    expect(tokenFromRecipient(`recados+abc@${domain}`, domain)).toBeNull();
    expect(tokenFromRecipient("", domain)).toBeNull();
  });
  it("builds the address it knows how to read back", () => {
    const token = generateInboxToken(() => 0.5);
    const address = inboxAddress(token, domain);
    expect(address.startsWith("recados+")).toBe(true);
    expect(tokenFromRecipient(address, domain)).toBe(token);
  });
});

describe("senderDomain", () => {
  it("keeps the domain and drops the person", () => {
    expect(senderDomain('"Profa. Marina" <marina@colegio.com.br>')).toBe("colegio.com.br");
    expect(senderDomain("marina@colegio.com.br")).toBe("colegio.com.br");
    expect(senderDomain("sem-arroba")).toBeNull();
  });
});
