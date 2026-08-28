import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser, json, supabaseAdmin, unauthorized } from "../_supabase";

type EditorialSetting = {
  setting_type: string;
  name: string;
  payload: Record<string, unknown>;
};

type ContentInput = {
  id?: string;
  title: string;
  theme?: string | null;
  thesis?: string | null;
  objective?: string | null;
  audience?: string | null;
  segment?: string | null;
  content_pillar?: string | null;
  cta?: string | null;
};

type RequestBody = {
  action?: "structure" | "revise";
  content?: ContentInput;
  current_strategy?: Record<string, unknown> | null;
  instructions?: string;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
    json(res, 403, { ok: false, message: "A Central de Conteúdo está restrita a administradores." });
    return null;
  }

  return user;
}

function parseJsonObject(value: string) {
  const cleaned = value.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("Resposta da IA não contém JSON válido.");
  return JSON.parse(cleaned.slice(first, last + 1));
}

async function loadEditorialContext() {
  const { data: settings, error } = await supabaseAdmin
    .from("marketing_content_settings")
    .select("id,setting_type,name,payload")
    .eq("active", true)
    .order("setting_type", { ascending: true });

  if (error) {
    console.warn("[content-strategy] configurações editoriais indisponíveis", error.message);
    return [] as EditorialSetting[];
  }

  const rows = (settings || []) as Array<EditorialSetting & { id?: string }>;
  const brandIds = rows.filter((item) => item.setting_type === "brand_kit" && item.id).map((item) => String(item.id));
  if (!brandIds.length) return rows;

  const { data: assets } = await supabaseAdmin
    .from("marketing_brand_assets")
    .select("setting_id,asset_type,role,file_name,mime_type,metadata,is_primary,active")
    .in("setting_id", brandIds)
    .eq("active", true)
    .order("is_primary", { ascending: false });

  return rows.map((setting) => {
    if (setting.setting_type !== "brand_kit") return setting;
    const officialAssets = (assets || [])
      .filter((asset: any) => String(asset.setting_id) === String(setting.id))
      .map((asset: any) => ({
        asset_type: asset.asset_type,
        role: asset.role,
        file_name: asset.file_name,
        mime_type: asset.mime_type,
        is_primary: asset.is_primary,
        metadata: asset.metadata || {},
      }));
    return { ...setting, payload: { ...(setting.payload || {}), official_assets: officialAssets } };
  });
}

