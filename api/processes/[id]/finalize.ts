import { supabaseAdmin, getAuthUser, json, badRequest, unauthorized } from "../../_supabase";

function diffMs(a: Date, b: Date) {
  return Math.max(0, b.getTime() - a.getTime());
}

function msToHuman(ms: number) {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
  const minutes = totalMinutes - days * 60 * 24 - hours * 60;
  return { days, hours, minutes, totalMinutes };
}

export default async function handler(req: any, res: any) {
  const { user } = await getAuthUser(req);
  if (!user) return unauthorized(res);

  const id = req.query?.id || req.params?.id;
  if (!id) return badRequest(res, "id é obrigatório");
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Método não suportado" });

  let body: any = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return badRequest(res, "Body inválido (JSON)");
  }

  const user_satisfaction = Number(body?.user_satisfaction);
  const client_satisfaction = Number(body?.client_satisfaction);
  const improvement_text = (body?.improvement_text ?? null) as string | null;
  const note = (body?.note ?? "Processo finalizado") as string;

  if (!Number.isFinite(user_satisfaction) || user_satisfaction < 0 || user_satisfaction > 100)
    return badRequest(res, "user_satisfaction deve ser 0..100");
  if (!Number.isFinite(client_satisfaction) || client_satisfaction < 0 || client_satisfaction > 100)
    return badRequest(res, "client_satisfaction deve ser 0..100");

  const { data: proc, error } = await supabaseAdmin
    .from("processes")
    .select("id, type, status, start_at, created_at, current_phase_id, current_owner_kind")
    .eq("id", id)
    .maybeSingle();

  if (error) return json(res, 500, { ok: false, message: error.message });
  if (!proc) return json(res, 404, { ok: false, message: "Processo não encontrado" });
  if (proc.status !== "open") return badRequest(res, "Processo já está finalizado");

  // acha fase final
  const { data: finalPhase, error: ePhase } = await supabaseAdmin
    .from("process_phases")
    .select("id")
    .eq("process_type", proc.type)
    .eq("is_final", true)
    .limit(1)
    .maybeSingle();

  if (ePhase) return json(res, 500, { ok: false, message: ePhase.message });
  const finalPhaseId = finalPhase?.id ?? null;
  if (!finalPhaseId) return badRequest(res, "Fase final não encontrada (is_final=true)");

  const nowISO = new Date().toISOString();

  // fecha processo + seta fase final
  const { data: updated, error: eUpd } = await supabaseAdmin
    .from("processes")
    .update({
      status: "closed",
      closed_at: nowISO,
      current_phase_id: finalPhaseId,
      current_phase_started_at: nowISO,
      updated_by: user.id,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (eUpd) return json(res, 500, { ok: false, message: eUpd.message });

  // evento final
  const { error: eEv } = await supabaseAdmin.from("process_events").insert({
    process_id: id,
    at: nowISO,
    from_phase_id: proc.current_phase_id ?? null,
    to_phase_id: finalPhaseId,
    owner_kind: proc.current_owner_kind,
    note,
    created_by: user.id,
  });

  if (eEv) return json(res, 500, { ok: false, message: eEv.message });

  // salva feedback
  const { error: eFb } = await supabaseAdmin.from("process_feedback").insert({
    process_id: id,
    user_satisfaction,
    client_satisfaction,
    improvement_text,
    created_by: user.id,
  });

  if (eFb) return json(res, 500, { ok: false, message: eFb.message });

  // timeline por responsável
  const { data: events, error: eEvents } = await supabaseAdmin
    .from("process_events")
    .select("at, owner_kind")
    .eq("process_id", id)
    .order("at", { ascending: true });

  if (eEvents) return json(res, 500, { ok: false, message: eEvents.message });

  const start = new Date(proc.start_at || proc.created_at);
  const end = new Date(updated.closed_at);

  const list = (events || []).map((e: any) => ({ at: new Date(e.at), owner_kind: e.owner_kind as string }));
  // garante pelo menos um “segmento”
  if (list.length === 0) list.push({ at: start, owner_kind: proc.current_owner_kind });

  const totals: Record<string, number> = {
    administradora: 0,
    corretora: 0,
    cliente: 0,
  };

  for (let i = 0; i < list.length; i++) {
    const segStart = i === 0 ? start : list[i].at;
    const segEnd = i + 1 < list.length ? list[i + 1].at : end;
    const ms = diffMs(segStart, segEnd);
    const k = list[i].owner_kind;
    if (totals[k] === undefined) totals[k] = 0;
    totals[k] += ms;
  }

  const totalMs = diffMs(start, end);

  return json(res, 200, {
    ok: true,
    process: updated,
    stats: {
      total: msToHuman(totalMs),
      by_owner: {
        administradora: msToHuman(totals.administradora),
        corretora: msToHuman(totals.corretora),
        cliente: msToHuman(totals.cliente),
      },
    },
  });
}
