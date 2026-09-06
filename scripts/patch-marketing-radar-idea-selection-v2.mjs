import fs from "node:fs";

const file = "api/marketing/_radar-ideas.ts";
let src = fs.readFileSync(file, "utf8");

const from = `  let topicSignals = pulses
    .filter((p) => p.dimension_type === "topic" && p.dimension_value !== "outros")
    .filter((p) => !["saturando", "esfriando"].includes(p.stage))
    .filter((p) => num(p.score) >= 54 && num(p.confidence) >= 55)
    .sort((a, b) => consulmaxScore(b) - consulmaxScore(a));

  if (!topicSignals.length) {
    topicSignals = pulses
      .filter((p) => p.dimension_type === "topic" && p.dimension_value !== "outros" && p.stage !== "esfriando")
      .sort((a, b) => consulmaxScore(b) - consulmaxScore(a));
  }`;

const to = `  let topicSignals = pulses
    .filter((p) => p.dimension_type === "topic" && p.dimension_value !== "outros")
    .filter((p) => p.stage !== "esfriando")
    .filter((p) => {
      const score = num(p.score);
      const confidence = num(p.confidence);
      if (["quente", "aquecendo", "emergente"].includes(p.stage)) return score >= 54 && confidence >= 55;
      if (p.stage === "estavel") return score >= 50 && confidence >= 80;
      if (p.stage === "saturando") return score >= 62 && confidence >= 70;
      return false;
    })
    .sort((a, b) => consulmaxScore(b) - consulmaxScore(a));

  if (!topicSignals.length) {
    topicSignals = pulses
      .filter((p) => p.dimension_type === "topic" && p.dimension_value !== "outros" && p.stage !== "esfriando")
      .sort((a, b) => consulmaxScore(b) - consulmaxScore(a));
  }`;

if (!src.includes(to)) {
  if (!src.includes(from)) throw new Error("[radar-idea-selection-v2] bloco de seleção não encontrado");
  src = src.replace(from, to);
  fs.writeFileSync(file, src);
  console.log("[radar-idea-selection-v2] seleção editorial ampliada");
} else {
  console.log("[radar-idea-selection-v2] já aplicado");
}
