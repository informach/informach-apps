import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assetLinkSchema,
  edisvgSummarySchema,
  linkRequestSchema,
  renderFileName,
  rendersManifestSchema,
} from "../src/contract.ts";
import { canOpenTool, launchEnvironment, openTool, toolLauncher } from "../src/launch.ts";
import {
  inside,
  readManifest,
  readRequests,
  removeRequest,
  renderPath,
  rendersDir,
  requestsDir,
  writeManifest,
  writeRequest,
} from "../src/node.ts";

let root = "";
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "edi-link-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const project = () => join(root, "Aulas", "DPJ Aula01.edisvg");

describe("contract", () => {
  it("takes the three requests, and refuses a path that is not an absolute .edisvg", () => {
    const base = { version: 1, id: "pedido-0001", from: "ediaula", project: project() } as const;
    expect(
      linkRequestSchema.parse({
        ...base,
        type: "create",
        name: "Parte 6",
        width: 1920,
        height: 1080,
        fps: 30,
        duration: 12.5,
      }).type,
    ).toBe("create");
    expect(
      linkRequestSchema.parse({ ...base, type: "open", animationId: "animation-a1" }).type,
    ).toBe("open");
    expect(linkRequestSchema.safeParse({ ...base, type: "open" }).success).toBe(false);
    expect(
      linkRequestSchema.safeParse({
        ...base,
        project: "aula.edisvg",
        type: "link",
        animationId: "animation-a",
      }).success,
    ).toBe(false);
    expect(
      linkRequestSchema.safeParse({
        ...base,
        project: join(root, "aula.ediaula"),
        type: "link",
        animationId: "animation-a",
      }).success,
    ).toBe(false);
  });

  it("names a render by its animation and hash, and the manifest lists each animation once", () => {
    expect(renderFileName("animation-a1", "0123456789abcdef")).toBe(
      "animation-a1-0123456789abcdef.webm",
    );
    const item = {
      animationId: "animation-a1",
      artboardId: "artboard-a1",
      name: "Parte 6",
      updatedAt: 1,
      render: {
        file: renderFileName("animation-a1", "0123456789abcdef"),
        width: 1920,
        height: 1080,
        fps: 30,
        frames: 300,
        duration: 10,
        hash: "0123456789abcdef",
      },
    };
    expect(
      rendersManifestSchema.parse({ version: 1, projectId: "project-x", items: [item] }).items,
    ).toHaveLength(1);
    expect(
      rendersManifestSchema.safeParse({ version: 1, projectId: "project-x", items: [item, item] })
        .success,
    ).toBe(false);
    // A render file is a name of the folder, never a path out of it.
    expect(
      rendersManifestSchema.safeParse({
        version: 1,
        projectId: "project-x",
        items: [{ ...item, render: { ...item.render, file: "..\\fora.webm" } }],
      }).success,
    ).toBe(false);
  });

  it("an asset link and a project summary read what another tool needs", () => {
    expect(
      assetLinkSchema.parse({ app: "edisvg", project: project(), requestId: "pedido-0001" }).app,
    ).toBe("edisvg");
    const summary = edisvgSummarySchema.parse({
      version: 26,
      id: "project-x",
      name: "Aula",
      artboards: [
        { id: "artboard-a1", name: "Parte 6", scene: { viewBox: [0, 0, 1920, 1080], nodes: [] } },
      ],
      motion: {
        animations: [{ id: "animation-a1", name: "Entrada", fps: 30, frames: 90, tracks: [] }],
      },
    });
    expect(summary.motion?.animations[0]?.name).toBe("Entrada");
  });
});

