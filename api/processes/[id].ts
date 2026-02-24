import { supabaseAdmin, getAuthUser, json, badRequest, unauthorized } from "../_supabase";

export default async function handler(req: any, res: any) {
  const { user } = await getAuthUser(req);
  if (!user) return unauthorized(res);

  const id = req.query?.id || req.params?.id;
  if (!id) return badRequest(res, "id é obrigatório");

  if (req.method !== "PATCH") return json(res, 405, { ok: false, message: "Método não suportado" });

  let body: any = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return badRequest(res, "Body inválido (JSON)");
  }

  const {
    // mudanças possíveis
    phase_id,
    owner_kind,
    note,

    // atualizações de campos do processo (opcional)
    start_date,
    administradora,
    proposta,
    grupo,
    cota,
    segmento,
    cliente_nome,
    credito_disponivel,
  } = body || {};

  // buscar estado atual
  const { data: current, error } = await supabaseAdmin
    .from("processes")
    .select("id, status, current_phase_id, current_owner_kind")
    .eq("id", id)
    .maybeSingle();

  if (error) return json(res, 500, { ok: false, message: error.message });
  if (!current) return json(res, 404, { ok: false, message: "Processo não encontrado" });
  if (current.status !== "open") return badRequest(res, "Processo já está finalizado");

  const fromPhaseId = current.current_phase_id ?? null;
  const toPhaseId = phase_id ?? fromPhaseId;
  const newOwner = owner_kind ?? current.current_owner_kind;

  const phaseChanged = !!(phase_id && phase_id !== fromPhaseId);

  const patch: any = {
    updated_by: user.id,
    ...(start_date ? { start_date } : {}),
    ...(administradora !== undefined ? { administradora } : {}),
    ...(proposta !== undefined ? { proposta } : {}),
    ...(grupo !== undefined ? { grupo } : {}),
    ...(cota !== undefined ? { cota } : {}),
    ...(segmento !== undefined ? { segmento } : {}),
    ...(cliente_nome !== undefined ? { cliente_nome } : {}),
    ...(credito_disponivel !== undefined ? { credito_disponivel } : {}),
    ...(toPhaseId ? { current_phase_id: toPhaseId } : {}),
    ...(newOwner ? { current_owner_kind: newOwner } : {}),
    ...(phaseChanged ? { current_phase_started_at: new Date().toISOString() } : {}),
  };

  const { data: updated, error: e2 } = await supabaseAdmin
    .from("processes")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (e2) return json(res, 500, { ok: false, message: e2.message });

  // grava evento sempre que mexer em fase/owner ou deixar nota
  const shouldLog = phaseChanged || (owner_kind && owner_kind !== current.current_owner_kind) || !!note;

  if (shouldLog) {
    const { error: e3 } = await supabaseAdmin.from("process_events").insert({
      process_id: id,
      at: new Date().toISOString(),
      from_phase_id: fromPhaseId,
      to_phase_id: toPhaseId,
      owner_kind: newOwner,
      note: note ?? null,
      created_by: user.id,
    });

    if (e3) return json(res, 500, { ok: false, message: e3.message });
  }

  return json(res, 200, { ok: true, process: updated });
}
