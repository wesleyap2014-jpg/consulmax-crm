import fs from "node:fs";

const filePath = "src/pages/AtendimentoWhatsApp.tsx";
let source = fs.readFileSync(filePath, "utf8");

const oldSnippet = `const lamejs = await import("lamejs");
    const Mp3Encoder = (lamejs as any).Mp3Encoder || (lamejs as any).default?.Mp3Encoder;`;

const oldSnippet2 = `await import("lamejs/lame.all.js");
    const Mp3Encoder = (window as any).lamejs?.Mp3Encoder || (globalThis as any).lamejs?.Mp3Encoder;`;

const newSnippet = `const lameModule = await import("lamejs/lame.all.js");
    const Mp3Encoder =
      (lameModule as any).Mp3Encoder ||
      (lameModule as any).default?.Mp3Encoder ||
      (window as any).lamejs?.Mp3Encoder ||
      (globalThis as any).lamejs?.Mp3Encoder;`;

if (source.includes(oldSnippet)) {
  source = source.replaceAll(oldSnippet, newSnippet);
}

if (source.includes(oldSnippet2)) {
  source = source.replaceAll(oldSnippet2, newSnippet);
}

fs.writeFileSync(filePath, source);
console.log("[fix-lamejs-import] Import do lamejs ajustado com resolução do módulo, default e global.");
