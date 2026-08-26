import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabase";
import { eventModerator, livekitRpc, parseBody } from "./_livekit-server";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const S3_ENDPOINT = process.env.RECORDING_S3_ENDPOINT || process.env.SUPABASE_S3_ENDPOINT || (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/s3` : "");
const S3_REGION = process.env.RECORDING_S3_REGION || process.env.SUPABASE_S3_REGION || "sa-east-1";
const S3_BUCKET = process.env.RECORDING_S3_BUCKET || process.env.SUPABASE_S3_BUCKET || "recordings";
const S3_ACCESS_KEY = process.env.RECORDING_S3_ACCESS_KEY || process.env.RECORDING_S3_ACCESS_KEY_ID || process.env.SUPABASE_S3_ACCESS_KEY || process.env.SUPABASE_S3_ACCESS_KEY_ID || "";
const S3_SECRET_KEY = process.env.RECORDING_S3_SECRET_KEY || process.env.RECORDING_S3_SECRET_ACCESS_KEY || process.env.SUPABASE_S3_SECRET_KEY || process.env.SUPABASE_S3_SECRET_ACCESS_KEY || "";
const PUBLIC_BASE = process.env.RECORDING_PUBLIC_BASE_URL || process.env.SUPABASE_RECORDING_PUBLIC_BASE_URL || (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${S3_BUCKET}` : "");

type Action = "start" | "stop" | "status";

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function safeFile(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 90);
}

function filePath(eventId: string) {
  return `consulmax/agenda/${new Date().toISOString().slice(0, 10)}/${safeFile(eventId)}-${Date.now()}.mp4`;
}

function publicUrl(path: string) {
  return PUBLIC_BASE ? `${PUBLIC_BASE.replace(/\/$/, "")}/${path}` : null;
}

function configured() {
  return {
    bucket: Boolean(S3_BUCKET),
    endpoint: Boolean(S3_ENDPOINT),
    accessKey: Boolean(S3_ACCESS_KEY),
    secretKey: Boolean(S3_SECRET_KEY),
    publicBase: Boolean(PUBLIC_BASE),
  };
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
    const action: Action = body?.action === "stop" ? "stop" : body?.action === "status" ? "status" : "start";
    if (!eventId) return json(res, 400, { error: "agenda_evento_id é obrigatório." });

    const moderator = await eventModerator(req, eventId);
    if (!moderator.ok) return json(res, moderator.status, { error: moderator.error });

    const { data: room, error: roomError } = await supabaseAdmin
      .from("video_rooms")
      .select("*")
      .eq("agenda_evento_id", eventId)
      .maybeSingle();
    if (roomError) throw new Error(roomError.message);
    if (!room?.provider_room_name) return json(res, 404, { error: "Entre na sala antes de iniciar a gravação." });

    if (action === "status") {
      return json(res, 200, {
        ok: true,
        recording: room.recording_status === "recording",
        room,
        configured: configured(),
      });
    }

    if (!S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_ENDPOINT || !S3_BUCKET) {
      return json(res, 500, {
        error: "A gravação ainda não está completamente configurada no ambiente da Vercel.",
        configured: configured(),
      });
    }

    if (action === "start") {
      if (room.recording_status === "recording" && room.recording_egress_id) {
        return json(res, 200, { ok: true, alreadyRecording: true, egressId: room.recording_egress_id, recordingUrl: room.recording_url, room });
      }

      const filepath = filePath(eventId);
      const recordingUrl = publicUrl(filepath);
      const started = await livekitRpc(
        "livekit.Egress/StartRoomCompositeEgress",
        {
          room_name: room.provider_room_name,
          layout: "speaker",
          audio_only: false,
          video_only: false,
          file_outputs: [{
            filepath,
            disable_manifest: false,
            s3: {
              access_key: S3_ACCESS_KEY,
              secret: S3_SECRET_KEY,
              endpoint: S3_ENDPOINT,
              region: S3_REGION,
              bucket: S3_BUCKET,
              force_path_style: true,
            },
          }],
        },
        { roomRecord: true },
      );
      const egressId = String(started?.egress_id || started?.egressId || "").trim();
      if (!egressId) throw new Error("O LiveKit iniciou a solicitação de gravação, mas não retornou o identificador do Egress.");
      const now = new Date().toISOString();

      const recordingInsert = await supabaseAdmin.from("video_recordings").insert({
        video_room_id: room.id,
        agenda_evento_id: eventId,
        provider_recording_id: egressId,
        recording_url: recordingUrl,
        status: "recording",
        started_at: now,
      }).select("*").single();
      if (recordingInsert.error) throw new Error(recordingInsert.error.message);

      await Promise.all([
        supabaseAdmin.from("video_rooms").update({
          recording_status: "recording",
          recording_egress_id: egressId,
          recording_started_at: now,
          recording_stopped_at: null,
          recording_url: recordingUrl,
          updated_at: now,
        }).eq("id", room.id),
        supabaseAdmin.from("agenda_eventos").update({ video_status: "recording", updated_at: now }).eq("id", eventId),
      ]);

      return json(res, 200, { ok: true, action, egressId, recordingUrl, filepath, recording: recordingInsert.data });
    }

    const egressId = String(body?.egress_id || room.recording_egress_id || "").trim();
    if (!egressId) return json(res, 400, { error: "Nenhuma gravação em andamento foi encontrada." });
    await livekitRpc("livekit.Egress/StopEgress", { egress_id: egressId }, { roomRecord: true });
    const now = new Date().toISOString();
    await Promise.all([
      supabaseAdmin.from("video_rooms").update({
        recording_status: "stopped",
        recording_stopped_at: now,
        updated_at: now,
      }).eq("id", room.id),
      supabaseAdmin.from("video_recordings").update({ status: "stopped", ended_at: now }).eq("provider_recording_id", egressId),
      supabaseAdmin.from("agenda_eventos").update({ video_status: "host_joined", updated_at: now }).eq("id", eventId),
    ]);
    return json(res, 200, { ok: true, action, egressId, recordingUrl: room.recording_url });
  } catch (err: any) {
    console.error("[livekit-recording]", err);
    return json(res, 500, { error: err?.message || "Erro ao controlar a gravação." });
  }
}
