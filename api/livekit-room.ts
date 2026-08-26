import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabase";
import {
  ensureVideoRoom,
  eventModerator,
  joinToken,
  LIVEKIT_WS_URL,
  parseBody,
} from "./_livekit-server";

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

const AI_MODES = new Set(["sales", "service", "success", "internal", "minutes"]);
const REC_MODES = new Set(["manual", "auto", "off"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "Método não permitido." });

  try {
    const body = parseBody(req);
    const eventId = String(body?.agenda_evento_id || "").trim();
    if (!eventId) return json(res, 400, { error: "agenda_evento_id é obrigatório." });

    const moderator = await eventModerator(req, eventId);
    if (!moderator.ok) return json(res, moderator.status, { error: moderator.error });
    if (moderator.event.cancelled_at) return json(res, 410, { error: "Esta reunião foi cancelada." });

    const action = String(body?.action || "join");
    if (action === "settings") {
      const aiMode = AI_MODES.has(String(body?.ai_mode)) ? String(body.ai_mode) : "sales";
      const recordingPreference = REC_MODES.has(String(body?.recording_preference))
        ? String(body.recording_preference)
        : "manual";
      const aiEnabled = body?.ai_enabled === true;
      const patch = {
        waiting_room_enabled: body?.waiting_room_enabled !== false,
        ai_enabled: aiEnabled,
        ai_mode: aiMode,
        recording_preference: recordingPreference,
        ai_report_status: aiEnabled ? "collecting" : "idle",
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin
        .from("agenda_eventos")
        .update(patch)
        .eq("id", eventId)
        .select("waiting_room_enabled,ai_enabled,ai_mode,recording_preference,ai_report_status")
        .single();
      if (error) throw new Error(error.message);
      return json(res, 200, { ok: true, settings: data });
    }

    const room = await ensureVideoRoom(eventId, moderator.userId);
    const clientUrl = room.public_client_url;
    if (body?.prepare_only === true || action === "prepare") {
      return json(res, 200, { ok: true, prepared: true, room, clientUrl, serverUrl: LIVEKIT_WS_URL });
    }

    const participantName = String(body?.participant_name || moderator.profile?.nome || "Organizador Consulmax").trim();
    const identity = `host-${moderator.userId}`;
    const participantToken = joinToken(room.provider_room_name, identity, participantName, {
      role: "host",
      event_id: eventId,
    });
    const now = new Date().toISOString();

    await Promise.all([
      supabaseAdmin.from("video_rooms").update({ status: "host_joined", updated_at: now }).eq("id", room.id),
      supabaseAdmin.from("agenda_eventos").update({ video_status: "host_joined", updated_at: now }).eq("id", eventId),
      supabaseAdmin.from("video_sessions").insert({
        video_room_id: room.id,
        agenda_evento_id: eventId,
        status: "host_joined",
        started_at: now,
        seller_joined_at: now,
      }),
    ]);

    return json(res, 200, {
      ok: true,
      serverUrl: LIVEKIT_WS_URL,
      token: participantToken,
      identity,
      room,
      clientUrl,
      role: "host",
    });
  } catch (err: any) {
    console.error("[livekit-room]", err);
    return json(res, 500, { error: err?.message || "Erro ao preparar a sala." });
  }
}