describe("disk", () => {
  it("puts requests in the tool's profile and renders beside the project", () => {
    expect(requestsDir(join(root, "Roaming"), "edisvg")).toBe(
      join(root, "Roaming", "edisvg", "pedidos"),
    );
    expect(rendersDir(project())).toBe(join(root, "Aulas", "DPJ Aula01 · renders"));
    const folder = rendersDir(project());
    expect(renderPath(folder, "animation-a1-0123456789abcdef.webm")).toBe(
      join(folder, "animation-a1-0123456789abcdef.webm"),
    );
    expect(() => renderPath(folder, "../fora.webm")).toThrow();
    expect(inside(folder, join(folder, "x.webm"))).toBe(true);
    expect(inside(folder, join(root, "x.webm"))).toBe(false);
  });

  it("a request is written whole and read oldest first; a broken one is removed", async () => {
    const folder = requestsDir(root, "edisvg");
    const first = await writeRequest(folder, {
      type: "open",
      from: "ediaula",
      project: project(),
      animationId: "animation-a1",
    });
    const second = await writeRequest(folder, {
      type: "link",
      from: "ediaula",
      project: project(),
      animationId: "animation-b2",
    });
    await utimes(join(folder, `${first.id}.json`), new Date(1000), new Date(1000));
    await writeFile(join(folder, "estragado.json"), "{");
    const pending = await readRequests(folder);
    expect(pending.map((p) => p.request.id)).toEqual([first.id, second.id]);
    expect((await readdir(folder)).sort()).toEqual(
      [`${first.id}.json`, `${second.id}.json`].sort(),
    );
    await removeRequest(pending[0]?.path ?? "");
    expect((await readRequests(folder)).map((p) => p.request.id)).toEqual([second.id]);
    // No folder yet: nothing waits.
    expect(await readRequests(join(root, "nada"))).toEqual([]);
  });

  it("a manifest is written whole and read back; none, or a broken one, reads as null", async () => {
    const folder = rendersDir(project());
    expect(await readManifest(folder)).toBeNull();
    const manifest = {
      version: 1 as const,
      projectId: "project-x",
      items: [
        { animationId: "animation-a1", artboardId: "artboard-a1", name: "Parte 6", updatedAt: 5 },
      ],
    };
    await writeManifest(folder, manifest);
    expect(await readManifest(folder)).toEqual(manifest);
    await writeFile(join(folder, "vinculos.json"), "{");
    expect(await readManifest(folder)).toBeNull();
    expect(await readFile(join(folder, "vinculos.json"), "utf8")).toBe("{");
  });
});

describe("launch", () => {
  it("opens the installed tool, or the development Hub's script, with a clean environment", async () => {
    const local = join(root, "Local");
    expect(
      toolLauncher(
        { id: "edisvg", name: "EdiSVG" },
        { packaged: true, localAppData: local, repository: root },
      ),
    ).toEqual({
      command: join(local, "Programs", "Edi", "EdiSVG", "EdiSVG.exe"),
      args: [],
      needs: join(local, "Programs", "Edi", "EdiSVG", "EdiSVG.exe"),
      hidden: false,
    });
    const dev = toolLauncher(
      { id: "edisvg", name: "EdiSVG" },
      { packaged: false, localAppData: local, repository: root },
    );
    expect(dev.command).toBe("powershell.exe");
    expect(dev.args.slice(-3)).toEqual([
      join(root, "scripts", "edi", "hub-dev", "abrir.ps1"),
      "-Ferramenta",
      "edisvg",
    ]);
    expect(canOpenTool(true, join(root, "tmp"), join(root, "Roaming"), "ediaula")).toBe(true);
    expect(
      canOpenTool(false, join(root, "Roaming", "ediaula"), join(root, "Roaming"), "ediaula"),
    ).toBe(true);
    expect(canOpenTool(false, join(root, "tmp"), join(root, "Roaming"), "ediaula")).toBe(false);
    expect(
      launchEnvironment({
        PATH: "x",
        EDI_LICENSE_PUBLIC_KEYS: "{}",
        EDIAULA_USER_DATA: "y",
        ELECTRON_RUN_AS_NODE: "1",
        NODE_OPTIONS: "-r a",
        npm_execpath: "pnpm",
      }),
    ).toEqual({ PATH: "x" });
    // Not there: nothing starts.
    expect(
      await openTool({
        command: join(root, "nao.exe"),
        args: [],
        needs: join(root, "nao.exe"),
        hidden: false,
      }),
    ).toBe(false);
  });
});
