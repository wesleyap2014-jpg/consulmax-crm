import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser, json, supabaseAdmin, unauthorized } from "../_supabase";

const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
function scrub(value: unknown, limit = 150) {
  return String(value || "").replace(/\s+/g, " ").slice(0, limit)
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{9,}\d/g, "[telefone]");
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return json(res, 405, { error: "Método inválido" });
  const { user } = await getAuthUser(req);
  if (!user) return unauthorized(res);
  const ids = Array.from(new Set(Array.isArray(req.body?.candidateIds) ? req.body.candidateIds : []));
  if (!ids.length || ids.length > 30 || !ids.every(isUuid)) return json(res, 400, { error: "Contatos inválidos" });
  if (!process.env.OPENAI_API_KEY) return json(res, 503, { error: "MAX indisponível" });
  try {
    const { data: me, error: profileError } = await supabaseAdmin.from("users")
      .select("auth_user_id,role,user_role,hierarchy_level,unit_id,is_active")
      .eq("auth_user_id", user.id).maybeSingle();
    if (profileError || !me || me.is_active === false) return unauthorized(res);
    const { data: unit } = me.unit_id
      ? await supabaseAdmin.from("units").select("tipo").eq("id", me.unit_id).maybeSingle()
      : { data: null };
    const matrix = normalize(me.hierarchy_level) === "matriz" || (normalize(me.role || me.user_role) === "admin" && normalize(unit?.tipo) === "matriz");
    const branch = !matrix && normalize(me.hierarchy_level) === "gestor_filial" && !!me.unit_id;
    let query = supabaseAdmin.from("users").select("auth_user_id").eq("is_active", true);
    if (branch) query = query.eq("unit_id", me.unit_id);
    else if (!matrix) query = query.eq("auth_user_id", user.id);
    const { data: scopeUsers, error: scopeError } = await query;
    if (scopeError) throw scopeError;
    const scope = Array.from(new Set([user.id, ...(scopeUsers || []).map((row) => row.auth_user_id)].filter(Boolean)));
    const { data: leads, error: leadError } = await supabaseAdmin.from("leads")
      .select("id,owner_id,descricao").in("id", ids).in("owner_id", scope);
    if (leadError) throw leadError;
    if ((leads || []).length !== ids.length) return json(res, 403, { error: "Fora da cascata autorizada" });
    const [op, notes, chats] = await Promise.all([
      supabaseAdmin.from("opportunities")
        .select("lead_id,segmento,estagio,valor_credito,observacao,last_follow_up_at,lost_at,won_at,created_at")
        .in("lead_id", ids).in("vendedor_id", scope),
      supabaseAdmin.from("opportunity_notes")
        .select("lead_id,kind,note,created_at").in("lead_id", ids).in("user_id", scope)
        .order("created_at", { ascending: false }).limit(350),
      supabaseAdmin.from("whatsapp_conversations")
        .select("lead_id,last_message_at,last_message").in("lead_id", ids).in("assigned_to", scope)
        .order("last_message_at", { ascending: false }).limit(100),
    ]);
    if (op.error || notes.error || chats.error) throw Error("Não foi possível carregar histórico");
    const data = (leads || []).map((lead) => {
      const opportunities = (op.data || []).filter((item) => item.lead_id === lead.id);
      const interactions = (notes.data || []).filter((item) => item.lead_id === lead.id).slice(0, 2);
      const chat = (chats.data || []).find((item) => item.lead_id === lead.id);
      return {
        id: lead.id, ultima_mensagem: chat?.last_message_at || null,
        resumo_whatsapp: scrub(chat?.last_message, 100),
        oportunidades: opportunities.slice(0, 3).map((o) => ({
          segmento: scrub(o.segmento, 30), etapa: scrub(o.estagio, 50),
          valor: o.valor_credito, ultima_acao: o.last_follow_up_at,
          encerrada: Boolean(o.lost_at || o.won_at || /ganho|perdido/i.test(o.estagio || "")),
          observacao: scrub(o.observacao, 100),
        })),
        notas: interactions.map((n) => ({ tipo: n.kind, data: n.created_at, resumo: scrub(n.note, 140) })),
        descricao: scrub(lead.descricao, 120),
      };
    });
    const system = [
      "Você é o MAX, especialista comercial da Consulmax Consórcios.",
      "Escolha os dez melhores contatos para retomar o relacionamento nesta semana entre os IDs fornecidos.",
      "Priorize histórico real, interesse anterior e tempo sem contato. Despriorize negociações ativas acompanhadas em Oportunidades.",
      "Nunca invente informações. Não presuma contemplação, resposta ou intenção atual. Recomende abordagem consultiva.",
      "Responda APENAS JSON com recomendações em ordem: {\"recommendations\":[{\"id\":\"uuid\",\"reason\":\"motivo curto\",\"approach\":\"pergunta sugerida\"}]}.",
      "Não envie mensagens nem crie tarefas. Não mencione dados pessoais que não estejam presentes."
    ].join("\n");
    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(24000),
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.OPENAI_API_KEY },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ contatos: data }) }] }),
    });
    if (!ai.ok) return json(res, 502, { error: "Falha ao consultar MAX" });
    const raw = (await ai.json()).choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const permitted = new Set(ids);
    const seen = new Set<string>();
    const recommended = (Array.isArray(parsed.recommendations) ? parsed.recommendations : [])
      .filter((row: any) => isUuid(row.id) && permitted.has(row.id) && !seen.has(row.id) && seen.add(row.id))
      .slice(0, 10)
      .map((row: any) => ({ id: row.id, reason: scrub(row.reason, 190), approach: scrub(row.approach, 150) }));
    if (!recommended.length) return json(res, 502, { error: "Recomendações inválidas" });
    return json(res, 200, { recommendations: recommended });
  } catch (error) {
    console.error("[meus-leads/weekly-max]", error);
    return json(res, 500, { error: "Falha na análise de contatos" });
  }
}
