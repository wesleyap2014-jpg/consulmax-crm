import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser, json, supabaseAdmin, unauthorized } from "../_supabase";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function requireAdmin(req: VercelRequest, res: VercelResponse) {
  const { user } = await getAuthUser(req);
  if (!user) { unauthorized(res); return null; }
  const { data } = await supabaseAdmin.from("users").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (data?.role !== "admin") { json(res, 403, { ok: false, message: "A Produção está restrita a administradores." }); return null; }
  return user;
}

function parseJson(value: string) {
  const cleaned = value.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("A IA não retornou um plano JSON válido.");
  return JSON.parse(cleaned.slice(first, last + 1));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method not allowed" });
  const user = await requireAdmin(req, res);
  if (!user) return;
  try {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada.");
    const productionOrderId = String(req.body?.production_order_id || "");
    if (!productionOrderId) return json(res, 400, { ok: false, message: "Ordem de produção obrigatória." });

    const { data: order, error: orderError } = await supabaseAdmin
      .from("marketing_production_orders")
      .select("id,content_id,variant_id,provider,format,title,status,blueprint,metadata")
      .eq("id", productionOrderId)
      .single();
    if (orderError || !order) throw orderError || new Error("Ordem não encontrada.");

    const [contentRes, variantRes, assetsRes] = await Promise.all([
      supabaseAdmin.from("marketing_content_items").select("title,objective,audience,thesis,ai_context").eq("id", order.content_id).maybeSingle(),
      order.variant_id ? supabaseAdmin.from("marketing_content_variants").select("title,hook,script,caption,cta,duration_seconds,creative_brief").eq("id", order.variant_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
      supabaseAdmin.from("marketing_content_assets").select("id,file_name,mime_type,duration_seconds,width,height,asset_role,metadata,created_at").eq("production_order_id", order.id).order("created_at", { ascending: true }),
    ]);
    if (contentRes.error) throw contentRes.error;
    if (variantRes.error) throw variantRes.error;
    if (assetsRes.error) throw assetsRes.error;

    const inputs = (assetsRes.data || []).filter((asset: any) => String(asset.asset_role || "").startsWith("input_"));
    if (!inputs.length) return json(res, 400, { ok: false, message: "Envie os takes/cortes antes da análise." });

    const prompt = `Você é um editor de vídeo sênior da Consulmax. Prepare um PLANO DE EDIÇÃO executável para um editor/renderizador a partir do roteiro aprovado e dos arquivos brutos disponíveis.\n\nIMPORTANTE: você NÃO assistiu aos arquivos. Portanto não invente conteúdo, timestamps, falas ou qualidade visual que não estão nos metadados. Quando uma decisão exigir inspeção real do vídeo, marque explicitamente como \"requires_media_inspection\": true. O plano deve orientar a inspeção posterior e a montagem, não fingir que ela já ocorreu.\n\nDireção: edição premium, limpa, natural e profissional; evitar excesso de efeitos, zooms, emojis e poluição visual. Priorizar fala, clareza, cortes que removam silêncio/erro/repetição, legendas legíveis e identidade do Brand Kit.\n\nORDEM:\n${JSON.stringify(order)}\n\nCONTEÚDO-MÃE:\n${JSON.stringify(contentRes.data || {})}\n\nVERSÃO APROVADA:\n${JSON.stringify(variantRes.data || {})}\n\nARQUIVOS DISPONÍVEIS:\n${JSON.stringify(inputs)}\n\nResponda SOMENTE JSON neste formato:\n{\n  \"summary\": \"...\",\n  \"target_duration_seconds\": 45,\n  \"editing_style\": \"...\",\n  \"timeline_plan\": [\n    {\"order\":1,\"purpose\":\"hook|agreement|m1|m2|m3|conclusion|cta|broll\",\"source_preference\":\"nome ou tipo de arquivo\",\"selection_rule\":\"o que procurar no take\",\"requires_media_inspection\":true,\"overlay_text\":\"...\"}\n  ],\n  \"caption_rules\": {\"enabled\":true,\"style\":\"...\",\"emphasis\":\"...\"},\n  \"audio_rules\": [\"...\"],\n  \"transition_rules\": [\"...\"],\n  \"broll_rules\": [\"...\"],\n  \"thumbnail_direction\": \"...\",\n  \"quality_checks\": [\"...\"],\n  \"renderer_notes\": [\"...\"]\n}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Você é um editor de vídeo sênior. Seja preciso, não invente observações sobre mídia que não analisou." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 700)}`);
    const payload = await response.json();
    const plan = parseJson(String(payload?.choices?.[0]?.message?.content || ""));
    const now = new Date().toISOString();
    const metadata = { ...(order.metadata || {}), edit_plan: plan, edit_plan_generated_at: now, media_inspection_pending: true };
    const { error: updateError } = await supabaseAdmin.from("marketing_production_orders").update({ status: "pronto_ia", metadata, updated_at: now }).eq("id", order.id);
    if (updateError) throw updateError;
    return json(res, 200, { ok: true, result: plan });
  } catch (err: any) {
    console.error("[production-plan]", err);
    return json(res, 500, { ok: false, message: "Não foi possível preparar o plano de edição.", detail: err?.message || String(err) });
  }
}
