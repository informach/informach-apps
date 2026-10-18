import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyPath, folderOf, insideAny, usableRoots } from "../src/shared/aiPaths.ts";

const refused = (path: string): boolean => !classifyPath(path).ok;

test("network and device paths an AI sends are refused before anything opens them", () => {
  for (const path of [
    "\\\\atacante\\share\\video.mp4",
    "//atacante/share/video.mp4",
    "\\\\?\\C:\\Users\\ana\\video.mp4",
    "\\\\?\\UNC\\atacante\\share\\video.mp4",
    "\\\\.\\pipe\\ediaula",
    "\\\\.\\C:\\video.mp4",
    "file:///C:/Users/ana/video.mp4",
    "file://atacante/share/video.mp4",
    "https://exemplo.com/video.mp4",
  ])
    assert.ok(refused(path), path);
});

test("paths Windows reads in surprising ways are refused", () => {
  for (const path of [
    "C:arquivo.mp4",
    "c:..\\..\\video.mp4",
    "C:\\Users\\ana\\video.mp4:fluxo",
    "C:\\Users\\ana\\video.mp4:Zone.Identifier:$DATA",
    "C:\\Users\\ana\\CON",
    "C:\\Users\\ana\\nul.txt",
    "C:\\Users\\ana\\com1.mp4",
    "video.mp4",
    ".\\video.mp4",
    "\\Users\\ana\\video.mp4",
    "",
    "C:\\Users\\ana\\vi\u0000deo.mp4",
  ])
    assert.ok(refused(path), JSON.stringify(path));
});

test("local drive paths pass, normalized as Windows reads them", () => {
  assert.deepEqual(classifyPath("C:/Users/ana/Vídeos/aula.mp4"), {
    ok: true,
    path: "C:\\Users\\ana\\Vídeos\\aula.mp4",
  });
  assert.deepEqual(classifyPath("d:\\Aulas\\.\\semana 1\\..\\semana 2\\fala.wav"), {
    ok: true,
    path: "D:\\Aulas\\semana 2\\fala.wav",
  });
  // ".." stops at the drive, as on Windows.
  assert.deepEqual(classifyPath("C:\\..\\..\\Windows\\x.png"), {
    ok: true,
    path: "C:\\Windows\\x.png",
  });
  assert.ok(classifyPath("C:\\Users\\ana\\console.png").ok, "only the exact device names");
});

test("a path counts as inside a folder only when it really is", () => {
  const roots = ["C:\\Users\\ana\\Documents", "D:\\Aulas\\"];
  assert.ok(insideAny("c:\\users\\ANA\\documents\\EdiAula\\x.mp4", roots));
  assert.ok(insideAny("D:\\Aulas\\semana 1\\fala.wav", roots));
  assert.ok(insideAny("D:\\Aulas", roots));
  assert.ok(!insideAny("C:\\Users\\ana\\Documents-falsa\\x.mp4", roots));
  assert.ok(!insideAny("C:\\Users\\ana\\Documents\\..\\Desktop\\x.mp4", roots));
  assert.ok(!insideAny("\\\\host\\Documents\\x.mp4", ["\\\\host\\Documents"]));
});

test("the folder of a media file is found with either kind of slash", () => {
  assert.equal(folderOf("C:\\Aulas\\semana 1\\fala.wav"), "C:\\Aulas\\semana 1");
  assert.equal(folderOf("C:/Aulas/semana 1/fala.wav"), "C:\\Aulas\\semana 1");
  assert.equal(folderOf("D:\\fala.wav"), "D:\\");
  assert.equal(folderOf("\\\\host\\share\\fala.wav"), null);
});

test("a whole drive or the profile folder itself is never a folder the AI may use freely", () => {
  const home = "C:\\Users\\ana";
  const roots = usableRoots(
    [
      "C:\\",
      "D:",
      home,
      "c:\\users\\ANA\\",
      "C:\\Users\\ana\\Documents",
      "C:\\Users\\ana\\Videos\\Aulas",
      "\\\\host\\share",
    ],
    home,
  );
  assert.deepEqual(roots, ["C:\\Users\\ana\\Documents", "C:\\Users\\ana\\Videos\\Aulas"]);
  // A media at the root of a drive, or right in the profile folder, does not open them up.
  assert.ok(!insideAny("C:\\Windows\\x.png", roots));
  assert.ok(!insideAny("C:\\Users\\ana\\AppData\\Roaming\\x.mp4", roots));
  assert.ok(insideAny("C:\\Users\\ana\\Videos\\Aulas\\x.mp4", roots));
});
