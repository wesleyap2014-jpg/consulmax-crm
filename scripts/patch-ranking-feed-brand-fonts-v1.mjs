import fs from "node:fs";

const path = "src/components/ranking/rankingFeedCard.ts";
let src = fs.readFileSync(path, "utf8");
let changed = false;

function replaceAll(before, after, label) {
  if (!src.includes(before)) return;
  src = src.split(before).join(after);
  changed = true;
  console.log(`[ranking-feed-brand-fonts-v1] ${label}: aplicado`);
}

if (!src.includes("async function ensureBrandFonts()")) {
  const anchor = "async function loadImage(src?: string | null): Promise<HTMLImageElement | null> {";
  const block = `let brandFontsPromise: Promise<void> | null = null;

async function ensureBrandFonts() {
  if (brandFontsPromise) return brandFontsPromise;

  brandFontsPromise = (async () => {
    if (typeof document === "undefined" || typeof FontFace === "undefined" || !document.fonts) return;

    const sources = [
      { family: "Manrope", url: "/fonts/manrope-regular.otf", weight: "400" },
      { family: "Manrope", url: "/fonts/manrope-medium.otf", weight: "500" },
      { family: "Manrope", url: "/fonts/manrope-semibold.otf", weight: "600" },
      { family: "Manrope", url: "/fonts/manrope-bold.otf", weight: "700" },
      { family: "Manrope", url: "/fonts/manrope-extrabold.otf", weight: "800" },
      { family: "Anthony Hunter", url: "/fonts/Anthony%20Hunter.otf", weight: "400" },
    ] as const;

    await Promise.all(
      sources.map(async ({ family, url, weight }) => {
        const face = new FontFace(family, \`url("\${url}") format("opentype")\`, {
          weight,
          style: "normal",
        });
        const loaded = await face.load();
        document.fonts.add(loaded);
      }),
    );

    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('400 30px "Anthony Hunter"'),
      document.fonts.load("400 24px Manrope"),
      document.fonts.load("500 24px Manrope"),
      document.fonts.load("600 24px Manrope"),
      document.fonts.load("700 24px Manrope"),
      document.fonts.load("800 24px Manrope"),
    ]);
  })().catch((error) => {
    brandFontsPromise = null;
    console.error("[rankingFeedCard] erro ao carregar fontes oficiais", error);
    throw new Error("Não foi possível carregar as fontes oficiais da Consulmax.");
  });

  return brandFontsPromise;
}

`;

  if (!src.includes(anchor)) {
    throw new Error("[ranking-feed-brand-fonts-v1] âncora loadImage não encontrada");
  }
  src = src.replace(anchor, `${block}${anchor}`);
  changed = true;
  console.log("[ranking-feed-brand-fonts-v1] carregador das fontes oficiais: aplicado");
}

replaceAll("Manrope, Arial, sans-serif", "Manrope", "remove fallbacks da Manrope");
replaceAll("'Anthony Hunter', cursive", "'Anthony Hunter'", "remove fallback da Anthony Hunter");
replaceAll('ctx.font = "900 ', 'ctx.font = "800 ', "normaliza peso 900 para ExtraBold 800");

if (!src.includes("await ensureBrandFonts();\n  const { canvas, ctx } = createCanvas();")) {
  src = src.replace(
    "export async function downloadRankingLeaderFeedCard(input: LeaderFeedInput) {\n  const { canvas, ctx } = createCanvas();",
    "export async function downloadRankingLeaderFeedCard(input: LeaderFeedInput) {\n  await ensureBrandFonts();\n  const { canvas, ctx } = createCanvas();",
  );
  src = src.replace(
    "export async function downloadRankingSummaryFeedCard(input: SummaryFeedInput) {\n  const { canvas, ctx } = createCanvas();",
    "export async function downloadRankingSummaryFeedCard(input: SummaryFeedInput) {\n  await ensureBrandFonts();\n  const { canvas, ctx } = createCanvas();",
  );
  changed = true;
  console.log("[ranking-feed-brand-fonts-v1] espera carregamento antes do canvas: aplicado");
}

// Mantém o padrão visual aprovado para a marca nos cards.
replaceAll("drawImageContain(ctx, logo, 88, 74, 270, 68);", "drawImageContain(ctx, logo, -201, 2, 850, 215);", "logo 850px");
replaceAll("drawImageContain(ctx, logo, 78, 70, 300, 76);", "drawImageContain(ctx, logo, -201, 2, 850, 215);", "logo 850px");
replaceAll("drawImageContain(ctx, logo, 68, 67, 320, 81);", "drawImageContain(ctx, logo, -201, 2, 850, 215);", "logo 850px");

if (changed) fs.writeFileSync(path, src);
console.log(`[ranking-feed-brand-fonts-v1] ${changed ? "concluído com alterações" : "já estava aplicado"}`);
