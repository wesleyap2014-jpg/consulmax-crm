import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabase";
import { ensureVideoRoom, eventModerator, joinToken, LIVEKIT_WS_URL, parseBody } from "./_livekit-server";

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function emailNorm(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

async function safeEvent(eventId: string) {
  const { data: event, error } = await supabaseAdmin
    .from("agenda_eventos")
    .select("id,titulo,inicio_at,fim_at,user_id,cancelled_at,completed_at,video_status,waiting_room_enabled,ai_enabled,ai_mode,recording_preference")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!event) return null;
  const { data: organizer } = await supabaseAdmin
    .from("users")
    .select("nome")
    .eq("auth_user_id", event.user_id)
    .maybeSingle();
  return { event, organizerName: organizer?.nome || "Consulmax" };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "Método não permitido." });

  try {
    const body = parseBody(req);
    const action = String(body?.action || "info");
    const eventId = String(body?.agenda_evento_id || "").trim();
    if (!eventId) return json(res, 400, { error: "agenda_evento_id é obrigatório." });

    if (action === "info") {
      const safe = await safeEvent(eventId);
      if (!safe) return json(res, 404, { error: "Reunião não encontrada." });
      const { event, organizerName } = safe;
      return json(res, 200, {
        ok: true,
        event: {
          id: event.id,
          titulo: event.titulo,
          inicio_at: event.inicio_at,
          fim_at: event.fim_at,
          organizer_name: organizerName,
          waiting_room_enabled: event.waiting_room_enabled !== false,
          ai_enabled: event.ai_enabled === true,
          ai_mode: event.ai_mode || "sales",
          recording_preference: event.recording_preference || "manual",
          cancelled: Boolean(event.cancelled_at),
          finished: Boolean(event.completed_at) || event.video_status === "finished",
        },
      });
    }

    if (action === "request") {
      const safe = await safeEvent(eventId);
      if (!safe) return json(res, 404, { error: "Reunião não encontrada." });
      const { event } = safe;
      if (event.cancelled_at) return json(res, 410, { error: "Esta reunião foi cancelada." });
      if (event.completed_at || event.video_status === "finished") return json(res, 410, { error: "Esta reunião já foi encerrada." });

      const displayName = String(body?.display_name || "").trim().slice(0, 120);
      const email = emailNorm(body?.email);
      const recordingConsent = body?.recording_consent === true;
      const aiConsent = body?.ai_consent === true;
      if (!displayName) return json(res, 400, { error: "Informe seu nome para solicitar entrada." });
      if ((event.recording_preference || "manual") !== "off" && !recordingConsent) {
        return json(res, 400, { error: "É necessário concordar com o aviso de gravação para entrar." });
      }
      if (event.ai_enabled && !aiConsent) {
        return json(res, 400, { error: "É necessário concordar com o uso de IA/transcrição para entrar." });
      }

      let guestId: string | null = null;
      let userAuthId: string | null = null;
      if (email) {
        const { data: guest } = await supabaseAdmin
          .from("agenda_event_guests")
          .select("id,user_auth_id")
          .eq("event_id", eventId)
          .ilike("email", email)
          .maybeSingle();
        guestId = guest?.id || null;
        userAuthId = guest?.user_auth_id || null;
      }

      const autoAdmit = event.waiting_room_enabled === false;
      const inserted = await supabaseAdmin.from("meeting_lobby_requests").insert({
        agenda_evento_id: eventId,
        guest_id: guestId,
        user_auth_id: userAuthId,
        display_name: displayName,
        email: email || null,
        recording_consent: recordingConsent,
        ai_consent: aiConsent,
        status: autoAdmit ? "admitted" : "pending",
        decided_at: autoAdmit ? new Date().toISOString() : null,
        admitted_at: autoAdmit ? new Date().toISOString() : null,
      }).select("id,request_token,status,expires_at").single();
      if (inserted.error) throw new Error(inserted.error.message);
      return json(res, 200, { ok: true, request: inserted.data });
    }

    if (action === "status") {
      const requestId = String(body?.request_id || "").trim();
      const requestToken = String(body?.request_token || "").trim();
      if (!requestId || !requestToken) return json(res, 400, { error: "Solicitação inválida." });

      const { data: request, error } = await supabaseAdmin
        .from("meeting_lobby_requests")
        .select("*")
        .eq("id", requestId)
        .eq("request_token", requestToken)
        .eq("agenda_evento_id", eventId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!request) return json(res, 404, { error: "Solicitação não encontrada." });
      if (new Date(request.expires_at).getTime() < Date.now() && request.status === "pending") {
        await supabaseAdmin.from("meeting_lobby_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", request.id);
        return json(res, 200, { ok: true, status: "expired" });
      }
      if (request.status !== "admitted") return json(res, 200, { ok: true, status: request.status });

      const room = await ensureVideoRoom(eventId, null);
      const identity = `guest-${request.id}`;
      const token = joinToken(room.provider_room_name, identity, request.display_name, {
        role: "guest",
        lobby_request_id: request.id,
      });
      const now = new Date().toISOString();
      await supabaseAdmin.from("meeting_lobby_requests").update({ joined_at: now, updated_at: now }).eq("id", request.id);
      await supabaseAdmin.from("video_rooms").update({ status: "participant_joined", updated_at: now }).eq("id", room.id);
      return json(res, 200, {
        ok: true,
        status: "admitted",
        serverUrl: LIVEKIT_WS_URL,
        token,
        identity,
        room: { id: room.id, name: room.provider_room_name },
      });
    }

    if (action === "list") {
      const moderator = await eventModerator(req, eventId);
      if (!moderator.ok) return json(res, moderator.status, { error: moderator.error });
      const { data, error } = await supabaseAdmin
        .from("meeting_lobby_requests")
        .select("id,display_name,email,status,recording_consent,ai_consent,requested_at,decided_at,admitted_at,joined_at")
        .eq("agenda_evento_id", eventId)
        .in("status", ["pending", "admitted"])
        .order("requested_at", { ascending: true });
      if (error) throw new Error(error.message);
      return json(res, 200, { ok: true, requests: data || [] });
    }

    if (action === "decide") {
      const moderator = await eventModerator(req, eventId);
      if (!moderator.ok) return json(res, moderator.status, { error: moderator.error });
      const decision = String(body?.decision || "");
      if (!["admit", "deny", "admit_all"].includes(decision)) return json(res, 400, { error: "Decisão inválida." });
      const now = new Date().toISOString();
      if (decision === "admit_all") {
        const result = await supabaseAdmin.from("meeting_lobby_requests").update({
          status: "admitted", decided_at: now, decided_by: moderator.userId, admitted_at: now, updated_at: now,
        }).eq("agenda_evento_id", eventId).eq("status", "pending").select("id");
        if (result.error) throw new Error(result.error.message);
        return json(res, 200, { ok: true, changed: result.data?.length || 0 });
      }
      const requestId = String(body?.request_id || "").trim();
      if (!requestId) return json(res, 400, { error: "request_id é obrigatório." });
      const status = decision === "admit" ? "admitted" : "denied";
      const result = await supabaseAdmin.from("meeting_lobby_requests").update({
        status, decided_at: now, decided_by: moderator.userId,
        admitted_at: status === "admitted" ? now : null, updated_at: now,
      }).eq("id", requestId).eq("agenda_evento_id", eventId).eq("status", "pending").select("id").maybeSingle();
      if (result.error) throw new Error(result.error.message);
      return json(res, 200, { ok: true, status, changed: Boolean(result.data) });
    }

    return json(res, 400, { error: "Ação inválida." });
  } catch (err: any) {
    console.error("[livekit-lobby]", err);
    return json(res, 500, { error: err?.message || "Erro na sala de espera." });
  }
}
