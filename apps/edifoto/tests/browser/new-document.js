const report = document.createElement("pre");
report.id = "test-results";
report.style.cssText =
  "position:fixed;bottom:8px;left:64px;z-index:9999;background:#182b23;color:white;padding:12px;max-height:180px;overflow:auto";
document.body.append(report);
try {
  for (let i = 0; i < 80 && !window.__edifoto; i++) await new Promise((r) => setTimeout(r, 100));
  const E = window.__edifoto;
  E.useDoc.getState().load(E.ops.blankDoc(320, 240, "Original", "#ffffff"));
  await new Promise((r) => setTimeout(r, 300));
  report.textContent = "Running new document checks...";
  await import("/tests/app/new-document.js");
  report.textContent = JSON.stringify(await globalThis.__newDocumentTestRun, null, 2);
  report.dataset.status = "passed";
} catch (e) {
  report.textContent = e.stack;
  report.dataset.status = "failed";
}
