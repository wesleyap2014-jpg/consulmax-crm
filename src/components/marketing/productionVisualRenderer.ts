export type VisualColumn = { title?: string; items?: string[] };
export type VisualInteraction = { type?: string; label?: string; options?: string[] };

export type VisualItem = {
  index?: number;
  role?: string;
  eyebrow?: string;
  headline?: string;
  body?: string;
  bullets?: string[];
  columns?: VisualColumn[];
  interaction?: VisualInteraction;
  motif?: string;
  accent?: string;
  visual_direction?: string;
};

export type VisualSpec = {
  format?: string;
  visual_language?: string;
  creative_rationale?: string;
  design_rules?: string[];
  items?: VisualItem[];
  caption_or_support?: string;
  quality_checks?: string[];
};

export type BrandContext = {
  logo: HTMLImageElement | null;
  titleFamily: string;
  bodyFamily: string;
  navy: string;
  red: string;
  gold: string;
  lightGold: string;
  offWhite: string;
  slogan?: string;
};

type RenderOptions = {
  provider: string;
  format: string;
  assetKind: "static" | "thumbnail";
  item: VisualItem;
  index: number;
  total: number;
  brand: BrandContext;
};

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexWithAlpha(hex: string, alpha: number) {
  const value = String(hex || "#000000").replace("#", "");
  const normalized = value.length === 3 ? value.split("").map((char) => char + char).join("") : value.slice(0, 6);
  const bigint = Number.parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const paragraphs = String(text || "").split(/\n+/);
  const lines: string[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    if (paragraphIndex < paragraphs.length - 1) lines.push("");
  });
  return lines;
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  startSize: number,
  minSize: number,
  family: string,
  weight: number,
) {
  let size = startSize;
  let lines: string[] = [];
  while (size >= minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= maxLines) break;
    size -= 2;
  }
  return { size, lines: lines.slice(0, maxLines) };
}

function drawTextLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  size: number,
  lineHeight: number,
  color: string,
  family: string,
  weight = 400,
) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${family}`;
  let cursor = y;
  lines.forEach((line) => {
    if (line) ctx.fillText(line, x, cursor);
    cursor += lineHeight;
  });
  return cursor;
}

function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, width: number, height: number) {
  if (!logo || !logo.width || !logo.height) return;
  const maxW = Math.round(width * 0.19);
  const maxH = Math.round(height * 0.045);
  const ratio = Math.min(maxW / logo.width, maxH / logo.height);
  const w = logo.width * ratio;
  const h = logo.height * ratio;
  ctx.drawImage(logo, 72, 54, w, h);
}

function drawBase(ctx: CanvasRenderingContext2D, brand: BrandContext, width: number, height: number, index: number, total: number, format: string) {
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = hexWithAlpha(brand.offWhite || "#F5F5F5", 0.72);
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = brand.navy;
  ctx.fillRect(0, 0, width, 18);
  ctx.fillStyle = brand.red;
  ctx.fillRect(0, 18, Math.round(width * 0.13), 5);

  drawLogo(ctx, brand.logo, width, height);

  if (format === "carrossel" && total > 1) {
    ctx.fillStyle = hexWithAlpha(brand.navy, 0.52);
    ctx.font = `600 20px ${brand.bodyFamily}`;
    ctx.textAlign = "right";
    ctx.fillText(`${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, width - 72, 91);
    ctx.textAlign = "left";
  }
}

function drawAccentWord(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, brand: BrandContext) {
  if (!text) return;
  ctx.fillStyle = brand.red;
  ctx.font = `700 20px ${brand.bodyFamily}`;
  ctx.fillText(text.toUpperCase(), x, y);
}

