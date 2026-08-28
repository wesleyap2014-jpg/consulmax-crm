import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser, json, supabaseAdmin, unauthorized } from "../_supabase";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

type Action = "create" | "refine";
type AssetKind = "static" | "thumbnail";

type RequestBody = {
  production_order_id?: string;
  action?: Action;
  asset_kind?: AssetKind;
  current_spec?: Record<string, unknown> | null;
  instructions?: string;
  target?: string | number | null;
};

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

function parseJson(value: string) {
  const cleaned = value.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("A IA não retornou uma direção visual JSON válida.");
  return JSON.parse(cleaned.slice(first, last + 1));
}

function formatRules(format: string, assetKind: AssetKind) {
  if (assetKind === "thumbnail") {
    return `THUMBNAIL/CAPA:
- Uma única mensagem principal, idealmente entre 3 e 8 palavras.
- Alto contraste e leitura instantânea em tela pequena.
- Não transformar a capa em mini-carrossel.
- Use no máximo uma linha de apoio muito curta quando indispensável.
- Composição editorial premium, com um motivo visual simples e forte.
- Nunca escrever "CONTEÚDO", "Brand Kit" ou nomes técnicos de produção na arte.`;
  }
  if (format === "carrossel") {
    return `CARROSSEL:
- Pense como sequência editorial de leitura, não como apresentação de slides.
- Cada card precisa ter uma função diferente e avançar o raciocínio.
- Use funções entre: cover, concept, bullets, comparison, steps, error, proof, conclusion, cta.
- Não repita o mesmo layout em todos os cards.
- A capa deve ter gancho forte e pouco texto.
- Cards internos podem usar bullets, duas colunas, passos, números, contraste ou pequenos diagramas.
- Um card = uma ideia principal.
- Priorize de 5 a 8 cards, salvo se a estrutura aprovada exigir outra quantidade.
- O último card deve fechar a tese ou convidar para uma ação coerente.`;
  }
  if (format === "stories") {
    return `STORIES:
- Stories são conversa em sequência, não carrossel vertical.
- Leitura muito rápida e pouco texto por tela.
- Estrutura preferencial: hook/pergunta → contexto → insight/explicação → prova/aplicação → CTA.
- Use funções entre: hook, question, poll, context, insight, proof, cta.
- Quando fizer sentido, inclua interação: enquete, pergunta ou escolha simples.
- Cada frame deve funcionar em poucos segundos e criar vontade de avançar.
- Evite títulos longos, parágrafos e repetição de layout.`;
  }
  if (format === "status") {
    return `WHATSAPP STATUS:
- Sequência curta, direta e conversacional.
- Uma mensagem por tela, com leitura imediata.
- Estrutura preferencial: frase de impacto → explicação curta → aplicação → CTA para conversa.
- Use no máximo 3 a 5 telas quando possível.
- Evite aparência de anúncio pesado e excesso de texto.`;
  }
  if (format === "post") {
    return `POST ESTÁTICO:
- Uma única ideia forte.
- Não reproduza um carrossel inteiro em uma imagem.
- Headline curta, apoio mínimo e uma composição visual forte.
- Para LinkedIn, prefira sobriedade editorial; para Instagram/Facebook, mantenha impacto sem parecer anúncio genérico.`;
  }
  return `PEÇA VISUAL:
- Uma ideia principal por tela.
- Design editorial premium, limpo, legível e nativo do canal.
- Evite repetir a mesma estrutura visual entre peças.`;
}

function schemaInstruction(format: string, assetKind: AssetKind) {
  const count = assetKind === "thumbnail" ? "1" : format === "carrossel" ? "5 a 8" : format === "stories" ? "3 a 6" : format === "status" ? "3 a 5" : "1";
  return `Responda SOMENTE JSON válido neste formato:
{
  "format": "${assetKind === "thumbnail" ? "thumbnail" : format}",
  "visual_language": "premium_editorial_clean",
  "creative_rationale": "explicação curta da lógica visual",
  "design_rules": ["..."],
  "items": [
    {
      "index": 1,
      "role": "cover|concept|bullets|comparison|steps|error|proof|conclusion|cta|hook|question|poll|context|insight|static_post|thumbnail",
      "eyebrow": "texto opcional curto",
      "headline": "headline principal",
      "body": "texto de apoio curto",
      "bullets": ["item curto"],
      "columns": [
        {"title": "coluna A", "items": ["..."]},
        {"title": "coluna B", "items": ["..."]}
      ],
      "interaction": {"type": "none|poll|question|cta", "label": "...", "options": ["..."]},
      "motif": "none|growth|flow|balance|building|numbers|quote|target|comparison",
      "accent": "navy|red|gold|neutral",
      "visual_direction": "instrução curta de composição"
    }
  ],
  "caption_or_support": "texto complementar opcional",
  "quality_checks": ["..."]
}

Quantidade esperada de items: ${count}.
Não inclua campos desnecessários só para preencher o JSON. Arrays podem ficar vazios quando o layout não precisar deles.`;
}

