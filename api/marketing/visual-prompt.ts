import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser, json, supabaseAdmin, unauthorized } from "../_supabase.js";

type VisualItem = {
  index?: number;
  role?: string;
  eyebrow?: string;
  headline?: string;
  body?: string;
  bullets?: string[];
  columns?: Array<{ title?: string; items?: string[] }>;
  interaction?: { type?: string; label?: string; options?: string[] };
  motif?: string;
  accent?: string;
  visual_direction?: string;
};

type VisualSpec = {
  format?: string;
  visual_language?: string;
  creative_rationale?: string;
  design_rules?: string[];
  items?: VisualItem[];
  caption_or_support?: string;
  quality_checks?: string[];
};

type RequestBody = {
  production_order_id?: string;
  creative_spec?: VisualSpec | null;
};

const CONSULMAX_COLORS = ["#1E293F", "#A11C27", "#B5A573", "#E0CE8C", "#F5F5F5"];
const CANVA_MAX_IMAGES_PER_PROMPT = 6;
const FIREFLY_COMPACT_TARGET = 1100;

async function requireAdmin(req: VercelRequest, res: VercelResponse) {
  const { user } = await getAuthUser(req);
  if (!user) {
    unauthorized(res);
    return null;
  }
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error || data?.role !== "admin") {
    json(res, 403, { ok: false, message: "A Produção está restrita a administradores." });
    return null;
  }
  return user;
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function extractHexColors(value: unknown, output: string[] = []) {
  if (typeof value === "string") {
    const matches = value.match(/#[0-9a-fA-F]{6}\b/g) || [];
    output.push(...matches.map((item) => item.toUpperCase()));
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => extractHexColors(item, output));
    return output;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => extractHexColors(item, output));
  }
  return output;
}

function dimensionsFor(format: string, provider: string) {
  const normalized = format.toLowerCase();
  const channel = provider.toLowerCase();
  if (["stories", "status", "reel", "short", "video"].includes(normalized)) {
    return { width: 1080, height: 1920, ratio: "9:16", label: "1080 x 1920 px" };
  }
  if (normalized === "youtube_long" || channel.includes("youtube") && normalized === "thumbnail") {
    return { width: 1280, height: 720, ratio: "16:9", label: "1280 x 720 px" };
  }
  return { width: 1080, height: 1350, ratio: "4:5", label: "1080 x 1350 px" };
}

function formatLabel(format: string) {
  const labels: Record<string, string> = {
    carrossel: "carrossel",
    stories: "sequência de Stories",
    status: "sequência de Status do WhatsApp",
    post: "post estático",
    reel: "capa de Reel",
    short: "capa de YouTube Short",
    youtube_long: "thumbnail de YouTube",
    video: "capa de vídeo",
  };
  return labels[format] || format || "peça visual";
}

function exactTextBlock(item: VisualItem) {
  const lines: string[] = [];
  if (item.eyebrow) lines.push(`Eyebrow: “${item.eyebrow}”`);
  if (item.headline) lines.push(`Título: “${item.headline}”`);
  if (item.body) lines.push(`Texto de apoio: “${item.body}”`);
  if (Array.isArray(item.bullets) && item.bullets.length) {
    lines.push("Bullets:");
    item.bullets.forEach((bullet) => lines.push(`- “${bullet}”`));
  }
  if (Array.isArray(item.columns) && item.columns.length) {
    item.columns.forEach((column, index) => {
      lines.push(`Coluna ${index + 1}${column.title ? ` — “${column.title}”` : ""}:`);
      (column.items || []).forEach((entry) => lines.push(`- “${entry}”`));
    });
  }
  if (item.interaction?.label) lines.push(`CTA/interação: “${item.interaction.label}”`);
  if (Array.isArray(item.interaction?.options) && item.interaction!.options!.length) {
    lines.push(`Opções: ${item.interaction!.options!.map((option) => `“${option}”`).join(" | ")}`);
  }
  return lines.join("\n") || "Sem texto obrigatório nesta tela.";
}

