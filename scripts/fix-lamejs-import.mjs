import fs from "node:fs";

const filePath = "src/pages/AtendimentoWhatsApp.tsx";
let source = fs.readFileSync(filePath, "utf8");

const snippets = [
  `const lamejs = await import("lamejs");
    const Mp3Encoder = (lamejs as any).Mp3Encoder || (lamejs as any).default?.Mp3Encoder;`,
  `await import("lamejs/lame.all.js");
    const Mp3Encoder = (window as any).lamejs?.Mp3Encoder || (globalThis as any).lamejs?.Mp3Encoder;`,
  `const lameModule = await import("lamejs/lame.all.js");
    const Mp3Encoder =
      (lameModule as any).Mp3Encoder ||
      (lameModule as any).default?.Mp3Encoder ||
      (window as any).lamejs?.Mp3Encoder ||
      (globalThis as any).lamejs?.Mp3Encoder;`,
];

const newSnippet = `const lameAsset = await import("lamejs/lame.all.js?url");
    const lameUrl = (lameAsset as any).default || (lameAsset as any);

    if (!(window as any).lamejs?.Mp3Encoder) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[data-consulmax-lamejs="true"]');

        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("Falha ao carregar encoder de áudio.")), { once: true });
          return;
        }

        const script = document.createElement("script");
        script.src = lameUrl;
        script.async = true;
        script.dataset.consulmaxLamejs = "true";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Falha ao carregar encoder de áudio."));
        document.head.appendChild(script);
      });
    }

    const Mp3Encoder = (window as any).lamejs?.Mp3Encoder || (globalThis as any).lamejs?.Mp3Encoder;`;

for (const snippet of snippets) {
  if (source.includes(snippet)) {
    source = source.replaceAll(snippet, newSnippet);
  }
}

fs.writeFileSync(filePath, source);
console.log("[fix-lamejs-import] lamejs ajustado para carregar como script clássico via asset URL.");
