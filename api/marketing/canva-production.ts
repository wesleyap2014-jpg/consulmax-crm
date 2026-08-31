import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  canvaFetch,
  json,
  requireAdmin,
  supabaseAdmin,
} from "./_canva.js";

const CONTENT_BUCKET = "marketing-content-assets";
const OUTPUT_ROLE: Record<string, string> = {
  carrossel: "carousel_card",
  stories: "story_frame",
  status: "status_frame",
  post: "post_image",
  reel: "thumbnail",
  short: "thumbnail",
  youtube_long: "thumbnail",
  video: "thumbnail",
};

function sanitize(value: string) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function getDatasetObject(payload: any) {
  return payload?.dataset || payload?.brand_template?.dataset || payload?.design?.dataset || payload || {};
}

function itemText(item: any, key: string) {
  if (!item) return "";
  if (key === "title") return item.headline || item.title || "";
  if (key === "subtitle") return item.eyebrow || item.subtitle || "";
  if (key === "body") return item.body || "";
  if (key === "cta") return item.interaction?.label || item.cta || "";
  const bulletMatch = key.match(/^bullet_(\d+)$/);
  if (bulletMatch) return item.bullets?.[Number(bulletMatch[1]) - 1] || "";
  return "";
}

function valueForField(fieldName: string, spec: any, context: any) {
  const raw = fieldName.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  const items = Array.isArray(spec?.items) ? spec.items : [];
  const pageMatch = raw.match(/^(?:P|PAGE|CARD|STORY|TELA)_?(\d+)_(TITLE|HEADLINE|SUBTITLE|EYEBROW|BODY|CTA|BULLET_?(\d+))$/);
  if (pageMatch) {
    const item = items[Number(pageMatch[1]) - 1];
    const key = pageMatch[2];
    if (key === "TITLE" || key === "HEADLINE") return itemText(item, "title");
    if (key === "SUBTITLE" || key === "EYEBROW") return itemText(item, "subtitle");
    if (key === "BODY") return itemText(item, "body");
    if (key === "CTA") return itemText(item, "cta");
    if (key.startsWith("BULLET")) return itemText(item, `bullet_${pageMatch[3] || "1"}`);
  }

  const first = items[0] || {};
  if (["TITLE", "HEADLINE", "HOOK"].includes(raw)) return itemText(first, "title") || context.title || "";
  if (["SUBTITLE", "EYEBROW"].includes(raw)) return itemText(first, "subtitle");
  if (["BODY", "COPY", "TEXT"].includes(raw)) return itemText(first, "body") || context.body || "";
  if (raw === "CTA") return itemText(first, "cta") || context.cta || "";
  if (raw === "BRAND") return context.brandName || "Consulmax";
  if (raw === "AUDIENCE" || raw === "PUBLICO") return context.audience || "";
  if (raw === "OBJECTIVE" || raw === "OBJETIVO") return context.objective || "";
  if (raw === "THESIS" || raw === "TESE") return context.thesis || "";
  const bullet = raw.match(/^BULLET_?(\d+)$/);
  if (bullet) return itemText(first, `bullet_${bullet[1]}`);
  return "";
}

function buildAutofillData(schemaPayload: any, spec: any, context: any) {
  const schema = getDatasetObject(schemaPayload);
  const data: Record<string, any> = {};
  Object.entries(schema || {}).forEach(([name, definition]: [string, any]) => {
    const type = String(definition?.type || "").toLowerCase();
    if (type !== "text") return;
    const text = valueForField(name, spec, context);
    if (text) data[name] = { type: "text", text: String(text).slice(0, 3000) };
  });
  return data;
}

function chooseFamily(format: string, spec: any) {
  const items = Array.isArray(spec?.items) ? spec.items : [];
  if (format === "carrossel") {
    if (items.some((item: any) => String(item?.role || "").toLowerCase() === "comparison" || (item?.columns?.length || 0) >= 2)) return "comparacao";
    if (items.some((item: any) => ["story", "storytelling", "case", "history"].includes(String(item?.role || "").toLowerCase()))) return "storytelling";
    return "educativo_premium";
  }
  if (format === "stories") {
    if (items.some((item: any) => item?.interaction && item.interaction.type && item.interaction.type !== "none")) return "conversa";
    return "educativo";
  }
  if (format === "post") return "autoridade";
  return "thumbnail";
}

