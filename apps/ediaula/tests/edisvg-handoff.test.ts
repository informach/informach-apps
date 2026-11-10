import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  canOpenEdisvg,
  edisvgLauncher,
  handOffLesson,
  launchEnvironment,
  lessonProject,
  openEdisvg,
} from "../src/main/edisvgHandoff.ts";

let userData = "";
before(async () => {
  userData = await mkdtemp(join(tmpdir(), "ediaula-para-o-edisvg-"));
});
after(async () => {
  await rm(userData, { recursive: true, force: true });
});

const folder = () => join(userData, "para-o-edisvg");
// Absolute on every platform (lessonProject takes only an absolute lesson path).
const AULAS = join(tmpdir(), "Aulas", "DPJ Aula01");
const lesson = {
  id: "pifnvgomyinhw",
  name: " DPJ Aula01 gravação automática ",
  project: join(AULAS, "DPJ Aula01.edisvg"),
};

test("the lesson goes as a package, and the request is written after it, naming it", async () => {
  let requestWhilePacking = true;
  const out = await handOffLesson(
    userData,
    lesson,
    async (part) => {
      // While the package is made, no request points at it (EdiSVG would read half a ZIP).
      requestWhilePacking = existsSync(join(folder(), "pedido.json"));
      assert.match(part, /\.zip\.part$/);
      await writeFile(part, "zip");
    },
    1794300000000,
  );
  assert.equal(requestWhilePacking, false);
  assert.equal(out, join(folder(), "aula-pifnvgomyinhw-1794300000000.zip"));
  assert.equal(await readFile(out, "utf8"), "zip");
  assert.deepEqual(JSON.parse(await readFile(join(folder(), "pedido.json"), "utf8")), {
    version: 1,
    lessonId: "pifnvgomyinhw",
    name: "DPJ Aula01 gravação automática",
    file: "aula-pifnvgomyinhw-1794300000000.zip",
    sentAt: 1794300000000,
    // EdiSVG opens (or makes) the lesson's own project there.
    project: join(AULAS, "DPJ Aula01.edisvg"),
  });
});

test("the lesson's EdiSVG project goes beside the lesson file, with its name", () => {
  assert.equal(lessonProject(join(AULAS, "DPJ Aula01.ediaula")), join(AULAS, "DPJ Aula01.edisvg"));
  assert.equal(lessonProject("aula.ediaula"), undefined);
  assert.equal(lessonProject(join(AULAS, "aula.zip")), undefined);
});

test("a package that fails leaves nothing and keeps the request before it", async () => {
  await assert.rejects(
    handOffLesson(
      userData,
      lesson,
      async (part) => {
        await writeFile(part, "meio");
        throw new Error("Reconecte antes de empacotar: tela.mp4.");
      },
      1794300001000,
    ),
    /Reconecte/,
  );
  assert.deepEqual(await readdir(folder()), [
    "aula-pifnvgomyinhw-1794300000000.zip",
    "pedido.json",
  ]);
  const request = JSON.parse(await readFile(join(folder(), "pedido.json"), "utf8"));
  assert.equal(request.sentAt, 1794300000000);
});

test("only the newest package stays: older ones and half-made ones go", async () => {
  await writeFile(join(folder(), "aula-outra-1794200000000.zip.part"), "resto");
  await writeFile(join(folder(), "notas.txt"), "da pessoa");
  for (const at of [1794300002000, 1794300003000])
    await handOffLesson(userData, lesson, (part) => writeFile(part, "zip"), at);
  // EdiSVG keeps its own file of each package it took, so only the newest stays here.
  assert.deepEqual((await readdir(folder())).sort(), [
    "aula-pifnvgomyinhw-1794300003000.zip",
    // Only packages are cleaned: anything else in the folder stays.
    "notas.txt",
    "pedido.json",
  ]);
});

test("a lesson id EdiSVG cannot take is refused before anything is packed", async () => {
  let packed = false;
  await assert.rejects(
    handOffLesson(userData, { id: "../fora", name: "Aula" }, async () => {
      packed = true;
    }),
  );
  assert.equal(packed, false);
});

test("EdiSVG is opened where the Hub installs it, or by the development Hub's script", async () => {
  const local = join("C:", "Users", "x", "AppData", "Local");
  const repository = join("C:", "repo");
  const exe = join(local, "Programs", "Edi", "EdiSVG", "EdiSVG.exe");
  assert.deepEqual(edisvgLauncher(true, local, repository), {
    command: exe,
    args: [],
    needs: exe,
    hidden: false,
  });
  const script = join(repository, "scripts", "edi", "hub-dev", "abrir.ps1");
  assert.deepEqual(edisvgLauncher(false, local, repository), {
    command: "powershell.exe",
    args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Ferramenta", "edisvg"],
    cwd: repository,
    needs: script,
    hidden: true,
  });
  // Not there: nothing is started, and the request waits for EdiSVG.
  const missing = join(userData, "nao-existe", "EdiSVG.exe");
  assert.equal(
    await openEdisvg({ command: missing, args: [], needs: missing, hidden: false }),
    false,
  );
});

test("in development EdiSVG is opened only for EdiAula on the real profile, with its own settings", () => {
  const appData = join(tmpdir(), "Roaming");
  assert.equal(canOpenEdisvg(true, join(tmpdir(), "outro"), appData), true);
  // pnpm edi:work: the profile the EdiSVG of edi:work reads.
  assert.equal(canOpenEdisvg(false, join(appData, "ediaula"), appData), true);
  // edi:open or pnpm dev: a throwaway profile no EdiSVG looks at.
  assert.equal(canOpenEdisvg(false, join(tmpdir(), "edi-open", "user-data"), appData), false);
  // Electron's, Node's and the development license's settings stay with EdiAula.
  assert.deepEqual(
    launchEnvironment({
      PATH: "C:\\bin",
      APPDATA: appData,
      EDI_LICENSE_PUBLIC_KEYS: "{}",
      EDIAULA_USER_DATA: "x",
      EDISVG_USER_DATA: "y",
      ELECTRON_RUN_AS_NODE: "1",
      NODE_OPTIONS: "-r loader",
      npm_execpath: "pnpm.cjs",
    }),
    { PATH: "C:\\bin", APPDATA: appData },
  );
});
