import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { hasNativeMedia } from "../../packages/config/src/edi-tools.ts";
import { desktopAppIdSchema } from "../../packages/edi-contracts/src/index.ts";

const execute = promisify(execFile);
const licensesSchema = z.record(
  z.string(),
  z.array(
    z.object({
      name: z.string(),
      versions: z.array(z.string()),
      paths: z.array(z.string()).min(1),
      license: z.string(),
      homepage: z.string().optional(),
    }),
  ),
);

// Verbatim license header of libavfilter/af_arnndn.c at FFmpeg tag n9.0.2 (the
// version pinned in scripts/edi/media/sources.lock.json), from
// https://github.com/FFmpeg/FFmpeg/blob/n9.0.2/libavfilter/af_arnndn.c and
// identical in the pinned ffmpeg-9.0.2.tar.xz.
const arnndnLicenseHeader = [
  "/*",
  " * Copyright (c) 2018 Gregor Richards",
  " * Copyright (c) 2017 Mozilla",
  " * Copyright (c) 2005-2009 Xiph.Org Foundation",
  " * Copyright (c) 2007-2008 CSIRO",
  " * Copyright (c) 2008-2011 Octasic Inc.",
  " * Copyright (c) Jean-Marc Valin",
  " * Copyright (c) 2019 Paul B Mahol",
  " *",
  " * Redistribution and use in source and binary forms, with or without",
  " * modification, are permitted provided that the following conditions",
  " * are met:",
  " *",
  " * - Redistributions of source code must retain the above copyright",
  " *   notice, this list of conditions and the following disclaimer.",
  " *",
  " * - Redistributions in binary form must reproduce the above copyright",
  " *   notice, this list of conditions and the following disclaimer in the",
  " *   documentation and/or other materials provided with the distribution.",
  " *",
  " * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS",
  " * ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT",
  " * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR",
  " * A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE FOUNDATION OR",
  " * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,",
  " * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,",
  " * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR",
  " * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF",
  " * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING",
  " * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS",
  " * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.",
  " */",
].join("\n");

/** Include production dependency notices even when Vite bundles their code/fonts. */
export async function writeThirdPartyNotices(appId: string, resourcesDirectory: string) {
  desktopAppIdSchema.parse(appId);
  const packageManager = process.env.npm_execpath;
  if (!packageManager || !isAbsolute(packageManager) || basename(packageManager) !== "pnpm.cjs")
    throw new Error("Notice generation requires the pinned pnpm workspace command");
  const result = await execute(
    process.execPath,
    [packageManager, "--filter", `@informach/${appId}...`, "licenses", "list", "--prod", "--json"],
    { windowsHide: true, maxBuffer: 8 * 1024 ** 2 },
  );
  const packages = Object.values(licensesSchema.parse(JSON.parse(result.stdout)))
    .flat()
    .sort((a, b) => a.name.localeCompare(b.name));
  const sections = [
    "Suíte Edi: third-party software notices",
    "These components retain their own licenses and copyright notices. Dependency names below include transitive runtime dependencies. Electron and Chromium notices are distributed alongside the application executable.",
  ];
  if (hasNativeMedia(appId))
    sections.push(
      "FFmpeg and FFprobe are separately distributed native programs under GPLv3. Their licenses, complete corresponding source and rebuild instructions are installed in native-media/ beside this file; see native-media/README.md and native-media/Corresponding-Source.tar.xz.",
    );
  if (appId === "ediaula")
    sections.push(
      "Bundled export fonts retain their SIL Open Font License 1.1. Their embedded copyright and reserved-name statements, original-file checksums and complete license text are installed in fonts/LICENSES.txt beside this file.",
      "The voice noise-reduction model rnnoise/sh.rnnn is somnolent-hogwash-2018-09-01 from https://github.com/GregorR/rnnoise-models (commit 3eee541a283fd3b8f81b85b1748e3b9ccbefa04d), unmodified. That repository ships no license file; its README states that, except for its tools/ directory and the README itself, none of the work is creative and none of it is subject to copyright. Provenance, the sha256 and the README text are installed in rnnoise/README.md beside this file. The code that runs the model is the arnndn filter of FFmpeg (libavfilter/af_arnndn.c, based on RNNoise by Jean-Marc Valin, Mozilla, the Xiph.Org Foundation and Gregor Richards), part of the FFmpeg 9.0.2 build in native-media/. Its BSD-style license header at FFmpeg tag n9.0.2 (https://github.com/FFmpeg/FFmpeg/blob/n9.0.2/libavfilter/af_arnndn.c) follows.",
      `\n--- FFmpeg arnndn filter (libavfilter/af_arnndn.c, FFmpeg n9.0.2) ---\n${arnndnLicenseHeader}`,
      "The webcam background-removal model segmentation/selfie_segmenter.tflite (inside app.asar, resources/segmentation) is Google's MediaPipe Selfie Segmentation model, unmodified, from https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite (sha256 191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b). Its model card states the Apache License, Version 2.0; @mediapipe/tasks-vision, which runs it, is Apache-2.0 too and ships no license file of its own. The Apache License 2.0 text follows.",
      `\n--- Apache License 2.0 (selfie segmentation model and @mediapipe/tasks-vision) ---\n${await readFile(fileURLToPath(new URL("../../apps/ediaula/resources/segmentation/LICENSE", import.meta.url)), "utf8")}`,
      // The WebAssembly of @mediapipe/tasks-vision has TensorFlow Lite, XNNPACK, Abseil,
      // Protocol Buffers, Eigen and others compiled in: their notices travel too.
      `\n--- Libraries compiled into the MediaPipe WebAssembly ---\n${await readFile(fileURLToPath(new URL("../../apps/ediaula/resources/segmentation/WASM-NOTICES.txt", import.meta.url)), "utf8")}`,
      // The glossary's Portuguese word list is bundled into the renderer, so its
      // CC BY-SA attribution has to travel with the installer.
      `\n--- Portuguese word list (glossary) ---\n${await readFile(fileURLToPath(new URL("../../apps/ediaula/src/shared/lexicon/LICENSE-pt-words.txt", import.meta.url)), "utf8")}`,
    );
  for (const dependency of packages) {
    sections.push(
      `\n${"=".repeat(72)}\n${dependency.name} ${dependency.versions.join(", ")}\nLicense: ${dependency.license}${dependency.homepage ? `\nHomepage: ${dependency.homepage}` : ""}`,
    );
    const documents = new Map<string, string>();
    for (const path of dependency.paths) {
      const files = await readdir(path, { withFileTypes: true });
      const notices = files.filter(
        (file) => file.isFile() && /(^|\.)(licen[sc]e|copying|notice)(\.|$)/i.test(file.name),
      );
      // Native FFmpeg distributions include the exact build/configuration/source
      // references in executable README files, separate from the JS wrapper.
      notices.push(...files.filter((file) => file.isFile() && /\.exe\.README$/i.test(file.name)));
      if (notices.length === 0) {
        const readme = files.find((file) => file.isFile() && /^readme(\.|$)/i.test(file.name));
        if (!readme)
          throw new Error(`No license text or README is distributed by ${dependency.name}`);
        notices.push(readme);
      }
      for (const notice of notices.sort((a, b) => a.name.localeCompare(b.name))) {
        const content = await readFile(join(path, notice.name), "utf8");
        documents.set(content, notice.name);
      }
    }
    for (const [content, name] of documents) sections.push(`\n--- ${name} ---\n${content}`);
  }
  await writeFile(join(resourcesDirectory, "THIRD-PARTY-NOTICES.txt"), `${sections.join("\n")}\n`);
  return packages.length;
}