async function loadOrder(orderId: string) {
  const { data: order, error } = await supabaseAdmin
    .from("marketing_production_orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (error) throw error;
  const [{ data: content }, { data: variant }, { data: brand }] = await Promise.all([
    supabaseAdmin.from("marketing_content_items").select("id,title,objective,audience,thesis,ai_context").eq("id", order.content_id).maybeSingle(),
    order.variant_id
      ? supabaseAdmin.from("marketing_content_variants").select("id,title,hook,body,caption,script,cta").eq("id", order.variant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    order.brand_kit_setting_id
      ? supabaseAdmin.from("marketing_content_settings").select("id,name,payload").eq("id", order.brand_kit_setting_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ] as any);
  return { order, content: content || null, variant: variant || null, brand: brand || null };
}

async function getMapping(order: any, spec: any, requestedFamily?: string) {
  const family = requestedFamily || chooseFamily(String(order.format), spec);
  let query = supabaseAdmin
    .from("marketing_canva_template_mappings")
    .select("*")
    .eq("brand_kit_setting_id", order.brand_kit_setting_id)
    .eq("format", order.format)
    .eq("template_family", family)
    .eq("enabled", true)
    .limit(1);
  let { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    const fallback = await supabaseAdmin
      .from("marketing_canva_template_mappings")
      .select("*")
      .eq("brand_kit_setting_id", order.brand_kit_setting_id)
      .eq("format", order.format)
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    data = fallback.data;
  }
  return { mapping: data || null, family };
}

async function pollAutofill(jobId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { payload } = await canvaFetch(`/autofills/${encodeURIComponent(jobId)}`);
    const job = payload?.job;
    if (job?.status === "success") return job;
    if (job?.status === "failed") throw new Error(job?.error?.message || "O Canva não conseguiu preencher o template.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("O Canva ainda está processando o template. Tente sincronizar em alguns segundos.");
}

async function createCanvaDesign(input: { order: any; content: any; variant: any; brand: any; spec: any; family?: string }) {
  const { mapping, family } = await getMapping(input.order, input.spec, input.family);
  if (!mapping || (!mapping.canva_brand_template_id && !mapping.canva_source_design_id)) {
    const error = new Error(`Nenhum template Canva está mapeado para ${input.order.format} · ${family}.`) as Error & { status?: number; code?: string; mapping?: any };
    error.status = 409;
    error.code = "template_not_configured";
    error.mapping = mapping;
    throw error;
  }

  const title = String(input.order.title || input.variant?.title || input.content?.title || "Conteúdo Consulmax").slice(0, 255);
  const context = {
    title,
    body: input.variant?.body || input.variant?.caption || "",
    cta: input.variant?.cta || "",
    objective: input.content?.objective || input.order.blueprint?.objective || "",
    audience: input.content?.audience || "",
    thesis: input.content?.thesis || "",
    brandName: input.brand?.name || "Consulmax",
  };
  const data = buildAutofillData(mapping.dataset_schema, input.spec, context);
  let design: any = null;
  let mode = "copy";
  let autofillError: string | null = null;

  if (Object.keys(data).length > 0) {
    try {
      const body = mapping.canva_brand_template_id
        ? {
            type: "create_from_brand_template",
            brand_template_id: mapping.canva_brand_template_id,
            title,
            data,
          }
        : {
            type: "create_from_design",
            design_id: mapping.canva_source_design_id,
            title,
            data,
          };
      const { payload } = await canvaFetch("/autofills", { method: "POST", body: JSON.stringify(body) });
      const job = payload?.job?.status === "success" ? payload.job : await pollAutofill(String(payload?.job?.id || ""));
      design = job?.result?.design || null;
      mode = "autofill";
    } catch (error: any) {
      autofillError = error?.message || "Autofill indisponível";
    }
  }

  if (!design) {
    const body = mapping.canva_brand_template_id
      ? { type: "brand_template", brand_template_id: mapping.canva_brand_template_id, title }
      : { type: "design", design_id: mapping.canva_source_design_id, title };
    const { payload } = await canvaFetch("/designs", { method: "POST", body: JSON.stringify(body) });
    design = payload?.design || null;
    mode = "copy";
  }

  if (!design?.id) throw new Error("O Canva não retornou um Design ID.");
  const revision = Number(input.order.metadata?.canva_revision || 0) + 1;
  const now = new Date().toISOString();
  const metadata = {
    ...(input.order.metadata || {}),
    design_provider: "canva",
    canva_design_id: design.id,
    canva_edit_url: design?.urls?.edit_url || design?.url || null,
    canva_view_url: design?.urls?.view_url || null,
    canva_thumbnail_url: design?.thumbnail?.url || null,
    canva_template_mapping_id: mapping.id,
    canva_template_family: family,
    canva_mode: mode,
    canva_revision: revision,
    canva_created_at: now,
    canva_autofill_warning: autofillError,
    canva_creative_spec: input.spec,
  };
  const { error: updateError } = await supabaseAdmin
    .from("marketing_production_orders")
    .update({ metadata, status: mode === "autofill" ? "em_revisao" : "produzindo", updated_at: now })
    .eq("id", input.order.id);
  if (updateError) throw updateError;
  return { design, mode, revision, family, mapping, autofill_warning: autofillError };
}

async function refreshCanvaDesign(orderId: string) {
  const { order } = await loadOrder(orderId);
  const designId = String(order.metadata?.canva_design_id || "");
  if (!designId) throw new Error("Esta ordem ainda não possui um design Canva.");
  const { payload } = await canvaFetch(`/designs/${encodeURIComponent(designId)}`);
  const design = payload?.design;
  const metadata = {
    ...(order.metadata || {}),
    canva_edit_url: design?.urls?.edit_url || order.metadata?.canva_edit_url || null,
    canva_view_url: design?.urls?.view_url || order.metadata?.canva_view_url || null,
    canva_thumbnail_url: design?.thumbnail?.url || order.metadata?.canva_thumbnail_url || null,
    canva_updated_at: design?.updated_at || null,
    canva_synced_at: new Date().toISOString(),
  };
  await supabaseAdmin.from("marketing_production_orders").update({ metadata, updated_at: new Date().toISOString() }).eq("id", order.id);
  return design;
}

function exportFormatFor(order: any) {
  if (["carrossel", "stories", "status", "post", "reel", "short", "youtube_long", "video"].includes(String(order.format))) {
    return { type: "png", export_quality: "pro", lossless: true, as_single_image: false };
  }
  return { type: "pdf", export_quality: "pro" };
}

async function pollExport(exportId: string) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { payload } = await canvaFetch(`/exports/${encodeURIComponent(exportId)}`);
    const job = payload?.job;
    if (job?.status === "success") return job;
    if (job?.status === "failed") throw new Error(job?.error?.message || "A exportação do Canva falhou.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("O Canva ainda está exportando a peça. Tente importar novamente em alguns segundos.");
}

async function importCanvaExport(orderId: string, authUserId: string) {
  const { order } = await loadOrder(orderId);
  const designId = String(order.metadata?.canva_design_id || "");
  if (!designId) throw new Error("Esta ordem ainda não possui um design Canva.");
  const { payload } = await canvaFetch("/exports", {
    method: "POST",
    body: JSON.stringify({ design_id: designId, format: exportFormatFor(order) }),
  });
  const job = payload?.job?.status === "success" ? payload.job : await pollExport(String(payload?.job?.id || ""));
  const urls = Array.isArray(job?.urls) ? job.urls : Array.isArray(job?.result?.urls) ? job.result.urls : [];
  if (!urls.length) throw new Error("O Canva concluiu a exportação, mas não retornou arquivos para download.");

  const revision = Number(order.metadata?.canva_revision || 1);
  const role = OUTPUT_ROLE[String(order.format)] || "post_image";
  const assetIds: string[] = [];
  for (let index = 0; index < urls.length; index += 1) {
    const response = await fetch(String(urls[index]));
    if (!response.ok) throw new Error(`Falha ao baixar arquivo exportado do Canva (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const mime = response.headers.get("content-type") || (String(order.format) === "youtube_long" ? "image/png" : "image/png");
    const ext = mime.includes("pdf") ? "pdf" : mime.includes("jpeg") ? "jpg" : mime.includes("png") ? "png" : "bin";
    const fileName = `${sanitize(order.title || "canva")}-canva-v${String(revision).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}.${ext}`;
    const filePath = `${authUserId}/production/${order.id}/canva/${Date.now()}-${fileName}`;
    const { error: uploadError } = await supabaseAdmin.storage.from(CONTENT_BUCKET).upload(filePath, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data: asset, error: assetError } = await supabaseAdmin
      .from("marketing_content_assets")
      .insert({
        content_id: order.content_id,
        variant_id: order.variant_id,
        production_order_id: order.id,
        kind: mime.startsWith("image/") ? "image" : mime.includes("pdf") ? "document" : "other",
        asset_role: role,
        file_path: filePath,
        file_name: fileName,
        mime_type: mime,
        file_size_bytes: bytes.length,
        metadata: {
          source: "canva",
          canva_design_id: designId,
          canva_export_id: job?.id || payload?.job?.id || null,
          canva_revision: revision,
          page_index: index + 1,
          imported_at: new Date().toISOString(),
        },
        created_by: authUserId,
      })
      .select("id")
      .single();
    if (assetError) {
      await supabaseAdmin.storage.from(CONTENT_BUCKET).remove([filePath]);
      throw assetError;
    }
    assetIds.push(asset.id);
  }

  const now = new Date().toISOString();
  const metadata = {
    ...(order.metadata || {}),
    design_provider: "canva",
    canva_imported_at: now,
    canva_imported_asset_ids: assetIds,
    canva_last_export_id: job?.id || payload?.job?.id || null,
  };
  const { error: updateError } = await supabaseAdmin
    .from("marketing_production_orders")
    .update({ metadata, status: "em_revisao", produced_at: now, updated_at: now })
    .eq("id", order.id);
  if (updateError) throw updateError;
  return { asset_ids: assetIds, count: assetIds.length, revision };
}

async function listTemplates() {
  const { payload } = await canvaFetch("/brand-templates?limit=100&dataset=any&sort_by=modified_descending");
  return payload;
}

async function mapTemplate(input: any) {
  const mappingId = String(input.mapping_id || "");
  if (!mappingId) throw new Error("Mapping ID não informado.");
  const brandTemplateId = String(input.canva_brand_template_id || "").trim() || null;
  const sourceDesignId = String(input.canva_source_design_id || "").trim() || null;
  if (!brandTemplateId && !sourceDesignId) {
    const { error } = await supabaseAdmin
      .from("marketing_canva_template_mappings")
      .update({ canva_brand_template_id: null, canva_source_design_id: null, dataset_schema: {}, updated_at: new Date().toISOString() })
      .eq("id", mappingId);
    if (error) throw error;
    return { cleared: true };
  }

  let dataset: any = {};
  if (brandTemplateId) {
    const { payload } = await canvaFetch(`/brand-templates/${encodeURIComponent(brandTemplateId)}/dataset`);
    dataset = getDatasetObject(payload);
  } else if (sourceDesignId) {
    const { payload } = await canvaFetch(`/designs/${encodeURIComponent(sourceDesignId)}/dataset`);
    dataset = getDatasetObject(payload);
  }
  const { data, error } = await supabaseAdmin
    .from("marketing_canva_template_mappings")
    .update({
      canva_brand_template_id: brandTemplateId,
      canva_source_design_id: sourceDesignId,
      dataset_schema: dataset || {},
      metadata: {
        mapped_at: new Date().toISOString(),
        dataset_field_count: Object.keys(dataset || {}).length,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", mappingId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireAdmin(req, res);
  if (!user) return;
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method not allowed" });
  const action = String(req.body?.action || "").toLowerCase();

  try {
    if (action === "list_templates") {
      return json(res, 200, { ok: true, templates: await listTemplates() });
    }
    if (action === "map_template") {
      return json(res, 200, { ok: true, mapping: await mapTemplate(req.body || {}) });
    }
    if (action === "create") {
      const orderId = String(req.body?.production_order_id || "");
      if (!orderId) return json(res, 400, { ok: false, message: "production_order_id obrigatório." });
      const loaded = await loadOrder(orderId);
      const spec = req.body?.creative_spec || loaded.order.metadata?.canva_creative_spec || loaded.order.metadata?.visual_spec_v2;
      if (!spec?.items?.length) {
        return json(res, 409, {
          ok: false,
          code: "creative_spec_required",
          message: "A direção criativa precisa ser estruturada antes de enviar a peça ao Canva.",
        });
      }
      const result = await createCanvaDesign({ ...loaded, spec, family: req.body?.template_family || undefined });
      return json(res, 200, { ok: true, ...result });
    }
    if (action === "refresh") {
      const orderId = String(req.body?.production_order_id || "");
      return json(res, 200, { ok: true, design: await refreshCanvaDesign(orderId) });
    }
    if (action === "import") {
      const orderId = String(req.body?.production_order_id || "");
      return json(res, 200, { ok: true, ...(await importCanvaExport(orderId, user.id)) });
    }
    return json(res, 400, { ok: false, message: "Ação Canva inválida." });
  } catch (error: any) {
    console.error("[canva-production]", action, error?.data || error);
    return json(res, Number(error?.status || 500), {
      ok: false,
      code: error?.code || null,
      message: error?.message || "Falha na operação Canva.",
      detail: error?.data || null,
      mapping: error?.mapping || null,
    });
  }
}