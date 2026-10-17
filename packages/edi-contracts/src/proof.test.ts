import { generateKeyPairSync, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signRequestProof, verifyRequestProof } from "./proof";

describe("signed request proofs", () => {
  const pair = generateKeyPairSync("ed25519");
  const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKey = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const now = new Date();
  const expected = {
    audience: "https://edi.example.test/api/desktop",
    method: "POST" as const,
    path: "/api/desktop/activate" as const,
    userId: "owner",
    deviceId: randomUUID(),
    sessionId: null,
  };
  const body = JSON.stringify({ name: "Computer" });
  const proof = signRequestProof(
    { ...expected, iat: Math.floor(now.getTime() / 1000) },
    body,
    privateKey,
  );
  it("verifies the key, account, endpoint, session and exact body", () => {
    expect(verifyRequestProof(proof, body, publicKey, expected, now)?.nonce).toBeTruthy();
    expect(verifyRequestProof(proof, `${body} `, publicKey, expected, now)).toBeNull();
    expect(
      verifyRequestProof(proof, body, publicKey, { ...expected, userId: "other" }, now),
    ).toBeNull();
    expect(
      verifyRequestProof(proof, body, publicKey, { ...expected, path: "/api/desktop/logout" }, now),
    ).toBeNull();
    expect(
      verifyRequestProof(proof, body, publicKey, expected, new Date(now.getTime() + 121000)),
    ).toBeNull();
    expect(
      verifyRequestProof(proof, body, publicKey, expected, new Date(now.getTime() - 31000)),
    ).toBeNull();
  });
});
