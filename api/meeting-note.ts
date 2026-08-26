import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabase";
import { eventModerator, parseBody } from "./_livekit-server";

type NoteAction = "save" | "finish";

function json(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

function text(value: unknown) {
  return String(value || "").normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "Método não permitido." });

  try {
    const body = parseBody(req);
    const eventId = text(body?.agenda_evento_id);
    const rawNotes = text(body?.raw_notes);
    const nextSteps = text(body?.next_steps);
    const action: NoteAction = body?.action === "finish" ? "finish" : "save";
    if (!eventId) return json(res, 400, { error: "agenda_evento_id é obrigatório." });
    if (action === "save" && !rawNotes) return json(res, 400, { error: "Digite uma nota antes de salvar." });

    const moderator = await eventModerator(req, eventId);
    if (!moderator.ok) return json(res, moderator.status, { error: moderator.error });
    const evento = moderator.event;
    const now = new Date().toISOString();

    let note: any = null;
    if (rawNotes) {
      const inserted = await supabaseAdmin.from("meeting_notes").insert({
        agenda_evento_id: evento.id,
        video_room_id: evento.video_room_id || null,
        cliente_id: evento.cliente_id || null,
        lead_id: evento.lead_id || null,
        user_id: moderator.userId,
        raw_notes: rawNotes,
        next_steps: nextSteps,
      }).select("*").single();
      if (inserted.error) throw new Error(inserted.error.message);
      note = inserted.data;
    }

    if (action === "finish") {
      const patch: Record<string, unknown> = {
        completed_at: now,
        video_status: "finished",
        updated_at: now,
      };
      if (rawNotes) patch.completion_notes = rawNotes;
      const updated = await supabaseAdmin.from("agenda_eventos").update(patch).eq("id", eventId);
      if (updated.error) throw new Error(updated.error.message);

      await Promise.all([
        evento.video_room_id
          ? supabaseAdmin.from("video_rooms").update({ status: "finished", updated_at: now }).eq("id", evento.video_room_id)
          : supabaseAdmin.from("video_rooms").update({ status: "finished", updated_at: now }).eq("agenda_evento_id", eventId),
        supabaseAdmin.from("video_sessions").update({ status: "finished", ended_at: now }).eq("agenda_evento_id", eventId).is("ended_at", null),
      ]);
    }

    return json(res, 200, {
      ok: true,
      action,
      note,
      finished: action === "finish",
      message: action === "finish" ? "Reunião finalizada com sucesso." : "Nota salva com sucesso.",
    });
  } catch (err: any) {
    console.error("[meeting-note]", err);
    return json(res, 500, { error: err?.message || "Erro ao salvar a reunião." });
  }
}
