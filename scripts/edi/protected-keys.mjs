import { execFileSync } from "node:child_process";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { windowsPowerShellEnvironment } from "../../packages/edi-desktop/src/windows-powershell.ts";

export function dpapi(value, decrypt = false) {
  if (process.platform !== "win32") throw new Error("DPAPI requires Windows");
  const script = decrypt
    ? "$s=ConvertTo-SecureString ([Console]::In.ReadToEnd());$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}"
    : "$s=ConvertTo-SecureString ([Console]::In.ReadToEnd()) -AsPlainText -Force;[Console]::Out.Write((ConvertFrom-SecureString $s))";
  try {
    return execFileSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(`$ErrorActionPreference='Stop'; ${script}`, "utf16le").toString("base64"),
      ],
      {
        input: value,
        encoding: "utf8",
        windowsHide: true,
        env: windowsPowerShellEnvironment(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch {
    throw new Error("Protected key operation failed; secret output suppressed");
  }
}

export function validateKeys(keys) {
  for (const name of ["update", "license"]) {
    const entry = keys?.[name];
    if (!entry || !/^[A-Za-z0-9._-]{1,80}$/.test(entry.id)) throw new Error("Invalid key identity");
    const privateKey = createPrivateKey(entry.privateKey);
    const publicKey = createPublicKey(entry.publicKey);
    if (privateKey.asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519")
      throw new Error("Edi requires Ed25519 keys");
    const probe = Buffer.from("edi-key-recovery-verification-v1");
    if (!verify(null, probe, publicKey, sign(null, probe, privateKey)))
      throw new Error("Key pair mismatch");
  }
  if (
    publicKeyBytes(keys.update.publicKey).equals(publicKeyBytes(keys.license.publicKey)) ||
    keys.update.id === keys.license.id
  )
    throw new Error("License and update keys must be separate");
  return keys;
}

function publicKeyBytes(pem) {
  return createPublicKey(pem.replaceAll("\\n", "\n")).export({ type: "spki", format: "der" });
}

export function assertKeyRingContinuity(raw, expected, { allowEmpty = true } = {}) {
  if (!raw && allowEmpty) return;
  try {
    const remote = JSON.parse(raw);
    if (!remote || typeof remote !== "object" || Array.isArray(remote)) throw new Error("keyring");
    const ids = Object.keys(remote);
    if (!allowEmpty && ids.length === 0) throw new Error("empty keyring");
    if (
      ids.length > 0 &&
      (ids.length !== 1 ||
        ids[0] !== expected.id ||
        !publicKeyBytes(remote[expected.id]).equals(publicKeyBytes(expected.publicKey)))
    )
      throw new Error("keyring");
  } catch {
    throw new Error("Signing keyring drift detected; use an explicit trust rotation");
  }
}

/** Bootstrap must never rotate an existing signing identity or drop trust anchors. */
export function assertBackendKeyContinuity(keys, current) {
  validateKeys(keys);
  try {
    if (current.EDI_LICENSE_KEY_ID && current.EDI_LICENSE_KEY_ID !== keys.license.id)
      throw new Error("identity");
    if (
      current.EDI_LICENSE_PRIVATE_KEY &&
      !publicKeyBytes(current.EDI_LICENSE_PRIVATE_KEY).equals(
        publicKeyBytes(keys.license.publicKey),
      )
    )
      throw new Error("license");
    assertKeyRingContinuity(current.EDI_UPDATE_PUBLIC_KEYS, keys.update);
  } catch {
    throw new Error(
      "Backend key drift detected; use an explicit trust rotation before provisioning",
    );
  }
}

function age(args, input) {
  try {
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: operational backup CLI is never run or cached by Turbo
    return execFileSync(process.env.EDI_AGE_BINARY || "age", args, {
      input,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    });
  } catch {
    throw new Error(
      "Portable backup operation failed; check age and recovery identity (secret output suppressed)",
    );
  }
}

export function encryptBackup(keys, recipientFile) {
  validateKeys(keys);
  return age(["--encrypt", "--recipients-file", recipientFile], Buffer.from(JSON.stringify(keys)));
}

export function decryptBackup(ciphertext, identityFile) {
  const plaintext = age(["--decrypt", "--identity", identityFile], ciphertext);
  try {
    return validateKeys(JSON.parse(plaintext.toString("utf8")));
  } finally {
    plaintext.fill(0);
  }
}
