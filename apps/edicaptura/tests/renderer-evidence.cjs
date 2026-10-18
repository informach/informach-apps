const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = async function rendererEvidence(label) {
  if (!/^[a-z-]+$/.test(label)) throw new Error("Invalid renderer evidence label");
  const parent = path.resolve(__dirname, "../test-results/renderer-evidence");
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, `${label}-`));
  console.log(`Owned renderer evidence: ${root}`);
  return root;
};