function systemPrompt(settings: EditorialSetting[]) {
  const editorialContext = settings.length
    ? `\n\nCONSTITUIÇÃO EDITORIAL ATIVA DO CRM:\n${JSON.stringify(settings).slice(0, 22000)}\n\nUse Brand Kit, Personas, Linha Editorial, Autonomia e Community Manager como regras operacionais. Em caso de conflito, segurança, compliance e verdade factual prevalecem.`
    : "";

  return `Você é o Estrategista de Conteúdo e Head Editorial da Consulmax.

Sua função não é criar posts isolados. Sua função é transformar uma ideia em uma tese forte e operá-la no fluxo:
IDEIA → TESTE → VALIDAÇÃO → APROFUNDAMENTO → DISTRIBUIÇÃO → CONVERSA → VENDA.

PRINCÍPIOS:
- Escreva em português do Brasil.
- Uma boa ideia vem antes do formato.
- Antes de produzir, organize: público, problema, desejo, transformação, tese, crença a reforçar/questionar/substituir, motivo para prestar atenção agora, prova/lógica e próxima ação.
- Resuma a tese central em uma frase forte e simples.
- Escolha um ângulo principal entre: dor/problema, erro, prova real, história, bastidor, opinião, tutorial/passo a passo, pergunta, comparação.
- Classifique a ideia como HERO, HUB ou HELP. HERO chama atenção; HUB sustenta relacionamento/comunidade; HELP educa e resolve dúvidas. Considere 10–20% HERO, 30–40% HUB e cerca de 50% HELP como equilíbrio de portfólio, não como regra rígida para uma peça isolada.
- A peça inicial de teste deve ser de baixo custo e rápida. Por padrão, use Instagram Reel, salvo razão editorial forte em contrário.
- O Reel deve usar C + A + M1 + M2 + M3 + C: Convite, Acordo, três mensagens que avançam o raciocínio, Conclusão; depois CTA coerente.
- Convite deve interromper padrão. Evite “Hoje eu quero falar”, “Você sabia que” e “Olá pessoal”.
- Acordo cria concordância lógica sem repetir o gancho.
- M1 diagnostica, M2 explica mecanismo, M3 aplica/concretiza. Não repita a mesma ideia em três frases.
- Conclusão deve fechar a tese de forma memorável.
- CTA pode ser engajamento, conversa, lead ou conversão. Não transforme todo conteúdo em propaganda.
- Priorize naturalidade, clareza, proximidade e autoridade. Evite edição excessiva; indique B-roll/cortes apenas quando melhorarem compreensão ou retenção.
- Stories são conversa, não álbum da vida; devem criar identificação, interação e, quando fizer sentido, conduzir para Direct/WhatsApp.
- Após validação, aprofunde a mesma tese em carrossel, Stories, LinkedIn, TikTok, YouTube Short, YouTube longo, WhatsApp e Facebook quando fizer sentido.
- Não copie o Reel para todas as redes. Preserve a tese e adapte linguagem, profundidade, hook e CTA de forma nativa.
- A etapa de aprofundamento/distribuição aqui é PLANEJAMENTO. Não trate essas peças como produzidas antes da validação do teste.
- Para validação, não invente metas absolutas sem histórico. Defina critérios relativos ao baseline da conta e dê peso adicional a sinais de alta intenção: comentários qualificados, Directs, WhatsApp, leads e vendas.
- Nunca prometa contemplação, rentabilidade, economia, aprovação ou resultado garantido.
- Consórcio não é solução universal. Considere perfil, objetivo, prazo, capacidade financeira e estratégia.
- Fale de consórcio como instrumento de planejamento, aquisição, patrimônio, uso inteligente de capital, prazo e estratégia — não apenas como produto.
- Linguagem simples, sem excesso de jargão. O objetivo é gerar “eu nunca tinha enxergado dessa forma” e depois “quero conversar com essa pessoa”.
- Quando houver ativos oficiais de marca, trate-os como fonte de verdade: não redesenhe logo e não substitua fonte oficial por parecida.
- Entregue SOMENTE JSON válido.${editorialContext}`;
}