function drawMotif(ctx: CanvasRenderingContext2D, motif: string, brand: BrandContext, x: number, y: number, w: number, h: number) {
  const key = String(motif || "none").toLowerCase();
  ctx.save();
  if (key === "growth") {
    ctx.strokeStyle = brand.red;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y + h * 0.78);
    ctx.lineTo(x + w * 0.31, y + h * 0.58);
    ctx.lineTo(x + w * 0.53, y + h * 0.65);
    ctx.lineTo(x + w * 0.83, y + h * 0.24);
    ctx.stroke();
    [[0.08,0.78],[0.31,0.58],[0.53,0.65],[0.83,0.24]].forEach(([px, py]) => {
      ctx.fillStyle = brand.navy;
      ctx.beginPath();
      ctx.arc(x + w * px, y + h * py, 11, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (key === "flow") {
    const nodes = [[0.16,0.52],[0.5,0.30],[0.82,0.55],[0.52,0.80]];
    ctx.strokeStyle = hexWithAlpha(brand.navy, 0.25);
    ctx.lineWidth = 5;
    ctx.beginPath();
    nodes.forEach(([px, py], idx) => {
      const nx = x + w * px;
      const ny = y + h * py;
      if (idx === 0) ctx.moveTo(nx, ny); else ctx.lineTo(nx, ny);
    });
    ctx.stroke();
    nodes.forEach(([px, py], idx) => {
      ctx.fillStyle = idx === 1 ? brand.red : idx === 2 ? brand.gold : brand.navy;
      ctx.beginPath();
      ctx.arc(x + w * px, y + h * py, idx === 1 ? 24 : 18, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (key === "balance") {
    ctx.strokeStyle = brand.navy;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y + h * 0.18);
    ctx.lineTo(x + w * 0.5, y + h * 0.78);
    ctx.moveTo(x + w * 0.18, y + h * 0.35);
    ctx.lineTo(x + w * 0.82, y + h * 0.35);
    ctx.stroke();
    ctx.fillStyle = hexWithAlpha(brand.gold, 0.34);
    roundedRect(ctx, x + w * 0.08, y + h * 0.42, w * 0.3, h * 0.22, 26); ctx.fill();
    ctx.fillStyle = hexWithAlpha(brand.red, 0.16);
    roundedRect(ctx, x + w * 0.62, y + h * 0.42, w * 0.3, h * 0.22, 26); ctx.fill();
  } else if (key === "building") {
    const bars = [0.38,0.58,0.78,0.48,0.68];
    bars.forEach((factor, idx) => {
      const bw = w * 0.13;
      const bh = h * factor;
      ctx.fillStyle = idx === 2 ? brand.red : idx === 4 ? brand.gold : hexWithAlpha(brand.navy, 0.88);
      roundedRect(ctx, x + idx * w * 0.17, y + h - bh, bw, bh, 10);
      ctx.fill();
    });
  } else if (key === "target") {
    [0.44,0.31,0.18].forEach((radius, idx) => {
      ctx.strokeStyle = idx === 2 ? brand.red : hexWithAlpha(brand.navy, idx === 0 ? 0.16 : 0.28);
      ctx.lineWidth = idx === 2 ? 8 : 5;
      ctx.beginPath();
      ctx.arc(x + w * 0.5, y + h * 0.5, Math.min(w, h) * radius, 0, Math.PI * 2);
      ctx.stroke();
    });
  } else if (key === "numbers") {
    ctx.fillStyle = hexWithAlpha(brand.navy, 0.06);
    ctx.font = `700 ${Math.round(Math.min(w, h) * 0.66)}px ${brand.titleFamily}`;
    ctx.fillText("01", x, y + h * 0.78);
  } else if (key === "quote") {
    ctx.fillStyle = hexWithAlpha(brand.gold, 0.35);
    ctx.font = `700 ${Math.round(Math.min(w, h) * 0.72)}px ${brand.titleFamily}`;
    ctx.fillText("“", x + w * 0.08, y + h * 0.76);
  } else if (key === "comparison") {
    ctx.fillStyle = hexWithAlpha(brand.navy, 0.07);
    roundedRect(ctx, x, y + h * 0.15, w * 0.44, h * 0.7, 28); ctx.fill();
    ctx.fillStyle = hexWithAlpha(brand.red, 0.10);
    roundedRect(ctx, x + w * 0.56, y + h * 0.15, w * 0.44, h * 0.7, 28); ctx.fill();
    ctx.fillStyle = brand.gold;
    ctx.fillRect(x + w * 0.49, y + h * 0.26, 4, h * 0.48);
  }
  ctx.restore();
}

function drawHeadlineBlock(ctx: CanvasRenderingContext2D, brand: BrandContext, item: VisualItem, x: number, y: number, maxW: number, maxLines: number, startSize: number, minSize: number) {
  drawAccentWord(ctx, item.eyebrow || "", x, y);
  const startY = item.eyebrow ? y + 72 : y;
  const fitted = fitText(ctx, item.headline || "", maxW, maxLines, startSize, minSize, brand.titleFamily, 700);
  const cursor = drawTextLines(ctx, fitted.lines, x, startY, fitted.size, fitted.size * 1.12, brand.navy, brand.titleFamily, 700);
  return cursor;
}

function drawBody(ctx: CanvasRenderingContext2D, brand: BrandContext, body: string, x: number, y: number, maxW: number, maxLines: number, size: number) {
  if (!body) return y;
  const fitted = fitText(ctx, body, maxW, maxLines, size, Math.max(24, size - 8), brand.bodyFamily, 400);
  return drawTextLines(ctx, fitted.lines, x, y, fitted.size, fitted.size * 1.48, "#465269", brand.bodyFamily, 400);
}

function drawBulletList(ctx: CanvasRenderingContext2D, brand: BrandContext, bullets: string[], x: number, y: number, w: number, story: boolean) {
  let cursor = y;
  const items = bullets.slice(0, story ? 4 : 5);
  items.forEach((bullet, idx) => {
    const boxH = story ? 126 : 112;
    ctx.fillStyle = idx % 2 === 0 ? "#FFFFFF" : hexWithAlpha(brand.lightGold, 0.13);
    roundedRect(ctx, x, cursor, w, boxH, 24); ctx.fill();
    ctx.strokeStyle = hexWithAlpha(brand.navy, 0.08); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = idx === 0 ? brand.red : brand.navy;
    ctx.font = `700 ${story ? 27 : 23}px ${brand.titleFamily}`;
    ctx.fillText(String(idx + 1).padStart(2, "0"), x + 28, cursor + (story ? 48 : 43));
    ctx.fillStyle = brand.navy;
    ctx.font = `500 ${story ? 29 : 25}px ${brand.bodyFamily}`;
    const lines = wrapLines(ctx, bullet, w - 105).slice(0, 2);
    drawTextLines(ctx, lines, x + 92, cursor + (story ? 43 : 40), story ? 29 : 25, story ? 38 : 33, brand.navy, brand.bodyFamily, 500);
    cursor += boxH + 16;
  });
  return cursor;
}

function drawColumns(ctx: CanvasRenderingContext2D, brand: BrandContext, columns: VisualColumn[], x: number, y: number, totalW: number, height: number, story: boolean) {
  const cols = columns.slice(0, 2);
  if (!cols.length) return y;
  const gap = 22;
  const width = (totalW - gap) / 2;
  cols.forEach((column, idx) => {
    const cx = x + idx * (width + gap);
    ctx.fillStyle = idx === 0 ? "#FFFFFF" : hexWithAlpha(brand.lightGold, 0.14);
    roundedRect(ctx, cx, y, width, height, 28); ctx.fill();
    ctx.strokeStyle = idx === 0 ? hexWithAlpha(brand.navy, 0.11) : hexWithAlpha(brand.gold, 0.36);
    ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = idx === 0 ? brand.navy : brand.red;
    ctx.font = `700 ${story ? 28 : 24}px ${brand.titleFamily}`;
    const titleLines = wrapLines(ctx, column.title || `Opção ${idx + 1}`, width - 50).slice(0, 2);
    drawTextLines(ctx, titleLines, cx + 26, y + 48, story ? 28 : 24, story ? 35 : 31, idx === 0 ? brand.navy : brand.red, brand.titleFamily, 700);
    let cy = y + (story ? 132 : 116);
    (column.items || []).slice(0, 4).forEach((entry) => {
      ctx.fillStyle = idx === 0 ? brand.gold : brand.red;
      ctx.beginPath(); ctx.arc(cx + 32, cy - 8, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = brand.navy;
      ctx.font = `400 ${story ? 25 : 22}px ${brand.bodyFamily}`;
      const lines = wrapLines(ctx, entry, width - 70).slice(0, 2);
      drawTextLines(ctx, lines, cx + 50, cy, story ? 25 : 22, story ? 33 : 29, brand.navy, brand.bodyFamily, 400);
      cy += lines.length * (story ? 33 : 29) + 24;
    });
  });
  return y + height;
}

function drawInteraction(ctx: CanvasRenderingContext2D, brand: BrandContext, interaction: VisualInteraction | undefined, x: number, y: number, w: number, story: boolean) {
  if (!interaction || !interaction.type || interaction.type === "none") return y;
  if (interaction.label) {
    ctx.fillStyle = brand.navy;
    ctx.font = `600 ${story ? 28 : 24}px ${brand.bodyFamily}`;
    const lines = wrapLines(ctx, interaction.label, w).slice(0, 2);
    y = drawTextLines(ctx, lines, x, y, story ? 28 : 24, story ? 38 : 32, brand.navy, brand.bodyFamily, 600) + 22;
  }
  (interaction.options || []).slice(0, 3).forEach((option, idx) => {
    ctx.fillStyle = idx === 0 ? brand.navy : "#FFFFFF";
    roundedRect(ctx, x, y, w, story ? 92 : 72, 46); ctx.fill();
    ctx.strokeStyle = idx === 0 ? brand.navy : hexWithAlpha(brand.navy, 0.18); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = idx === 0 ? "#FFFFFF" : brand.navy;
    ctx.font = `600 ${story ? 27 : 23}px ${brand.bodyFamily}`;
    ctx.textAlign = "center";
    ctx.fillText(option, x + w / 2, y + (story ? 57 : 46));
    ctx.textAlign = "left";
    y += story ? 112 : 90;
  });
  return y;
}

function drawFooter(ctx: CanvasRenderingContext2D, brand: BrandContext, width: number, height: number, format: string, role: string) {
  if (role === "cta") return;
  ctx.fillStyle = hexWithAlpha(brand.navy, 0.1);
  ctx.fillRect(72, height - 86, 88, 4);
  if (brand.slogan && format !== "stories" && format !== "status") {
    ctx.fillStyle = hexWithAlpha(brand.navy, 0.6);
    ctx.font = `500 17px ${brand.bodyFamily}`;
    ctx.fillText(brand.slogan, 72, height - 49);
  }
}

function drawCtaLayout(ctx: CanvasRenderingContext2D, brand: BrandContext, item: VisualItem, width: number, height: number, story: boolean) {
  const top = story ? 420 : 330;
  const panelY = story ? 610 : 520;
  const panelH = height - panelY;
  drawAccentWord(ctx, item.eyebrow || "PRÓXIMO PASSO", 82, top);
  const fit = fitText(ctx, item.headline || "Vamos conversar?", width - 164, story ? 4 : 3, story ? 76 : 66, story ? 48 : 44, brand.titleFamily, 700);
  drawTextLines(ctx, fit.lines, 82, top + 86, fit.size, fit.size * 1.12, brand.navy, brand.titleFamily, 700);
  ctx.fillStyle = brand.navy;
  roundedRect(ctx, 54, panelY, width - 108, panelH - 54, 38); ctx.fill();
  let y = panelY + 92;
  if (item.body) {
    const bodyFit = fitText(ctx, item.body, width - 220, story ? 5 : 4, story ? 34 : 30, 24, brand.bodyFamily, 400);
    y = drawTextLines(ctx, bodyFit.lines, 110, y, bodyFit.size, bodyFit.size * 1.45, "#FFFFFF", brand.bodyFamily, 400) + 38;
  }
  const label = item.interaction?.label || item.bullets?.[0] || "Fale com a Consulmax";
  ctx.fillStyle = brand.red;
  roundedRect(ctx, 110, y, width - 220, story ? 98 : 82, 49); ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 ${story ? 28 : 24}px ${brand.bodyFamily}`;
  ctx.textAlign = "center";
  ctx.fillText(label.slice(0, 62), width / 2, y + (story ? 61 : 52));
  ctx.textAlign = "left";
}

function drawStandardLayout(ctx: CanvasRenderingContext2D, brand: BrandContext, item: VisualItem, width: number, height: number, story: boolean, role: string) {
  const x = story ? 76 : 82;
  const maxW = width - x * 2;
  const yStart = story ? 335 : 275;
  const maxTitleWidth = role === "cover" || role === "hook" || role === "question" ? Math.round(maxW * 0.76) : maxW;
  const titleSize = story ? (role === "hook" || role === "question" ? 78 : 62) : (role === "cover" ? 68 : 55);
  let y = drawHeadlineBlock(ctx, brand, item, x, yStart, maxTitleWidth, story ? 5 : 4, titleSize, story ? 46 : 40) + (story ? 38 : 30);

  const hasStructured = (item.bullets?.length || 0) > 0 || (item.columns?.length || 0) > 0;
  if (item.body && !hasStructured) y = drawBody(ctx, brand, item.body, x, y, maxW, story ? 5 : 4, story ? 33 : 29) + (story ? 36 : 28);

  if ((item.columns?.length || 0) > 0) {
    const available = Math.max(story ? 500 : 410, height - y - (story ? 250 : 210));
    y = drawColumns(ctx, brand, item.columns || [], x, y + 8, maxW, Math.min(available, story ? 660 : 510), story) + 28;
  } else if ((item.bullets?.length || 0) > 0) {
    y = drawBulletList(ctx, brand, item.bullets || [], x, y + 8, maxW, story) + 24;
  }

  if (item.interaction && item.interaction.type !== "none") {
    drawInteraction(ctx, brand, item.interaction, x, Math.min(y + 10, height - (story ? 500 : 340)), maxW, story);
  }

  if (role === "cover" || role === "hook" || role === "question") {
    drawMotif(ctx, item.motif || (role === "cover" ? "growth" : "target"), brand, width * 0.62, story ? height * 0.58 : height * 0.60, width * 0.30, story ? height * 0.18 : height * 0.20);
  } else if (!hasStructured && item.motif && item.motif !== "none") {
    drawMotif(ctx, item.motif, brand, width * 0.60, height * 0.62, width * 0.30, height * 0.20);
  }
}

export function dimensionsFor(provider: string, format: string, assetKind: "static" | "thumbnail") {
  const normalizedFormat = String(format || "").toLowerCase();
  const normalizedProvider = String(provider || "").toLowerCase();
  if (assetKind === "thumbnail" && normalizedFormat === "youtube_long") return { width: 1280, height: 720 };
  if (assetKind === "thumbnail" || ["stories", "status", "reel", "video", "short"].includes(normalizedFormat)) return { width: 1080, height: 1920 };
  if (normalizedProvider === "linkedin" && normalizedFormat === "post") return { width: 1200, height: 1200 };
  return { width: 1080, height: 1350 };
}

export function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao gerar imagem.")), "image/png", 1);
  });
}

export async function renderVisualItem(options: RenderOptions) {
  const { provider, format, assetKind, item, index, total, brand } = options;
  const { width, height } = dimensionsFor(provider, format, assetKind);
  const story = height / width > 1.55;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");

  drawBase(ctx, brand, width, height, index, total, assetKind === "thumbnail" ? "thumbnail" : format);
  const role = assetKind === "thumbnail" ? "thumbnail" : String(item.role || (index === 0 ? "cover" : "concept")).toLowerCase();

  if (role === "cta") {
    drawCtaLayout(ctx, brand, item, width, height, story);
  } else if (role === "comparison" && (item.columns?.length || 0) >= 2) {
    drawStandardLayout(ctx, brand, { ...item, motif: "comparison" }, width, height, story, role);
  } else {
    drawStandardLayout(ctx, brand, item, width, height, story, role);
  }

  drawFooter(ctx, brand, width, height, assetKind === "thumbnail" ? "thumbnail" : format, role);
  return { blob: await canvasToBlob(canvas), width, height };
}
