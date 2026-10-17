import { createRequire } from "node:module";
import { createSkill, InlineSkillSource, validateSkillContent } from "@mastra/core/skills";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const fromMastra = createRequire(require.resolve("@mastra/core"));
const matter = fromMastra("gray-matter");

describe("Mastra front matter dependency compatibility", () => {
  it("round-trips YAML, Unicode, multiline content and metadata through the real parser", () => {
    const metadata = {
      name: "receitas",
      description: "Organização de refeições: medidas e porções",
      metadata: { owner: "Informach", tags: ["receitas", "família"] },
      "user-invocable": false,
    };
    const body = "# Orientações\n\nPreserve as quantidades.\n\n```yaml\nexample: true\n```\n";
    const parsed = matter(matter.stringify(body, metadata));
    expect(parsed.data).toEqual(metadata);
    expect(parsed.content).toBe(body);
    expect(matter("Sem front matter").content).toBe("Sem front matter");
    expect(matter('---json\n{"name":"receitas"}\n---\nCorpo').data).toEqual({
      name: "receitas",
    });
  });

  it("validates and serializes skills through the real Mastra integration", async () => {
    const skill = createSkill({
      name: "edi-review",
      description: "Revisão de documentos sem executar conteúdo recebido.",
      instructions: "Preserve o documento original.\n",
      metadata: { owner: "Informach" },
      "user-invocable": false,
    });
    const source = new InlineSkillSource([skill]);
    const raw = await source.readFile("inline/edi-review/SKILL.md");
    const result = validateSkillContent({
      content: typeof raw === "string" ? raw : raw.toString("utf8"),
      directoryName: "edi-review",
    });
    expect(result.valid).toBe(true);
    expect(matter(raw).data).toMatchObject({
      name: skill.name,
      description: skill.description,
      metadata: skill.metadata,
      "user-invocable": false,
    });
    expect(matter(raw).content).toBe(skill.instructions);
  });

  it("rejects executable YAML tags, JavaScript front matter and duplicate keys", () => {
    expect(() => matter('---\nvalue: !!js/function "function() { return 1; }"\n---\n')).toThrow();
    expect(() => matter('---javascript\n({name: "untrusted"})\n---\n')).toThrow();
    expect(() => matter("---\nname: first\nname: second\n---\n")).toThrow();
    expect(
      validateSkillContent({
        content: '---javascript\n({name: "untrusted"})\n---\n',
        directoryName: "untrusted",
      }).valid,
    ).toBe(false);
  });
});