function strategySchemaInstruction() {
  return `Responda EXATAMENTE com um objeto JSON neste formato lógico (pode preencher arrays com a quantidade necessária):
{
  "head_note": "resumo estratégico curto",
  "stage": "teste",
  "validation_status": "untested",
  "organized_idea": {
    "audience": "...",
    "problem": "...",
    "desire": "...",
    "transformation": "...",
    "thesis": "...",
    "belief": "...",
    "why_now": "...",
    "proof": "...",
    "next_action": "...",
    "central_phrase": "..."
  },
  "angle": { "type": "...", "reason": "..." },
  "classification": { "type": "HERO|HUB|HELP", "reason": "..." },
  "test": {
    "provider": "instagram",
    "format": "reel",
    "objective": "...",
    "title": "...",
    "thumb": "...",
    "on_screen_hook": "...",
    "cam3c": {
      "convite": "...",
      "acordo": "...",
      "m1": "...",
      "m2": "...",
      "m3": "...",
      "conclusao": "..."
    },
    "full_script": "roteiro falado completo e natural",
    "on_screen_texts": ["..."],
    "b_roll": ["..."],
    "cta_type": "engajamento|conversa|lead|conversao",
    "cta": "...",
    "caption": "...",
    "duration_seconds": 45,
    "aspect_ratio": "9:16"
  },
  "validation": {
    "signals": ["retenção", "conclusão", "compartilhamentos", "salvamentos", "comentários", "visitas ao perfil", "Directs", "WhatsApp", "leads", "conversões"],
    "weak": "critério relativo ao baseline",
    "promising": "critério relativo ao baseline",
    "validated": "critério relativo ao baseline e sinais de intenção"
  },
  "deepening_plan": {
    "instagram_carousel": { "objective": "...", "title": "...", "cards": [{"card":1,"title":"...","text":"...","visual_direction":"..."}], "cta": "..." },
    "instagram_stories": { "objective": "...", "frames": [{"frame":1,"type":"fala|texto|enquete|caixinha|cta","content":"...","interaction":"..."}], "cta": "..." },
    "tiktok": { "objective": "...", "hook": "...", "approach": "...", "cta": "..." },
    "youtube_short": { "objective": "...", "title": "...", "hook": "...", "approach": "...", "cta": "..." },
    "youtube_long": { "objective": "...", "title": "...", "outline": ["..."], "cta": "..." },
    "linkedin": { "objective": "...", "title": "...", "angle": "...", "outline": ["..."], "cta": "..." },
    "whatsapp": { "objective": "...", "status_sequence": ["..."], "cta": "..." },
    "facebook": { "use": true, "reason": "...", "format": "...", "approach": "...", "cta": "..." }
  },
  "derivations": {
    "hooks": ["...", "...", "..."],
    "story_questions": ["...", "...", "..."],
    "titles": ["...", "...", "..."],
    "opinions": ["...", "..."],
    "comparisons": ["...", "..."],
    "errors": ["...", "..."],
    "step_by_step": ["...", "..."],
    "story": "...",
    "proof": "...",
    "backstage": "..."
  },
  "next_content_recommendation": "..."
}`;
}

async function callOpenAI(messages: Array<{ role: "system" | "user"; content: string }>) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada na Vercel.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI ${response.status}: ${detail.slice(0, 700)}`);
  }

  const payload = await response.json();
  const answer = payload?.choices?.[0]?.message?.content;
  if (!answer || typeof answer !== "string") throw new Error("A IA não retornou estratégia de conteúdo.");
  return parseJsonObject(answer);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method not allowed" });
  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const body = (req.body || {}) as RequestBody;
    const content = body.content;
    if (!content?.title) return json(res, 400, { ok: false, message: "Conteúdo-Mãe é obrigatório." });

    const settings = await loadEditorialContext();
    const action = body.action || "structure";
    const additional = String(body.instructions || "").slice(0, 5000);

    const userPrompt = action === "revise"
      ? `Revise a estratégia abaixo mantendo a mesma tese central, salvo quando a orientação pedir explicitamente mudança de tese. Preserve o fluxo TESTE → VALIDAÇÃO → APROFUNDAMENTO → DISTRIBUIÇÃO.\n\nCONTEÚDO-MÃE:\n${JSON.stringify(content)}\n\nESTRATÉGIA ATUAL:\n${JSON.stringify(body.current_strategy || {}).slice(0, 30000)}\n\nORIENTAÇÃO DE REVISÃO:\n${additional}\n\n${strategySchemaInstruction()}`
      : `Estruture o Conteúdo-Mãe abaixo usando o Motor de Conteúdo Consulmax. Não gere oito peças como se já estivessem prontas. Crie UMA peça de teste detalhada e um PLANO de aprofundamento/distribuição que só deverá virar produção após validação.\n\nCONTEÚDO-MÃE:\n${JSON.stringify(content)}\n\nORIENTAÇÕES ADICIONAIS:\n${additional}\n\n${strategySchemaInstruction()}`;

    const result = await callOpenAI([
      { role: "system", content: systemPrompt(settings) },
      { role: "user", content: userPrompt },
    ]);

    return json(res, 200, { ok: true, result, editorial_settings_used: settings.length });
  } catch (error: any) {
    console.error("[content-strategy]", error);
    return json(res, 500, {
      ok: false,
      message: "Não foi possível estruturar o conteúdo agora.",
      detail: String(error?.message || error).slice(0, 900),
    });
  }
}
