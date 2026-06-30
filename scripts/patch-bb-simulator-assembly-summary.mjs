import fs from "node:fs";

const file = "src/pages/simuladores/BBConsorciosSimulator.tsx";

if (!fs.existsSync(file)) {
  console.log("patch bb simulator assembly summary: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

const fixedRegexLine = String.raw`  return text.match(/(?:pr[oó]x\.?|proxima|próxima)\s*(?:assem\.?|assembleia)?\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;`
  .replaceAll("\\\\", "\\");

src = src
  .split("\n")
  .map((line) => {
    const trimmed = line.trim();
    const isNextAssemblyRegex =
      trimmed.startsWith("return text.match(/(?:pr[oó]x") &&
      trimmed.includes("proxima|próxima") &&
      trimmed.includes("assembleia") &&
      trimmed.includes("?.[1] || null;");

    if (!isNextAssemblyRegex) return line;

    if (line !== fixedRegexLine) {
      changed = true;
    }

    return fixedRegexLine;
  })
  .join("\n");

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch bb simulator assembly summary: fixed next assembly regex");
} else {
  console.log("patch bb simulator assembly summary: no changes");
}
