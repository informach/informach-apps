// Compiles resources/native/edicaptura-helper.exe from the suite's shared C# (@informach/edi-native:
// capture bridge and file clipboard) and the app's entry point in native/helper. The package skips
// the compiler when nothing changed and only warns outside Windows.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runNativeHelperBuild } from "@informach/edi-native/build";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await runNativeHelperBuild({
  name: "edicaptura-helper",
  appDir: app,
  product: "EdiCaptura",
  modules: ["window-capture", "file-drop"],
  appSources: join(app, "native", "helper"),
  inUse:
    "está em uso. Feche o EdiCaptura aberto em desenvolvimento (ou a captura em andamento) e rode o comando de novo.",
});
