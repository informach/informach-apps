const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
async function pack() {
  const root = path.resolve(__dirname, "..");
  const electron = path.dirname(require("electron"));
  const version = require("../package.json").version;
  const folder = `EdiCaptura-Windows-${version}`;
  const output = path.join(root, "release", folder);
  await fs.mkdir(output, { recursive: true });
  await fs.cp(electron, output, { recursive: true, filter: (source) => !source.endsWith(".log") });
  await fs.rm(path.join(output, "debug.log"), { force: true });
  const dest = path.join(output, "resources", "app");
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(path.join(root, "src"), path.join(dest, "src"), {
    recursive: true,
    filter: (source) => !source.endsWith(".test.cjs"),
  });
  await fs.copyFile(path.join(root, "package.json"), path.join(dest, "package.json"));
  await fs.copyFile(path.join(root, "README.md"), path.join(output, "LEIA-ME.md"));
  await fs.rename(path.join(output, "electron.exe"), path.join(output, "EdiCaptura.exe"));
  if (process.argv.includes("--zip")) {
    execFileSync(
      "tar.exe",
      [
        "-a",
        "-cf",
        path.join(root, "release", "EdiCaptura-Windows.zip"),
        "-C",
        path.join(root, "release"),
        folder,
      ],
      { cwd: root, stdio: "inherit" },
    );
  }
  console.log("Aplicativo portátil em " + output);
}
pack().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
