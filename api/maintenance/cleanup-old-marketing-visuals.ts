import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../marketing/_social.js";

const BUCKET = "marketing-content-assets";
const OLD_SOURCES = new Set(["production_factory_v1", "production_factory_v2"]);
const CLEAR_KEYS = [
  "last_error",
  "output_count",
  "visual_engine",
  "visual_version",
  "visual_updated_at",
  "visual_last_instruction",
  "visual_revision_history",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "Method not allowed" });
  if (String(req.query?.confirm || "") !== "delete-old-local-visuals") {
    return res.status(400).json({ ok: false, message: "Missing confirmation" });
  }

  try {
    const { data: rows, error: selectError } = await supabaseAdmin
      .from("marketing_content_assets")
      .select("id,production_order_id,file_path,mime_type,metadata")
      .like("mime_type", "image/%");
    if (selectError) throw selectError;

    const eligible = (rows || []).filter((row: any) => OLD_SOURCES.has(String(row?.metadata?.source || "")));
    const paths = eligible.map((row: any) => String(row.file_path || "")).filter(Boolean);
    const ids = eligible.map((row: any) => String(row.id || "")).filter(Boolean);
    const orderIds = Array.from(new Set(eligible.map((row: any) => row.production_order_id).filter(Boolean))) as string[];

    for (let i = 0; i < paths.length; i += 1000) {
      const batch = paths.slice(i, i + 1000);
      if (!batch.length) continue;
      const { error: removeError } = await supabaseAdmin.storage.from(BUCKET).remove(batch);
      if (removeError) throw removeError;
    }

    if (ids.length) {
      const { error: deleteError } = await supabaseAdmin
        .from("marketing_content_assets")
        .delete()
        .in("id", ids);
      if (deleteError) throw deleteError;
    }

    for (const orderId of orderIds) {
      const { data: order, error: orderError } = await supabaseAdmin
        .from("marketing_production_orders")
        .select("id,metadata")
        .eq("id", orderId)
        .single();
      if (orderError) throw orderError;

      const metadata = { ...(order?.metadata || {}) } as Record<string, unknown>;
      for (const key of CLEAR_KEYS) delete metadata[key];
      metadata.local_visual_assets_cleared_at = new Date().toISOString();
      metadata.local_visual_assets_cleared_count = eligible.filter((row: any) => row.production_order_id === orderId).length;

      const { error: updateError } = await supabaseAdmin
        .from("marketing_production_orders")
        .update({
          metadata,
          status: "aguardando_producao",
          produced_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (updateError) throw updateError;
    }

    return res.status(200).json({
      ok: true,
      deleted_assets: ids.length,
      deleted_paths: paths.length,
      reset_orders: orderIds.length,
      order_ids: orderIds,
    });
  } catch (error: any) {
    console.error("[maintenance:cleanup-old-marketing-visuals]", error);
    return res.status(500).json({ ok: false, message: error?.message || "cleanup_failed" });
  }
}
