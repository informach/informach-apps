import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execute = promisify(execFile);
const verificationScript = `
$ErrorActionPreference='Stop'
$sig=Get-AuthenticodeSignature -LiteralPath $env:EDI_VERIFY_TARGET
if ($sig.Status -ne 'Valid' -or !$sig.SignerCertificate -or !$sig.TimeStamperCertificate) { throw 'Invalid or untimestamped signature' }
if ($sig.SignerCertificate.Subject -cne $env:EDI_VERIFY_PUBLISHER) { throw 'Unexpected publisher' }
$info=(Get-Item -LiteralPath $env:EDI_VERIFY_TARGET).VersionInfo
@{ publisher=$sig.SignerCertificate.Subject; version=$info.ProductVersion; product=$info.ProductName } | ConvertTo-Json -Compress
`;
const signatureSchema = z.object({
  publisher: z.string(),
  version: z.string(),
  product: z.string(),
});
export async function verifyWindowsBinary(path: string, publisher: string) {
  if (process.platform !== "win32" || !publisher.includes("O=") || !publisher.includes("CN="))
    throw new Error("Windows signature verification requires a configured publisher");
  const result = await execute(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(verificationScript, "utf16le").toString("base64"),
    ],
    {
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 16384,
      env: { ...process.env, EDI_VERIFY_TARGET: path, EDI_VERIFY_PUBLISHER: publisher },
    },
  );
  return signatureSchema.parse(JSON.parse(result.stdout.trim()));
}
