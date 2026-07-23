import { describe, expect, it } from "vitest";
import { blocoSkill, parseSkill, type Skill, sugerirSkills } from "../src/skills.js";

describe("parseSkill", () => {
  it("lê name/description do frontmatter e corpo", () => {
    const s = parseSkill(
      "arquivo",
      "---\nname: deploy-firebase\ndescription: passos de deploy no Firebase\n---\n1. build\n2. deploy",
    );
    expect(s?.nome).toBe("deploy-firebase");
    expect(s?.descricao).toContain("Firebase");
    expect(s?.body).toContain("1. build");
  });

  it("usa o nome do arquivo quando não há name", () => {
    expect(parseSkill("minha-skill", "---\ndescription: x\n---\ncorpo")?.nome).toBe("minha-skill");
  });

  it("rejeita sem frontmatter ou corpo vazio", () => {
    expect(parseSkill("x", "sem frontmatter")).toBeUndefined();
    expect(parseSkill("x", "---\nname: y\n---\n")).toBeUndefined();
  });
});

describe("sugerirSkills", () => {
  const skills: Skill[] = [
    { body: "b", descricao: "como fazer deploy no firebase hosting", nome: "deploy-firebase" },
    { body: "b", descricao: "gerar notas fiscais NFC-e", nome: "nfce" },
    { body: "b", descricao: "revisar código python", nome: "review-py" },
  ];

  it("ranqueia por casamento de termos", () => {
    const r = sugerirSkills(skills, "preciso fazer o deploy no firebase agora");
    expect(r[0]?.nome).toBe("deploy-firebase");
  });

  it("devolve vazio quando nada casa ou prompt sem termos", () => {
    expect(sugerirSkills(skills, "xyzykk")).toEqual([]);
    expect(sugerirSkills(skills, "a e o")).toEqual([]);
  });

  it("blocoSkill inclui nome e corpo", () => {
    expect(blocoSkill(skills[0] as Skill)).toContain("Skill: deploy-firebase");
  });
});

describe("sugerirSkills — extras", () => {
  it("usa topK default 3 e ordena por nome no empate", () => {
    const many: Skill[] = [
      { body: "b", descricao: "deploy firebase", nome: "s1" },
      { body: "b", descricao: "deploy firebase", nome: "s2" },
      { body: "b", descricao: "deploy firebase", nome: "s3" },
      { body: "b", descricao: "deploy firebase", nome: "s4" },
    ];
    expect(sugerirSkills(many, "deploy firebase").map((s) => s.nome)).toEqual(["s1", "s2", "s3"]);
  });

  it("parseSkill sem description usa string vazia", () => {
    expect(parseSkill("x", "---\nname: y\n---\ncorpo")?.descricao).toBe("");
  });
});
