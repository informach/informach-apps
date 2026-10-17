import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { EDI_DESKTOP_APPS } from "@informach/config/edi-tools";
import type { DesktopAppId, InstallationManifest } from "@informach/edi-contracts";
import {
  signInstallation,
  verifyInstallationSignature,
} from "@informach/edi-contracts/release-signature";

const receiptPath = "resources/edi-installation.json";
export async function fileDigest(path: string) {
  const before = await stat(path);
  if (!before.isFile()) throw new Error("Expected an installation file");
  const digest = createHash("sha512");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    digest.update(chunk);
    size += chunk.length;
  }
  const after = await stat(path);
  if (
    size !== before.size ||
    size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.ino !== after.ino
  )
    throw new Error("Installation changed during verification");
  return { size, sha512: digest.digest("base64") };
}
/** A signed inventory is produced only after Electron packaging and fuse changes finish. */
export async function writeInstallationReceipt(options: {
  directory: string;
  appId: DesktopAppId;
  version: string;
  sourceCommit: string;
  keyId: string;
  privateKey: string;
}) {
  const files: InstallationManifest["files"] = [];
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = relative(options.directory, path).split("\\").join("/");
      if (entry.isSymbolicLink())
        throw new Error("Installation packages cannot contain symbolic links");
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && name !== receiptPath)
        files.push({ path: name, ...(await fileDigest(path)) });
      else if (!entry.isFile()) throw new Error("Unsupported package entry");
    }
  }
  await visit(options.directory);
  files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const signed = signInstallation(
    { appId: options.appId, version: options.version, sourceCommit: options.sourceCommit, files },
    options.keyId,
    options.privateKey,
  );
  await writeFile(join(options.directory, receiptPath), JSON.stringify(signed), { flag: "wx" });
  return signed;
}
/** Offline verification trusts compiled-in keys, never keys supplied by the receipt itself. */
export async function verifyInstalledApplication(options: {
  directory: string;
  appId: DesktopAppId;
  trustedKeys: Readonly<Record<string, string>>;
  version?: string;
  verifyFiles?: boolean;
}) {
  const root = await realpath(options.directory);
  const receipt = join(root, receiptPath);
  if ((await stat(receipt)).size > 2 * 1024 ** 2) throw new Error("Oversized installation receipt");
  const signed = verifyInstallationSignature(
    JSON.parse(await readFile(receipt, "utf8")),
    options.trustedKeys,
  );
  const manifest = signed.manifest;
  const application = EDI_DESKTOP_APPS.find((app) => app.id === options.appId);
  if (
    !application ||
    manifest.appId !== options.appId ||
    (options.version && manifest.version !== options.version) ||
    !manifest.files.some((file) => file.path === `${application.name}.exe`)
  )
    throw new Error("Installation identity mismatch");
  for (const file of options.verifyFiles === false ? [] : manifest.files) {
    const path = resolve(root, file.path);
    if ((await lstat(path)).isSymbolicLink())
      throw new Error("Installation symbolic link rejected");
    const canonical = await realpath(path);
    const child = relative(root, canonical);
    if (child.startsWith("..") || isAbsolute(child))
      throw new Error("Installation file outside its root");
    const digest = await fileDigest(canonical);
    if (digest.size !== file.size || digest.sha512 !== file.sha512)
      throw new Error("Installed application integrity check failed");
  }
  return manifest;
}