function brandIdentity(input: {
  kitName: string;
  payload: Record<string, unknown> | null;
  assets: Array<{ asset_type?: string; role?: string; file_name?: string; metadata?: any }>;
}) {
  const extracted = unique(extractHexColors(input.payload || {}));
  const colors = extracted.length >= 4 ? extracted.slice(0, 8) : CONSULMAX_COLORS;
  const fontFiles = input.assets
    .filter((asset) => asset.asset_type === "font")
    .map((asset) => String(asset.file_name || "").trim())
    .filter(Boolean);
  const fontText = fontFiles.length
    ? unique(fontFiles).join(", ")
    : "Manrope Bold para títulos; Manrope Regular para apoio; Anthony Hunter Italic apenas em destaques pontuais";
  const slogan = typeof input.payload?.slogan === "string"
    ? input.payload.slogan
    : "Transformando sonhos em conquistas reais.";
  return {
    name: input.kitName || "Consulmax Oficial",
    colors,
    fonts: fontText,
    slogan,
    style: "premium, clean, moderna, institucional, sofisticada, humana e com aparência de agência de alto padrão",
  };
}

function sharedVisualRules() {
  return [
    "IDENTIDADE FIXA, COMPOSIÇÃO VARIÁVEL: mantenha cores, tipografia, logotipo e linguagem da marca, mas varie a composição conforme a função de cada tela.",
    "O conteúdo deve comandar o design; não force todos os cards para o mesmo template.",
    "Use muito respiro, hierarquia tipográfica forte, poucos elementos e ótima legibilidade em celular.",
    "Pode usar boxes, linhas, números, comparativos, pequenos diagramas, fotografia ou ilustração apenas quando ajudarem a explicar a ideia.",
    "Evite aparência genérica de IA, template barato, PowerPoint, excesso de efeitos, gradientes, brilhos, 3D, sombras fortes, ícones aleatórios e poluição visual.",
    "Não invente cores, fontes, logos, dados, promessas, taxas, resultados ou informações que não estejam no conteúdo fornecido.",
  ];
}

function canvaPrompt(input: {
  batch: VisualItem[];
  batchIndex: number;
  batchCount: number;
  total: number;
  format: string;
  provider: string;
  dimensions: ReturnType<typeof dimensionsFor>;
  identity: ReturnType<typeof brandIdentity>;
  objective?: string | null;
  audience?: string | null;
  thesis?: string | null;
}) {
  const start = Number(input.batch[0]?.index || (input.batchIndex * CANVA_MAX_IMAGES_PER_PROMPT + 1));
  const end = Number(input.batch[input.batch.length - 1]?.index || start + input.batch.length - 1);
  const cards = input.batch.map((item, position) => {
    const index = Number(item.index || start + position);
    const visual = String(item.visual_direction || "Composição autoral coerente com a função desta tela.").trim();
    return `\nCARD ${index} — função: ${item.role || "editorial"}\nTEXTO OBRIGATÓRIO:\n${exactTextBlock(item)}\nDIREÇÃO DE COMPOSIÇÃO:\n${visual}`;
  }).join("\n");

  return `Crie EXATAMENTE ${input.batch.length} imagens separadas para ${formatLabel(input.format)}, correspondentes aos cards ${start} a ${end} de um conjunto total de ${input.total} imagens. Cada imagem deve ter ${input.dimensions.label}, proporção ${input.dimensions.ratio}.\n\nREGRA CRÍTICA DE IDIOMA E TEXTO: TODO O TEXTO DEVE PERMANECER EM PORTUGUÊS DO BRASIL, EXATAMENTE COMO FORNECIDO ABAIXO. NÃO TRADUZA PARA INGLÊS. NÃO REESCREVA, NÃO RESUMA, NÃO CORRIJA, NÃO COMPLETE E NÃO CRIE TEXTO NOVO.\n\nMARCA: ${input.identity.name}\nCORES OBRIGATÓRIAS: ${input.identity.colors.join(", ")}\nTIPOGRAFIA OFICIAL: ${input.identity.fonts}\nSLOGAN OFICIAL: “${input.identity.slogan}” — usar apenas quando fizer sentido.\nESTILO: ${input.identity.style}.\n\nCONTEXTO: canal ${input.provider}; objetivo: ${input.objective || "educar, gerar autoridade e conduzir a uma ação coerente"}; público: ${input.audience || "público definido no conteúdo"}; tese: ${input.thesis || "preservar integralmente a tese aprovada"}.\n\n${sharedVisualRules().map((rule) => `- ${rule}`).join("\n")}\n\nIMPORTANTE: mantenha coerência visual entre os ${input.total} cards, mas NÃO repita o mesmo layout. Este é o lote ${input.batchIndex + 1} de ${input.batchCount}. Se houver lote anterior, preserve a mesma identidade e continuidade visual sem copiar a composição.\n${cards}\n\nEntregue somente as ${input.batch.length} imagens solicitadas neste lote.`;
}

