import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_supabase";

const CONSULMAX_WHATSAPP = "5569993917465";

function validToken(value: unknown) {
  const token = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token) ? token : "";
}

function messageFromMeta(row: any) {
  const meta = row?.meta && typeof row.meta === "object" ? row.meta : {};
  const direct = String(meta.cta_message || "").trim();
  if (direct) return direct;
  const ref = `${meta.grupo || "—"}/${meta.cota || "—"}`;
  if (row?.cta_type === "reparcelamento") {
    return `Olá! Gostaria de verificar a possibilidade de reparcelamento das parcelas em aberto referente ao meu consórcio. Grupo/Cota ${ref}.`;
  }
  if (row?.cta_type === "retomar_projeto") {
    return `Olá! Gostaria de conversar sobre a possibilidade de retomar meu projeto de consórcio. Grupo/Cota ${ref}.`;
  }
  if (row?.cta_type === "ajuda") {
    return `Olá! Preciso de ajuda referente ao meu consórcio. Grupo/Cota ${ref}.`;
  }
  return `Olá! Gostaria de regularizar as parcelas em aberto referente ao meu consórcio. Grupo/Cota ${ref}.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (String(req.method) !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  const token = validToken(req.query.token);
  if (!token) return res.status(400).send("Link inválido.");

  try {
    const { data: row, error } = await supabaseAdmin
      .from("carteira_relationship_messages")
      .select("id,venda_id,vendedor_id,cta_type,click_count,first_clicked_at,last_clicked_at,seller_attention_at,meta")
      .eq("click_token", token)
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).send("Link não encontrado.");

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("carteira_relationship_messages")
      .update({
        click_count: Number(row.click_count || 0) + 1,
        first_clicked_at: row.first_clicked_at || now,
        last_clicked_at: now,
        seller_attention_at: row.seller_attention_at || now,
        updated_at: now,
      })
      .eq("id", row.id);

    const message = messageFromMeta(row);
    const destination = `https://wa.me/${CONSULMAX_WHATSAPP}?text=${encodeURIComponent(message)}`;
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Location", destination);
    return res.status(302).end();
  } catch (error) {
    console.error("[relationship-cta] erro:", error);
    return res.status(500).send("Não foi possível abrir o WhatsApp. Tente novamente.");
  }
}
