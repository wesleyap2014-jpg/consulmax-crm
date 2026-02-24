import { supabaseAdmin, getAuthUser, json, badRequest, unauthorized } from "../_supabase";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addSLA(phase: any, phaseStartedAtISO: string) {
  const base = new Date(phaseStartedAtISO);
  if (!phase) return null;

  if (phase.sla_kind === "days") {
    const days = Number(phase.sla_days ?? 0);
    const dl = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    return dl.toISOString();
  }
  // hours
  const minutes = Number(phase.sla_minutes ?? 0);
  const dl = new Date(base.getTime() + minutes * 60 * 1000);
  return dl.toISOString();
}

function calcSlaStatus(deadlineISO: string | null, now = new Date()) {
  if (!deadlineISO) return "Em dia";
  const deadline = new Date(deadlineISO);

  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (now.getTime() > deadline.getTime()) return "Atrasado";
  // "No dia" = vence hoje
  if (deadline.getTime() >= todayStart.getTime() && deadline.getTime() <= todayEnd.getTime()) return "No dia";
  return "Em dia";
}

export default async function handler(req: any, res: any) {
  const { user } = await getAuthUser(req);
  if (!user) return unauthorized(res);

  if (req.method === "GET") {
    const url = new URL(req.url, "http://localhost");
    const type = (url.searchParams.get("type") || "faturamento") as any;
    const status = (url.searchParams.get("status") || "open") as any;
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 10)));

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const q = supabaseAdmin
      .from("processes")
      .select(
        `
        id, type, status, start_date, administradora, proposta, grupo, cota, segmento,
        cliente_nome, credito_disponivel,
        current_phase_id, current_phase_started_at, current_owner_kind,
        created_by, created_at, updated_at
        `,
        { count: "exact" }
      )
      .eq("type", type)
      .eq("status", status)
      .order("start_date", { ascending: true })
      .range(from, to);

    const { data: rows, error, count } = await q;
    if (error) return json(res, 500, { ok: false, message: error.message });

    const phaseIds = Array.from(new Set((rows || []).map((r) => r.current_phase_id).filter(Boolean)));
    let phasesById: Record<string, any> = {};
    if (phaseIds.length) {
      const { data: phases, error: e2 } = await supabaseAdmin
        .from("process_phases")
        .select("id, name, sla_kind, sla_days, sla_minutes, is_final")
        .in("id", phaseIds);

      if (e2) return json(res, 500, { ok: false, message: e2.message });
      phasesById = Object.fromEntries((phases || []).map((p) => [p.id, p]));
    }

    const now = new Date();
    const out = (rows || []).map((r) => {
      const phase = r.current_phase_id ? phasesById[r.current_phase_id] : null;
      const deadline = phase ? addSLA(phase, r.current_phase_started_at) : null;
      const slaStatus = calcSlaStatus(deadline, now);

      return {
        ...r,
        phase_name: phase?.name ?? null,
        deadline,
        sla_status: slaStatus, // "Atrasado" | "No dia" | "Em dia"
      };
    });

    return json(res, 200, {
      ok: true,
      page,
      pageSize,
      total: count ?? out.length,
      rows: out,
    });
  }

  if (req.method === "POST") {
    let body: any = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return badRequest(res, "Body inválido (JSON)");
    }

    const {
      type = "faturamento",
      start_date, // "YYYY-MM-DD" idealmente, mas TSX pode mandar dd/mm e converter
      administradora,
      proposta,
      grupo,
      cota,
      segmento,
      cliente_nome,
      lead_id,
      cliente_id,
      credito_disponivel,
      phase_id,
      owner_kind = "corretora",
      note,
    } = body || {};

    if (!start_date) return badRequest(res, "start_date é obrigatório");

    // Se phase_id não vier, pega a primeira fase ativa do tipo
    let currentPhaseId = phase_id as string | null;
    if (!currentPhaseId) {
      const { data: ph, error: pe } = await supabaseAdmin
        .from("process_phases")
        .select("id")
        .eq("process_type", type)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (pe) return json(res, 500, { ok: false, message: pe.message });
      currentPhaseId = ph?.id ?? null;
    }

    const insertPayload: any = {
      type,
      status: "open",
      start_date,
      administradora: administradora ?? null,
      proposta: proposta ?? null,
      grupo: grupo ?? null,
      cota: cota ?? null,
      segmento: segmento ?? null,
      cliente_nome: cliente_nome ?? null,
      lead_id: lead_id ?? null,
      cliente_id: cliente_id ?? null,
      credito_disponivel: credito_disponivel ?? null,
      current_phase_id: currentPhaseId,
      current_phase_started_at: new Date().toISOString(),
      current_owner_kind: owner_kind,
      created_by: user.id,
      updated_by: user.id,
      notes: null,
    };

    const { data: proc, error } = await supabaseAdmin
      .from("processes")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) return json(res, 500, { ok: false, message: error.message });

    // Evento inicial
    const { error: e2 } = await supabaseAdmin.from("process_events").insert({
      process_id: proc.id,
      at: new Date().toISOString(),
      from_phase_id: null,
      to_phase_id: currentPhaseId,
      owner_kind,
      note: note ?? "Processo criado",
      created_by: user.id,
    });

    if (e2) return json(res, 500, { ok: false, message: e2.message });

    return json(res, 201, { ok: true, process: proc });
  }

  return json(res, 405, { ok: false, message: "Método não suportado" });
}
