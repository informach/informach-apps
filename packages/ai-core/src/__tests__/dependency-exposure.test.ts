import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("transitive security exposure", () => {
  it("loads the real Mastra YAML engine without the legacy CLI formatter", () => {
    // A clean process gives an actual require graph, not a mocked package loader.
    // This guards the current non-reachability assessment; it does not mark the
    // vulnerable package version as patched or suppress its audit advisory.
    const result = execFileSync(
      process.execPath,
      [
        "-e",
        `
      const { createRequire } = require('node:module');
      const fromMastra = createRequire(require.resolve('@mastra/core'));
      const matter = fromMastra('gray-matter');
      const document = matter('---\\ntitle: Example\\n---\\nBody');
      const cliLoaded = () => Object.keys(require.cache).some(path => /[\\\\/]node_modules[\\\\/](?:argparse|sprintf-js)[\\\\/]/.test(path));
      const before = cliLoaded();
      const fromMatter = createRequire(fromMastra.resolve('gray-matter'));
      const fromYaml = createRequire(fromMatter.resolve('js-yaml'));
      fromYaml('argparse');
      process.stdout.write(JSON.stringify({ title: document.data.title, cliLoaded: before, detectorRecognizesCli: cliLoaded() }));
    `,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    expect(JSON.parse(result)).toEqual({
      title: "Example",
      cliLoaded: false,
      detectorRecognizesCli: true,
    });
  });
});
