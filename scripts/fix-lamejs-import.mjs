import fs from "node:fs";

const filePath = "src/pages/AtendimentoWhatsApp.tsx";
let source = fs.readFileSync(filePath, "utf8");

const oldSnippet = `const lamejs = await import("lamejs");
    const Mp3Encoder = (lamejs as any).Mp3Encoder || (lamejs as any).default?.Mp3Encoder;`;

const newSnippet = `await import("lamejs/lame.all.js");
    const Mp3Encoder = (window as any).lamejs?.Mp3Encoder || (globalThis as any).lamejs?.Mp3Encoder;`;

if (source.includes(oldSnippet)) {
  source = source.replaceAll(oldSnippet, newSnippet);
}

fs.writeFileSync(filePath, source);
console.log("[fix-lamejs-import] Import do lamejs ajustado para lame.all.js.");
