// Compiles resources/native/ediaula-helper.exe from the suite's shared C# (@informach/edi-native:
// version and JSON lines) and the app's own sources in native/helper. The package skips the
// compiler when nothing changed and only warns outside Windows.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runNativeHelperBuild } from "@informach/edi-native/build";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await runNativeHelperBuild({
  name: "ediaula-helper",
  appDir: app,
  product: "EdiAula",
  modules: [],
  appSources: join(app, "native", "helper"),
  references: [
    "System.Drawing.dll",
    "WPF/UIAutomationClient.dll",
    "WPF/UIAutomationTypes.dll",
    "WPF/WindowsBase.dll",
  ],
  inUse:
    "está em uso. Feche o EdiAula aberto em desenvolvimento (ou a gravação em andamento) e rode o comando de novo.",
});
