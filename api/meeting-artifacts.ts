import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabase";
import { eventModerator, parseBody } from "./_livekit-server";

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader("Cache-Control", "no-store");
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
    if (!eventId) return json(res, 400, { error: "agenda_evento_id é obrigatório." });

    const moderator = await eventModerator(req, eventId);
    if (!moderator.ok) return json(res, moderator.status, { error: moderator.error });

    const [{ data: report, error: reportError }, { data: recordings, error: recordingsError }, { data: transcript, error: transcriptError }] = await Promise.all([
      supabaseAdmin
        .from("meeting_ai_reports")
        .select("id,meeting_type,executive_summary,minutes_text,report,model,status,error,generated_at,created_at,updated_at")
        .eq("agenda_evento_id", eventId)
        .order("generated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("video_recordings")
        .select("id,provider_recording_id,recording_url,status,started_at,ended_at,created_at")
        .eq("agenda_evento_id", eventId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("meeting_transcripts")
        .select("id,segment_index,participant_identity,participant_name,participant_role,transcript_text,started_at_ms,ended_at_ms,source,model,created_at")
        .eq("agenda_evento_id", eventId)
        .order("segment_index", { ascending: true })
        .limit(1500),
    ]);

    if (reportError) throw new Error(reportError.message);
    if (recordingsError) throw new Error(recordingsError.message);
    if (transcriptError) throw new Error(transcriptError.message);

    const usableRecordings = (recordings || []).filter((row: any) => row.recording_url || row.status);
    return json(res, 200, {
      ok: true,
      report: report || null,
      recordings: usableRecordings,
      transcript: transcript || [],
      has_ai: Boolean(report || (transcript || []).length),
      has_recording: usableRecordings.some((row: any) => Boolean(row.recording_url)),
    });
  } catch (error: any) {
    console.error("[meeting-artifacts]", error);
    return json(res, 500, { error: error?.message || "Não foi possível carregar os materiais da reunião." });
  }
}
