import { createHmac, randomUUID } from "crypto";
import type { VercelRequest } from "@vercel/node";
import { supabaseAdmin, getAuthUser } from "./_supabase";

export const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
export const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";
export const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || process.env.LIVEKIT_URL || "";
export const PUBLIC_APP_URL = (() => {
  const raw = String(process.env.PUBLIC_APP_URL || process.env.VERCEL_URL || "").trim();
  if (!raw || /localhost|127\.0\.0\.1/i.test(raw)) return "https://crm.consulmaxconsorcios.com.br";
  return (raw.startsWith("http") ? raw : `https://${raw}`).replace(/\/$/, "");
})();

export function parseBody(req: VercelRequest) {
  if (typeof req.body === "string" && req.body.length) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body || {};
}

export function livekitReady() {
  return Boolean(LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_WS_URL);
}

export function cleanIdentity(raw: string) {
  return String(raw || "participant")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || `participant-${randomUUID()}`;
}

function b64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function livekitToken(opts: {
  identity?: string;
  name?: string;
  ttl?: number;
  video: Record<string, unknown>;
  metadata?: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: LIVEKIT_API_KEY,
    nbf: now - 10,
    exp: now + (opts.ttl || 7200),
    video: opts.video,
  };
  if (opts.identity) payload.sub = opts.identity;
  if (opts.name) payload.name = opts.name;
  if (opts.metadata) payload.metadata = opts.metadata;
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  const s = createHmac("sha256", LIVEKIT_API_SECRET).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(s)}`;
}

export function lkHttpUrl() {
  return LIVEKIT_WS_URL
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://")
    .replace(/\/$/, "");
}

export async function livekitRpc(method: string, payload: Record<string, unknown>, grant: Record<string, unknown>) {
  if (!livekitReady()) throw new Error("LiveKit não configurado na Vercel.");
  const adminToken = livekitToken({ ttl: 600, video: grant });
  const response = await fetch(`${lkHttpUrl()}/twirp/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const message = data?.msg || data?.error || data?.raw || `${method} falhou (${response.status})`;
    const err = new Error(String(message));
    (err as any).status = response.status;
    throw err;
  }
  return data;
}

export async function createRoom(roomName: string) {
  try {
    await livekitRpc(
      "livekit.RoomService/CreateRoom",
      { name: roomName, empty_timeout: 900, departure_timeout: 300, max_participants: 50 },
      { roomCreate: true, roomAdmin: true, room: roomName },
    );
  } catch (err: any) {
    if (Number(err?.status) === 409 || /already exists|already_exist|exist/i.test(String(err?.message || ""))) return;
    throw err;
  }
}

export function clientMeetingUrl(eventId: string) {
  return `${PUBLIC_APP_URL}/agenda/sala/${eventId}?cliente=1`;
}

export async function ensureVideoRoom(agendaEventoId: string, createdBy?: string | null) {
  let { data: room, error } = await supabaseAdmin
    .from("video_rooms")
    .select("*")
    .eq("agenda_evento_id", agendaEventoId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!room) {
    const roomName = cleanIdentity(`consulmax-${agendaEventoId}-${Date.now()}`);
    await createRoom(roomName);
    const clientUrl = clientMeetingUrl(agendaEventoId);
    const inserted = await supabaseAdmin
      .from("video_rooms")
      .insert({
        agenda_evento_id: agendaEventoId,
        provider: "livekit",
        provider_room_name: roomName,
        provider_room_url: LIVEKIT_WS_URL,
        public_client_url: clientUrl,
        status: "created",
        created_by: createdBy || null,
      })
      .select("*")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    room = inserted.data;

    await supabaseAdmin.from("agenda_eventos").update({
      video_room_id: room.id,
      videocall_url: clientUrl,
      video_status: "created",
      updated_at: new Date().toISOString(),
    }).eq("id", agendaEventoId);

    await supabaseAdmin.from("video_sessions").insert({
      video_room_id: room.id,
      agenda_evento_id: agendaEventoId,
      status: "scheduled",
    });
  } else {
    await createRoom(room.provider_room_name);
    const clientUrl = room.public_client_url || clientMeetingUrl(agendaEventoId);
    if (!room.public_client_url || room.provider_room_url !== LIVEKIT_WS_URL) {
      const updated = await supabaseAdmin.from("video_rooms").update({
        public_client_url: clientUrl,
        provider_room_url: LIVEKIT_WS_URL,
        updated_at: new Date().toISOString(),
      }).eq("id", room.id).select("*").single();
      if (updated.error) throw new Error(updated.error.message);
      room = updated.data;
    }
    await supabaseAdmin.from("agenda_eventos").update({
      video_room_id: room.id,
      videocall_url: clientUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", agendaEventoId);
  }

  return room;
}

export function joinToken(roomName: string, identity: string, name: string, metadata?: Record<string, unknown>) {
  return livekitToken({
    identity: cleanIdentity(identity),
    name: String(name || "Participante").slice(0, 120),
    ttl: 7200,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
    video: {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  });
}

export async function eventModerator(req: VercelRequest, eventId: string) {
  const { user } = await getAuthUser(req);
  if (!user?.id) return { ok: false as const, status: 401, error: "Usuário não autenticado." };

  const [{ data: event, error: eventError }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("agenda_eventos").select("*").eq("id", eventId).maybeSingle(),
    supabaseAdmin.from("users").select("role,user_role,is_active,nome,email").eq("auth_user_id", user.id).maybeSingle(),
  ]);
  if (eventError) return { ok: false as const, status: 500, error: eventError.message };
  if (!event) return { ok: false as const, status: 404, error: "Compromisso não encontrado." };
  const role = String(profile?.role || profile?.user_role || "").toLowerCase();
  const isAdmin = role === "admin" && profile?.is_active !== false;
  if (event.user_id !== user.id && !isAdmin) {
    return { ok: false as const, status: 403, error: "Somente o organizador pode moderar esta reunião." };
  }
  return { ok: true as const, userId: user.id, event, profile, isAdmin };
}

export async function removeParticipant(roomName: string, identity: string) {
  return livekitRpc(
    "livekit.RoomService/RemoveParticipant",
    { room: roomName, identity },
    { roomAdmin: true, room: roomName },
  );
}