function fireflyPrompt(input: {
  item: VisualItem;
  total: number;
  format: string;
  dimensions: ReturnType<typeof dimensionsFor>;
  identity: ReturnType<typeof brandIdentity>;
}) {
  const index = Number(input.item.index || 1);
  const textBlock = exactTextBlock(input.item);
  const visualDirection = String(input.item.visual_direction || "Composição editorial autoral, limpa e premium.").trim();
  const identity = `Marca ${input.identity.name}. Cores: ${input.identity.colors.slice(0, 5).join(", ")}. Fontes: ${input.identity.fonts}.`;
  const critical = "Todo o texto deve ficar em português do Brasil EXATAMENTE como fornecido; não traduzir, reescrever, resumir ou inventar texto.";
  const base = `Crie 1 imagem — card ${index}/${input.total} de ${formatLabel(input.format)} — ${input.dimensions.label} (${input.dimensions.ratio}). ${critical} ${identity} Visual premium, clean, institucional, sofisticado, com hierarquia forte e muito respiro. Composição variável conforme o conteúdo; evitar template genérico, aparência de IA, excesso de efeitos e elementos decorativos.\nTEXTO OBRIGATÓRIO:\n${textBlock}\nCOMPOSIÇÃO: ${visualDirection}`;
  if (base.length <= FIREFLY_COMPACT_TARGET) return base;

  const compactIdentity = `Consulmax. Cores ${input.identity.colors.slice(0, 5).join(", ")}. Manrope para títulos/textos e Anthony Hunter Italic somente em destaque.`;
  const room = Math.max(80, FIREFLY_COMPACT_TARGET - compactIdentity.length - critical.length - textBlock.length - 220);
  const compactVisual = visualDirection.slice(0, room);
  return `1 imagem, card ${index}/${input.total}, ${input.dimensions.label} ${input.dimensions.ratio}. ${critical} ${compactIdentity} Premium, clean, institucional, muito respiro, composição autoral e sem cara de template.\nTEXTO:\n${textBlock}\nVISUAL: ${compactVisual}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method not allowed" });
  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const body = (req.body || {}) as RequestBody;
    const orderId = String(body.production_order_id || "").trim();
    if (!orderId) return json(res, 400, { ok: false, message: "Ordem de produção obrigatória." });

    const { data: order, error: orderError } = await supabaseAdmin
      .from("marketing_production_orders")
      .select("id,content_id,variant_id,provider,format,title,brand_kit_setting_id,blueprint,metadata")
      .eq("id", orderId)
      .single();
    if (orderError || !order) throw orderError || new Error("Ordem de produção não encontrada.");

    const [contentRes, variantRes, kitRes, assetsRes] = await Promise.all([
      supabaseAdmin.from("marketing_content_items").select("title,theme,thesis,objective,audience,segment,content_pillar,cta,ai_context").eq("id", order.content_id).maybeSingle(),
      order.variant_id
        ? supabaseAdmin.from("marketing_content_variants").select("title,hook,body,caption,script,cta,creative_brief,ai_generation_metadata").eq("id", order.variant_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      order.brand_kit_setting_id
        ? supabaseAdmin.from("marketing_content_settings").select("id,name,payload,active").eq("id", order.brand_kit_setting_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      order.brand_kit_setting_id
        ? supabaseAdmin.from("marketing_brand_assets").select("asset_type,role,file_name,metadata,is_primary,active").eq("setting_id", order.brand_kit_setting_id).eq("active", true)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (contentRes.error) throw contentRes.error;
    if (variantRes.error) throw variantRes.error;
    if (kitRes.error) throw kitRes.error;
    if (assetsRes.error) throw assetsRes.error;

    const spec = (body.creative_spec || order.metadata?.visual_spec_v2 || order.metadata?.canva_creative_spec || null) as VisualSpec | null;
    const items = Array.isArray(spec?.items) ? spec!.items!.filter(Boolean) : [];
    if (!items.length) {
      return json(res, 409, {
        ok: false,
        code: "creative_spec_required",
        message: "A direção criativa precisa ser gerada antes do prompt visual.",
      });
    }

    const format = String(order.format || spec?.format || "post").toLowerCase();
    const provider = String(order.provider || "social");
    const dimensions = dimensionsFor(format, provider);
    const identity = brandIdentity({
      kitName: String(kitRes.data?.name || "Consulmax Oficial"),
      payload: (kitRes.data?.payload || null) as Record<string, unknown> | null,
      assets: (assetsRes.data || []) as any[],
    });

    const batches: VisualItem[][] = [];
    for (let index = 0; index < items.length; index += CANVA_MAX_IMAGES_PER_PROMPT) {
      batches.push(items.slice(index, index + CANVA_MAX_IMAGES_PER_PROMPT));
    }

    const canvaBatches = batches.map((batch, index) => {
      const prompt = canvaPrompt({
        batch,
        batchIndex: index,
        batchCount: batches.length,
        total: items.length,
        format,
        provider,
        dimensions,
        identity,
        objective: contentRes.data?.objective || null,
        audience: contentRes.data?.audience || null,
        thesis: contentRes.data?.thesis || null,
      });
      return {
        index: index + 1,
        from_item: Number(batch[0]?.index || index * CANVA_MAX_IMAGES_PER_PROMPT + 1),
        to_item: Number(batch[batch.length - 1]?.index || Math.min(items.length, (index + 1) * CANVA_MAX_IMAGES_PER_PROMPT)),
        image_count: batch.length,
        char_count: prompt.length,
        prompt,
      };
    });

    const fireflyCards = items.map((item, index) => {
      const prompt = fireflyPrompt({ item: { ...item, index: Number(item.index || index + 1) }, total: items.length, format, dimensions, identity });
      return { index: Number(item.index || index + 1), char_count: prompt.length, compact_target: FIREFLY_COMPACT_TARGET, prompt };
    });

    const revision = Number(order.metadata?.visual_prompt_revision || 0) + 1;
    const packagePayload = {
      revision,
      generated_at: new Date().toISOString(),
      mode: "external_visual_studio",
      philosophy: "identidade_fixa_composicao_variavel_conteudo_comanda_design",
      format,
      provider,
      dimensions,
      total_items: items.length,
      identity,
      canva: {
        max_images_per_prompt: CANVA_MAX_IMAGES_PER_PROMPT,
        batch_count: canvaBatches.length,
        prompts: canvaBatches,
      },
      firefly: {
        strategy: "um_card_por_prompt_compacto",
        compact_target: FIREFLY_COMPACT_TARGET,
        prompts: fireflyCards,
      },
      creative_spec: spec,
    };

    const metadata = {
      ...(order.metadata || {}),
      visual_prompt_package: packagePayload,
      visual_prompt_revision: revision,
      visual_prompt_generated_at: packagePayload.generated_at,
      visual_prompt_mode: "external_visual_studio",
      visual_spec_v2: spec,
    };
    const { error: updateError } = await supabaseAdmin
      .from("marketing_production_orders")
      .update({ metadata, status: "aguardando_producao", updated_at: new Date().toISOString() })
      .eq("id", order.id);
    if (updateError) throw updateError;

    return json(res, 200, { ok: true, package: packagePayload });
  } catch (error: any) {
    console.error("[visual-prompt]", error);
    return json(res, Number(error?.status || 500), {
      ok: false,
      message: error?.message || "Não foi possível gerar o prompt visual.",
    });
  }
}
