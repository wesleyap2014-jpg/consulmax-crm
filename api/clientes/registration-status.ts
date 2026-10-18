import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser, json, supabaseAdmin, unauthorized } from "../_supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (value: unknown) => String(value || "").trim().toLowerCase();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return json(res, 405, { error: "Método inválido" });
  const { user } = await getAuthUser(req);
  if (!user) return unauthorized(res);
  const raw = req.body?.leadIds;
  if (!Array.isArray(raw) || raw.length > 20000 || !raw.every((id) => typeof id === "string" && UUID.test(id)))
    return json(res, 400, { error: "IDs inválidos" });
  const leadIds = Array.from(new Set(raw as string[]));
  if (!leadIds.length) return json(res, 200, { confirmedLeadIds: [] });

  try {
    const { data: me, error: meError } = await supabaseAdmin.from("users")
      .select("id,auth_user_id,role,hierarchy_level,unit_id,is_active")
      .eq("auth_user_id", user.id).maybeSingle();
    if (meError || !me || me.is_active === false) return unauthorized(res);

    const { data: unit } = me.unit_id
      ? await supabaseAdmin.from("units").select("tipo").eq("id", me.unit_id).maybeSingle()
      : { data: null };
    const matrix = norm(me.hierarchy_level) === "matriz" || (norm(me.role) === "admin" && norm(unit?.tipo) === "matriz");
    const branch = !matrix && norm(me.hierarchy_level) === "gestor_filial" && Boolean(me.unit_id);

    let allowedSellerIds: string[] = [user.id];
    if (matrix || branch) {
      let usersQ = supabaseAdmin.from("users").select("auth_user_id").eq("is_active", true);
      if (branch) usersQ = usersQ.eq("unit_id", me.unit_id);
      const { data: scopedUsers, error } = await usersQ;
      if (error) throw error;
      allowedSellerIds = Array.from(new Set((scopedUsers || []).map((u) => u.auth_user_id).filter(Boolean)));
    }

    // Não devolve dados do cliente; somente o estado de registro para leads de vendas autorizadas.
    const allowed = new Set<string>();
    for (let i = 0; i < leadIds.length; i += 250) {
      let q = supabaseAdmin.from("vendas").select("lead_id").in("lead_id", leadIds.slice(i, i + 250));
      if (!matrix) q = q.in("vendedor_id", allowedSellerIds.length ? allowedSellerIds : [user.id]);
      const { data, error } = await q;
      if (error) throw error;
      for (const row of data || []) if (row.lead_id) allowed.add(String(row.lead_id));
    }
    const eligibleIds = leadIds.filter((id) => allowed.has(id));
    const confirmedLeadIds: string[] = [];
    for (let i = 0; i < eligibleIds.length; i += 250) {
      const { data, error } = await supabaseAdmin.from("clientes")
        .select("lead_id").in("lead_id", eligibleIds.slice(i, i + 250));
      if (error) throw error;
      for (const row of data || []) if (row.lead_id) confirmedLeadIds.push(String(row.lead_id));
    }
    return json(res, 200, { confirmedLeadIds: Array.from(new Set(confirmedLeadIds)) });
  } catch (error) {
    console.error("[clientes/registration-status]", error);
    return json(res, 500, { error: "Falha ao verificar cadastros" });
  }
}
