import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { windowsPowerShellEnvironment } from "../../packages/edi-desktop/src/windows-powershell.ts";

it.runIf(process.platform === "win32")(
  "native SVG file helper admits only exact disposable destinations, including the gradient fixture",
  () => {
    const script = resolve("scripts/edi/respond-test-file.ps1").replaceAll("'", "''"),
      cases = [
        "edi-native-fixture\\edisvg-test-project.edisvg",
        "edi-native-fixture\\edisvg-react-test.react.zip",
        "edi-native-fixture\\edisvg-lottie-test.lottie.json",
        "edi-native-fixture\\edisvg-lottie-stroke-test.lottie.json",
        "edi-native-fixture\\edisvg-lottie-conversion-test.lottie.json",
        "edi-native-fixture\\edisvg-lottie-gradient-test.lottie.json",
        "edi-native-fixture\\personal.edisvg",
        "edi-native-fixture\\nested\\edisvg-lottie-gradient-test.lottie.json",
        "edi-native-fixture\\..\\edisvg-lottie-gradient-test.lottie.json",
        "edi-native-fixture\\edisvg-lottie-gradient-test.lottie.json.exe",
        "edi-native-fixture\\edisvg-lottie-gradient-test.lottie.json.backup",
        "personal\\edisvg-lottie-gradient-test.lottie.json",
      ],
      // Parse, never execute the UI helper. The real .NET -match operator tests
      // its literal guard, without a fake PID or access to personal dialogs.
      code = `
$ediPathTokens = $null
$ediPathErrors = $null
$ediPathAst = [System.Management.Automation.Language.Parser]::ParseFile('${script}', [ref]$ediPathTokens, [ref]$ediPathErrors)
if ($ediPathErrors.Count) { throw 'Invalid native destination helper syntax.' }
$ediPathGuards = @($ediPathAst.FindAll({ param($node) $node -is [System.Management.Automation.Language.BinaryExpressionAst] -and $node.Operator -eq [System.Management.Automation.Language.TokenKind]::Inotmatch }, $true))
if ($ediPathGuards.Count -ne 1 -or $ediPathGuards[0].Right -isnot [System.Management.Automation.Language.StringConstantExpressionAst]) { throw 'Expected one literal exact-destination guard.' }
$ediPathPattern = $ediPathGuards[0].Right.Value
$ediPathCases = @(${cases.map((value) => `'${value}'`).join(",")})
$ediPathResults = @($ediPathCases | ForEach-Object { [bool]($_ -match $ediPathPattern) })
ConvertTo-Json -Compress -InputObject $ediPathResults
`,
      output = execFileSync(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", code],
        {
          encoding: "utf8",
          windowsHide: true,
          env: windowsPowerShellEnvironment(process.env),
          timeout: 10000,
          maxBuffer: 32768,
        },
      );
    expect(JSON.parse(output)).toEqual([...Array(6).fill(true), ...Array(6).fill(false)]);
  },
  15000,
);