function systemPrompt() {
  return `Você é o Diretor de Arte e Estrategista Visual da Consulmax.

Sua função é transformar um blueprint editorial aprovado em uma PEÇA NATIVA DO FORMATO, com aparência de agência premium e sem cara de template genérico ou arte de IA barata.

DIREÇÃO VISUAL PADRÃO:
- premium, clean, moderna, institucional, sofisticada e humana;
- muito respiro visual, mas nunca vazio sem função;
- hierarquia tipográfica forte;
- poucos elementos por tela;
- contraste claro e composição equilibrada;
- usar caixas, linhas, números, comparativos, pequenos diagramas e motivos abstratos quando ajudarem a explicar;
- evitar excesso de gradientes, brilhos, sombras, emojis, ícones aleatórios e elementos decorativos sem função;
- não transformar todas as peças em anúncio;
- não repetir o mesmo layout em toda a sequência;
- preservar a identidade do Brand Kit e nunca inventar cores, fontes ou logotipos;
- quando houver texto, escreva pouco e com clareza. Não encha a arte com parágrafos;
- o design deve parecer feito por uma agência de marketing reconhecida, não por um gerador automático.

REGRAS DE CONTEÚDO:
- preserve a tese, o sentido e as informações aprovadas;
- não invente taxas, números, resultados, garantias, contemplações ou fatos;
- se o blueprint não sustentar uma afirmação específica, não crie essa afirmação;
- mantenha português do Brasil natural e profissional;
- um formato pode aprofundar a tese, mas não deve contradizer o Conteúdo-Mãe.

AJUSTES:
- quando a ação for REFINE, preserve tudo que não foi pedido para mudar;
- se o usuário indicar um card/frame específico, altere apenas ele, salvo quando a mudança exigir coerência mínima nos demais;
- pedidos como "mais clean", "menos texto", "mais premium" devem alterar composição e densidade, não a tese;
- gere uma nova versão, nunca descreva apenas o que faria.

Você deve retornar SOMENTE JSON válido.`;
}

async function callOpenAI(prompt: string) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada na Vercel.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 800)}`);
  const payload = await response.json();
  const content = String(payload?.choices?.[0]?.message?.content || "");
  return parseJson(content);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method not allowed" });
  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const body = (req.body || {}) as RequestBody;
    const orderId = String(body.production_order_id || "");
    if (!orderId) return json(res, 400, { ok: false, message: "Ordem de produção obrigatória." });

    const { data: order, error: orderError } = await supabaseAdmin
      .from("marketing_production_orders")
      .select("id,content_id,variant_id,provider,format,title,brand_kit_setting_id,blueprint,metadata")
      .eq("id", orderId)
      .single();
    if (orderError || !order) throw orderError || new Error("Ordem de produção não encontrada.");

    const [contentRes, variantRes, kitRes, brandAssetsRes] = await Promise.all([
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
    if (brandAssetsRes.error) throw brandAssetsRes.error;

    const format = String(order.format || "post").toLowerCase();
    const assetKind: AssetKind = body.asset_kind === "thumbnail" ? "thumbnail" : "static";
    const action: Action = body.action === "refine" ? "refine" : "create";
    const instructions = String(body.instructions || "").trim().slice(0, 5000);
    const target = body.target ?? null;

    const prompt = action === "refine"
      ? `REFINE a direção visual atual conforme a orientação do usuário.

CANAL/FORMATO: ${order.provider} / ${format}
TIPO DE SAÍDA: ${assetKind}
ALVO DO AJUSTE: ${target === null || target === "all" ? "peça inteira" : `item ${target}`}
ORIENTAÇÃO DO USUÁRIO:
${instructions || "Crie uma nova variação mantendo a tese e elevando a qualidade visual."}

CONTEÚDO-MÃE:
${JSON.stringify(contentRes.data || {}).slice(0, 14000)}

BLUEPRINT APROVADO:
${JSON.stringify(order.blueprint || {}).slice(0, 18000)}

VERSÃO EDITORIAL:
${JSON.stringify(variantRes.data || {}).slice(0, 12000)}

BRAND KIT:
${JSON.stringify(kitRes.data || {}).slice(0, 10000)}

ATIVOS OFICIAIS:
${JSON.stringify(brandAssetsRes.data || []).slice(0, 6000)}

DIREÇÃO VISUAL ATUAL:
${JSON.stringify(body.current_spec || {}).slice(0, 22000)}

${formatRules(format, assetKind)}

${schemaInstruction(format, assetKind)}`
      : `CRIE a direção de produção visual para esta peça já aprovada editorialmente.

CANAL/FORMATO: ${order.provider} / ${format}
TIPO DE SAÍDA: ${assetKind}

CONTEÚDO-MÃE:
${JSON.stringify(contentRes.data || {}).slice(0, 14000)}

BLUEPRINT APROVADO:
${JSON.stringify(order.blueprint || {}).slice(0, 18000)}

VERSÃO EDITORIAL:
${JSON.stringify(variantRes.data || {}).slice(0, 12000)}

BRAND KIT:
${JSON.stringify(kitRes.data || {}).slice(0, 10000)}

ATIVOS OFICIAIS:
${JSON.stringify(brandAssetsRes.data || []).slice(0, 6000)}

${formatRules(format, assetKind)}

${schemaInstruction(format, assetKind)}`;

    const result = await callOpenAI(prompt);
    return json(res, 200, { ok: true, result, generated_for: { format, asset_kind: assetKind, action } });
  } catch (err: any) {
    console.error("[production-visual]", err);
    return json(res, 500, {
      ok: false,
      message: "Não foi possível preparar a direção visual agora.",
      detail: String(err?.message || err).slice(0, 900),
    });
  }
}
