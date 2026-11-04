import assert from "node:assert/strict";
import { test } from "node:test";
import {
  insideFolder,
  isDevicePath,
  LISTED,
  linkedFilesDetail,
  networkHost,
} from "../src/main/linkedFiles.ts";

const folder = "C:\\Aulas\\Farol";

test("network paths name their computer; local and long local paths do not", () => {
  assert.equal(networkHost("\\\\Atacante\\s\\t.png"), "atacante");
  assert.equal(networkHost("//atacante/s/t.png"), "atacante");
  assert.equal(networkHost("\\\\?\\UNC\\Atacante\\s\\t.png"), "atacante");
  assert.equal(networkHost("C:\\Aulas\\Farol\\tela.mp4"), null);
  assert.equal(networkHost("\\\\?\\C:\\Aulas\\tela.mp4"), null);
});

test("device paths are refused; long local and network paths are not devices", () => {
  assert.equal(isDevicePath("\\\\.\\pipe\\x"), true);
  assert.equal(isDevicePath("\\\\?\\GLOBALROOT\\Device\\x"), true);
  assert.equal(isDevicePath("\\\\?\\C:\\Aulas\\tela.mp4"), false);
  assert.equal(isDevicePath("\\\\?\\UNC\\servidor\\s\\t.mp4"), false);
  assert.equal(isDevicePath("\\\\servidor\\s\\t.mp4"), false);
});

test("a path that climbs out of the lesson's folder with .. is outside it", () => {
  assert.equal(insideFolder("C:\\Aulas\\Farol\\media\\tela.mp4", folder), true);
  assert.equal(insideFolder("C:\\aulas\\farol\\tela.mp4", `${folder}\\`), true);
  assert.equal(insideFolder("C:\\Aulas\\Farol\\..\\..\\Users\\ana\\senhas.txt", folder), false);
  assert.equal(insideFolder("C:\\Aulas\\Farol2\\tela.mp4", folder), false);
});

test("nothing hides after the first files listed: every computer is named, every file counted", () => {
  const decoys = Array.from({ length: LISTED }, (_, i) => `D:\\Gravações\\parte-${i}.mp4`);
  const hidden = ["\\\\atacante\\s\\t.png", "C:\\Users\\ana\\Documents\\senhas.txt"];
  const inside = [`${folder}\\voz.wav`];
  const detail = linkedFilesDetail([...inside, ...decoys, ...hidden], folder);
  assert.match(detail, /outros computadores da rede.*: atacante\./);
  assert.match(detail, new RegExp(`${LISTED + 2} de ${LISTED + 3} ficam fora da pasta da aula`));
  assert.match(detail, /… e mais 2 fora da pasta da aula\./);
  assert.ok(!detail.includes("voz.wav"), "the files of the lesson's own folder are not listed");
});

test("a lesson whose files are all in its folder says so", () => {
  const detail = linkedFilesDetail([`${folder}\\tela.mp4`, `${folder}\\voz.wav`], folder);
  assert.equal(detail, "Todos os 2 ficam na pasta da aula.");
});
