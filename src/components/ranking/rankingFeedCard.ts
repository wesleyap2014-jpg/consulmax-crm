export type HighlightFeedItem = {
  label: string;
  name: string;
  value: string;
  helper?: string;
  avatarUrl?: string | null;
};

type SummaryFeedInput = {
  title: string;
  periodLabel: string;
  items: HighlightFeedItem[];
};

type LeaderFeedInput = HighlightFeedItem & {
  title: string;
  periodLabel: string;
};

const SIZE = 1080;
const NAVY = "#1E293F";
const RUBY = "#A11C27";
const GOLD = "#B5A573";
const CREAM = "#F7F4EE";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return lines.length;
}

async function loadImage(src?: string | null): Promise<HTMLImageElement | null> {
  if (!src) return null;
  return await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawImageContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function initials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "CM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function slug(value: string) {
  return String(value || "destaque")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function saveCanvas(canvas: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
  if (!blob) throw new Error("Não foi possível gerar o PNG.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não permitiu gerar o card.");
  return { canvas, ctx };
}

function drawBase(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  bg.addColorStop(0, NAVY);
  bg.addColorStop(0.72, "#172033");
  bg.addColorStop(1, "#101827");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = RUBY;
  ctx.beginPath();
  ctx.arc(920, 145, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(130, 1010, 330, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, 16, SIZE);
}

async function drawBrand(ctx: CanvasRenderingContext2D) {
  const logo = await loadImage("/logo-consulmax.png?v=3");
  fillRoundRect(ctx, 64, 58, 320, 100, 24, "rgba(255,255,255,0.96)");
  if (logo) {
    drawImageContain(ctx, logo, 68, 67, 320, 81);
  } else {
    ctx.fillStyle = NAVY;
    ctx.font = "800 34px Manrope, Arial, sans-serif";
    ctx.fillText("CONSULMAX", 94, 120);
  }
}

function drawFooter(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "400 30px 'Anthony Hunter', cursive";
  ctx.fillText("Transformando sonhos em conquistas reais!", 64, 1025);
  ctx.textAlign = "right";
  ctx.fillStyle = GOLD;
  ctx.font = "800 22px Manrope, Arial, sans-serif";
  ctx.fillText("CONSULMAX CONSÓRCIOS", 1016, 1025);
  ctx.textAlign = "left";
}

async function drawAvatar(ctx: CanvasRenderingContext2D, item: HighlightFeedItem, x: number, y: number, size: number) {
  const image = await loadImage(item.avatarUrl || null);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (image) {
    drawImageCover(ctx, image, x, y, size, size);
  } else {
    ctx.fillStyle = RUBY;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 ${Math.round(size * 0.3)}px Manrope, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(item.name), x + size / 2, y + size / 2 + 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.stroke();
}

export async function downloadRankingLeaderFeedCard(input: LeaderFeedInput) {
  const { canvas, ctx } = createCanvas();
  drawBase(ctx);
  await drawBrand(ctx);

  ctx.fillStyle = GOLD;
  ctx.font = "800 25px Manrope, Arial, sans-serif";
  ctx.fillText(input.title.toUpperCase(), 64, 218);

  ctx.fillStyle = "rgba(255,255,255,0.68)";
  ctx.font = "500 23px Manrope, Arial, sans-serif";
  ctx.fillText(input.periodLabel, 64, 256);

  fillRoundRect(ctx, 64, 304, 952, 604, 44, "rgba(255,255,255,0.97)");
  fillRoundRect(ctx, 96, 338, 888, 74, 22, CREAM);
  ctx.fillStyle = RUBY;
  ctx.font = "900 26px Manrope, Arial, sans-serif";
  ctx.fillText(input.label.toUpperCase(), 126, 386);

  await drawAvatar(ctx, input, 116, 458, 210);

  ctx.fillStyle = NAVY;
  ctx.font = "900 48px Manrope, Arial, sans-serif";
  drawWrappedText(ctx, input.name, 366, 515, 570, 56, 2);

  ctx.fillStyle = RUBY;
  ctx.font = "900 64px Manrope, Arial, sans-serif";
  drawWrappedText(ctx, input.value, 366, 655, 570, 72, 2);

  if (input.helper) {
    ctx.fillStyle = "#64748B";
    ctx.font = "600 25px Manrope, Arial, sans-serif";
    drawWrappedText(ctx, input.helper, 366, 770, 560, 34, 3);
  }

  fillRoundRect(ctx, 116, 835, 868, 44, 18, NAVY);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 20px Manrope, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PARABÉNS PELO DESTAQUE!", 550, 864);
  ctx.textAlign = "left";

  drawFooter(ctx);
  await saveCanvas(canvas, `consulmax-${slug(input.title)}-${slug(input.label)}-${slug(input.name)}.png`);
}

export async function downloadRankingSummaryFeedCard(input: SummaryFeedInput) {
  const { canvas, ctx } = createCanvas();
  drawBase(ctx);
  await drawBrand(ctx);

  ctx.fillStyle = GOLD;
  ctx.font = "900 34px Manrope, Arial, sans-serif";
  ctx.fillText(input.title.toUpperCase(), 64, 218);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "500 22px Manrope, Arial, sans-serif";
  ctx.fillText(input.periodLabel, 64, 256);

  const items = input.items.slice(0, 5);
  const startY = 300;
  const rowH = 126;
  items.forEach((item, index) => {
    const y = startY + index * 135;
    fillRoundRect(ctx, 64, y, 952, rowH, 28, "rgba(255,255,255,0.96)");
    fillRoundRect(ctx, 82, y + 18, 54, 90, 18, index === 0 ? GOLD : RUBY);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 25px Manrope, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(index + 1), 109, y + 73);
    ctx.textAlign = "left";

    ctx.fillStyle = "#64748B";
    ctx.font = "900 18px Manrope, Arial, sans-serif";
    ctx.fillText(item.label.toUpperCase(), 164, y + 34);

    ctx.fillStyle = NAVY;
    ctx.font = "900 31px Manrope, Arial, sans-serif";
    drawWrappedText(ctx, item.name || "Sem registros", 164, y + 75, 550, 34, 1);

    ctx.fillStyle = RUBY;
    ctx.font = "900 31px Manrope, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(item.value || "—", 978, y + 75);
    ctx.textAlign = "left";

    if (item.helper) {
      ctx.fillStyle = "#94A3B8";
      ctx.font = "600 17px Manrope, Arial, sans-serif";
      drawWrappedText(ctx, item.helper, 164, y + 103, 800, 22, 1);
    }
  });

  drawFooter(ctx);
  await saveCanvas(canvas, `consulmax-${slug(input.title)}-${slug(input.periodLabel)}.png`);
}
