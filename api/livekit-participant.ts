import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabase";
import { eventModerator, parseBody, removeParticipant } from "./_livekit-server";

function json(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "Método não permitido." });

  try {
    const body = parseBody(req);
    const eventId = String(body?.agenda_evento_id || "").trim();
    const action = String(body?.action || "remove");
    if (!eventId) return json(res, 400, { error: "agenda_evento_id é obrigatório." });
    const moderator = await eventModerator(req, eventId);
    if (!moderator.ok) return json(res, moderator.status, { error: moderator.error });

    const { data: room, error: roomError } = await supabaseAdmin
      .from("video_rooms")
      .select("id,provider_room_name")
      .eq("agenda_evento_id", eventId)
      .maybeSingle();
    if (roomError) throw new Error(roomError.message);
    if (!room?.provider_room_name) return json(res, 404, { error: "Sala ainda não foi criada." });

    if (action === "remove") {
      const identity = String(body?.identity || "").trim();
      if (!identity) return json(res, 400, { error: "identity é obrigatório." });
      if (identity.startsWith("host-")) return json(res, 400, { error: "O organizador não pode ser removido por esta ação." });
      await removeParticipant(room.provider_room_name, identity);
      const requestId = identity.startsWith("guest-") ? identity.slice(6) : "";
      if (requestId) {
        await supabaseAdmin.from("meeting_lobby_requests").update({
          status: "left", updated_at: new Date().toISOString(),
        }).eq("id", requestId).eq("agenda_evento_id", eventId);
      }
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "Ação inválida." });
  } catch (err: any) {
    console.error("[livekit-participant]", err);
    return json(res, 500, { error: err?.message || "Erro ao moderar participante." });
  }
}
