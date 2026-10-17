import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { EDI_TOOLS, type EdiToolId } from "@informach/config/edi-tools";
import { compareReleaseVersions, type ReleaseManifest } from "@informach/edi-contracts";
import { fetchPublicRelease, githubResponse } from "@informach/edi-releases/public";
import { lock } from "proper-lockfile";
import type { DesktopConfig } from "./contracts";
import { type InstallationFileSystem, verifyInstalledApplication } from "./installation-integrity";

const execute = promisify(execFile);
export type Installation = {
  id: EdiToolId;
  installed: boolean;
  version: string | null;
  available: string | null;
  busy: boolean;
  error: string | null;
};
export function createInstallationManager(
  config: DesktopConfig & {
    localAppData: string;
    directory: string;
    acceptRelease: (manifest: ReleaseManifest) => Promise<void>;
    fileSystem: InstallationFileSystem;
  },
) {
  const busy = new Set<EdiToolId>();
  const errors = new Map<EdiToolId, string>();
  const executable = (id: EdiToolId) => {
    const tool = EDI_TOOLS.find((item) => item.id === id);
    if (!tool) throw new Error("Unknown Edi tool");
    return {
      tool,
      path: join(config.localAppData, "Programs", "Edi", tool.name, `${tool.name}.exe`),
    };
  };
  async function installed(id: EdiToolId, verifyFiles = true) {
    const file = executable(id);
    try {
      await access(file.path);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
    const receipt = await verifyInstalledApplication({
      directory: dirname(file.path),
      appId: id,
      trustedKeys: config.updateKeys,
      verifyFiles,
      fileSystem: config.fileSystem,
    });
    return receipt.version;
  }
  async function release() {
    const manifest = await fetchPublicRelease({
      repository: config.distributionRepository,
      trustedKeys: config.updateKeys,
      channel: config.updateChannel,
    });
    if (manifest) await config.acceptRelease(manifest);
    return manifest;
  }
  async function install(id: EdiToolId) {
    if (busy.has(id)) throw new Error("Já existe uma instalação em andamento.");
    if (config.environment !== "production")
      throw new Error(
        "Instaladores comerciais não estão disponíveis neste build de desenvolvimento.",
      );
    busy.add(id);
    errors.delete(id);
    let releaseLock: (() => Promise<void>) | undefined;
    let download: string | undefined;
    try {
      await mkdir(config.directory, { recursive: true, mode: 0o700 });
      // The same heartbeat lock is held for the complete lifetime of each tool.
      releaseLock = await lock(join(config.directory, `${id}.runtime`), {
        realpath: false,
        stale: 30000,
        update: 5000,
        retries: 0,
      });
      const manifest = await release();
      if (!manifest) throw new Error("Nenhum instalador homologado foi publicado.");
      const artifact = manifest.artifacts.find((item) => item.appId === id);
      if (!artifact || artifact.size > 2 * 1024 ** 3)
        throw new Error("Instalador inválido ou excessivamente grande.");
      const current = await installed(id);
      if (current && compareReleaseVersions(manifest.version, current) <= 0) return;
      download = join(config.directory, `${id}.${randomUUID()}.exe`);
      const response = await githubResponse(artifact.url);
      if (!response.ok || !response.body) throw new Error("Não foi possível baixar o instalador.");
      let size = 0;
      const digest = createHash("sha512");
      const verifier = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length;
          if (size > artifact.size) {
            callback(new Error("Downloaded artifact exceeds the declared size"));
            return;
          }
          digest.update(chunk);
          callback(null, chunk);
        },
      });
      const body = response.body;
      async function* chunks() {
        const reader = body.getReader();
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) return;
            yield part.value;
          }
        } finally {
          await reader.cancel();
          reader.releaseLock();
        }
      }
      await pipeline(
        Readable.from(chunks()),
        verifier,
        createWriteStream(download, { flags: "wx", mode: 0o600 }),
      );
      if (size !== artifact.size || digest.digest("base64") !== artifact.sha512)
        throw new Error("A integridade do instalador não confere.");
      await execute(download, ["/S"], { windowsHide: true, timeout: 600000 });
      const receipt = await verifyInstalledApplication({
        directory: dirname(executable(id).path),
        appId: id,
        version: manifest.version,
        trustedKeys: config.updateKeys,
        fileSystem: config.fileSystem,
      });
      if (receipt.sourceCommit !== manifest.sourceCommit)
        throw new Error("O instalador terminou sem confirmar a versão esperada.");
    } catch (error) {
      const message =
        error instanceof Error && "code" in error && error.code === "ELOCKED"
          ? "Feche esta ferramenta para instalar a atualização. Seu trabalho não será interrompido."
          : error instanceof Error
            ? error.message
            : "Falha na instalação";
      errors.set(id, message);
      throw new Error(message, { cause: error });
    } finally {
      try {
        if (download) await rm(download, { force: true });
      } finally {
        try {
          if (releaseLock) await releaseLock();
        } finally {
          busy.delete(id);
        }
      }
    }
  }
  return {
    async list(): Promise<Installation[]> {
      let manifest: Awaited<ReturnType<typeof release>> = null;
      let catalogError: string | null = null;
      try {
        manifest = await release();
      } catch {
        catalogError =
          "Catálogo indisponível. As ferramentas instaladas continuam acessíveis com uma licença válida.";
      }
      return Promise.all(
        EDI_TOOLS.map(async (tool) => {
          let version: string | null = null;
          let error = errors.get(tool.id) ?? catalogError;
          try {
            version = await installed(tool.id, false);
          } catch {
            error = "A instalação existente não passou na verificação de integridade.";
          }
          return {
            id: tool.id,
            installed: Boolean(version),
            version,
            available: manifest?.version ?? null,
            busy: busy.has(tool.id),
            error,
          };
        }),
      );
    },
    install,
    async open(id: EdiToolId) {
      if (!(await installed(id))) throw new Error("Instale a ferramenta antes de abri-la.");
      const child = spawn(executable(id).path, [], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      child.unref();
    },
    async updateInstalled() {
      for (const tool of EDI_TOOLS) {
        try {
          if (await installed(tool.id)) await install(tool.id);
        } catch (error) {
          errors.set(tool.id, error instanceof Error ? error.message : "Atualização indisponível");
        }
      }
    },
  };
}
