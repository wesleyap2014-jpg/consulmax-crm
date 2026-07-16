import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser, json, supabaseAdmin } from "../_supabase";

function parseBody(req: VercelRequest) {
  if (typeof req.body === "string" && req.body.length) return JSON.parse(req.body);
  return req.body || {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Método não permitido." });

  try {
    const { user } = await getAuthUser(req);
    if (!user) return json(res, 401, { ok: false, error: "Usuário não autenticado." });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profileError) return json(res, 500, { ok: false, error: profileError.message });
    if (profile?.role !== "admin") {
      return json(res, 403, { ok: false, error: "Somente administradores podem retornar comissões." });
    }

    const body = parseBody(req);
    const batchId = String(body?.batch_id || "").trim();
    const vendaId = String(body?.venda_id || "").trim();

    if (!batchId || !vendaId) {
      return json(res, 400, { ok: false, error: "Lote e venda são obrigatórios." });
    }

    const { data: batch, error: batchError } = await supabaseAdmin
      .from("commission_batches")
      .select("id, venda_id")
      .eq("id", batchId)
      .maybeSingle();

    if (batchError) return json(res, 500, { ok: false, error: batchError.message });
    if (!batch) return json(res, 200, { ok: true, already_returned: true });
    if (batch.venda_id !== vendaId) {
      return json(res, 409, { ok: false, error: "O lote informado não pertence a essa venda." });
    }

    const [{ data: paidFlows, error: paidError }, { data: adjustments, error: adjustmentsError }] = await Promise.all([
      supabaseAdmin
        .from("commission_entry_flow")
        .select("id")
        .eq("batch_id", batchId)
        .gt("valor_pago", 0)
        .limit(1),
      supabaseAdmin
        .from("commission_adjustments")
        .select("id")
        .eq("batch_id", batchId)
        .limit(1),
    ]);

    if (paidError) return json(res, 500, { ok: false, error: paidError.message });
    if (adjustmentsError) return json(res, 500, { ok: false, error: adjustmentsError.message });
    if (paidFlows?.length) {
      return json(res, 409, {
        ok: false,
        error: "Esta comissão já possui parcela paga. Use Lançar Estorno no fluxo de pagamento.",
      });
    }
    if (adjustments?.length) {
      return json(res, 409, {
        ok: false,
        error: "Esta comissão possui histórico de estorno e não pode retornar para Nova venda.",
      });
    }

    const firstAttempt = await supabaseAdmin
      .from("commission_batches")
      .delete()
      .eq("id", batchId)
      .eq("venda_id", vendaId);

    if (firstAttempt.error?.code === "23503") {
      const { error: flowDeleteError } = await supabaseAdmin
        .from("commission_entry_flow")
        .delete()
        .eq("batch_id", batchId);

      if (flowDeleteError) return json(res, 500, { ok: false, error: flowDeleteError.message });

      const { error: entryDeleteError } = await supabaseAdmin
        .from("commission_entries")
        .delete()
        .eq("batch_id", batchId);

      if (entryDeleteError) return json(res, 500, { ok: false, error: entryDeleteError.message });

      const { error: batchDeleteError } = await supabaseAdmin
        .from("commission_batches")
        .delete()
        .eq("id", batchId)
        .eq("venda_id", vendaId);

      if (batchDeleteError) return json(res, 500, { ok: false, error: batchDeleteError.message });
    } else if (firstAttempt.error) {
      return json(res, 500, { ok: false, error: firstAttempt.error.message });
    }

    const { data: remaining, error: verifyError } = await supabaseAdmin
      .from("commission_batches")
      .select("id")
      .eq("id", batchId)
      .maybeSingle();

    if (verifyError) return json(res, 500, { ok: false, error: verifyError.message });
    if (remaining) {
      return json(res, 500, { ok: false, error: "A comissão permaneceu no banco após a tentativa de retorno." });
    }

    return json(res, 200, { ok: true, venda_id: vendaId });
  } catch (error: any) {
    return json(res, 500, { ok: false, error: error?.message || "Erro inesperado ao retornar comissão." });
  }
}
