// /api/livekit-room.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac, randomUUID } from 'crypto'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || ''
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || ''
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || process.env.LIVEKIT_URL || ''
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || process.env.VERCEL_URL || ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

type ParticipantRole = 'host' | 'client'

type LiveKitVideoGrant = {
  room?: string
  roomJoin?: boolean
  roomCreate?: boolean
  roomAdmin?: boolean
  canPublish?: boolean
  canSubscribe?: boolean
  canPublishData?: boolean
}

type LiveKitTokenOptions = {
  identity?: string
  name?: string
  ttlSeconds?: number
  video: LiveKitVideoGrant
}

function json(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body)
}

function getPublicAppUrl() {
  if (!PUBLIC_APP_URL) return ''
  if (PUBLIC_APP_URL.startsWith('http://') || PUBLIC_APP_URL.startsWith('https://')) {
    return PUBLIC_APP_URL.replace(/\/$/, '')
  }
  return `https://${PUBLIC_APP_URL}`.replace(/\/$/, '')
}

function livekitHttpUrl() {
  return LIVEKIT_WS_URL.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://').replace(/\/$/, '')
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function signJwt(payload: Record<string, any>) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64Url(JSON.stringify(header))
  const encodedPayload = base64Url(JSON.stringify(payload))
  const signature = createHmac('sha256', LIVEKIT_API_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest()

  return `${encodedHeader}.${encodedPayload}.${base64Url(signature)}`
}

function createLiveKitToken(options: LiveKitTokenOptions) {
  const now = Math.floor(Date.now() / 1000)
  const ttl = options.ttlSeconds || 2 * 60 * 60

  const payload: Record<string, any> = {
    iss: LIVEKIT_API_KEY,
    nbf: now - 10,
    exp: now + ttl,
    video: options.video,
  }

  if (options.identity) payload.sub = options.identity
  if (options.name) payload.name = options.name

  return signJwt(payload)
}

function cleanRoomName(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function parseBody(req: VercelRequest) {
  if (typeof req.body === 'string' && req.body.length) return JSON.parse(req.body)
  return req.body || {}
}

async function createLiveKitRoom(roomName: string) {
  const token = createLiveKitToken({
    ttlSeconds: 10 * 60,
    video: {
      roomCreate: true,
      roomAdmin: true,
      room: roomName,
    },
  })

  const response = await fetch(`${livekitHttpUrl()}/twirp/livekit.RoomService/CreateRoom`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: roomName,
      emptyTimeout: 15 * 60,
      departureTimeout: 5 * 60,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const alreadyExists = response.status === 409 || /already exists|already_exist|exist/i.test(text)
    if (!alreadyExists) {
      throw new Error(`LiveKit CreateRoom falhou: ${response.status} ${text}`)
    }
  }
}

async function getAuthUserId(req: VercelRequest) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) return null

  const jwt = authHeader.replace('Bearer ', '')
  const { data } = await admin.auth.getUser(jwt)
  return data?.user?.id ?? null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' })
  }

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(res, 500, { error: 'Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    }

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_WS_URL) {
      return json(res, 500, { error: 'Faltam LIVEKIT_API_KEY, LIVEKIT_API_SECRET e/ou LIVEKIT_WS_URL na Vercel.' })
    }

    const appUrl = getPublicAppUrl()
    if (!appUrl) {
      return json(res, 500, { error: 'Falta PUBLIC_APP_URL na Vercel.' })
    }

    const body = parseBody(req)
    const agendaEventoId = String(body?.agenda_evento_id || '').trim()
    const role: ParticipantRole = body?.role === 'host' ? 'host' : 'client'
    const participantName = String(
      body?.participant_name || (role === 'host' ? 'Consultor Consulmax' : 'Cliente')
    ).trim()

    if (!agendaEventoId) {
      return json(res, 400, { error: 'agenda_evento_id é obrigatório.' })
    }

    const authUserId = await getAuthUserId(req)

    if (role === 'host' && !authUserId) {
      return json(res, 401, { error: 'Usuário não autenticado para entrar como consultor.' })
    }

    const { data: evento, error: evError } = await admin
      .from('agenda_eventos')
      .select('id,titulo,cliente_id,lead_id,user_id,videocall_url,video_room_id,video_status')
      .eq('id', agendaEventoId)
      .maybeSingle()

    if (evError) return json(res, 500, { error: evError.message })
    if (!evento) return json(res, 404, { error: 'Evento não encontrado.' })

    let { data: existingRoom, error: roomLookupError } = await admin
      .from('video_rooms')
      .select('*')
      .eq('agenda_evento_id', agendaEventoId)
      .maybeSingle()

    if (roomLookupError) return json(res, 500, { error: roomLookupError.message })

    if (!existingRoom) {
      const roomName = cleanRoomName(`consulmax-${agendaEventoId}-${Date.now()}`)
      const publicClientUrl = `${appUrl}/agenda/sala/${agendaEventoId}?cliente=1`

      await createLiveKitRoom(roomName)

      const { data: insertedRoom, error: insertRoomError } = await admin
        .from('video_rooms')
        .insert({
          agenda_evento_id: agendaEventoId,
          provider: 'livekit',
          provider_room_name: roomName,
          provider_room_url: LIVEKIT_WS_URL,
          public_client_url: publicClientUrl,
          status: 'created',
          created_by: authUserId,
        })
        .select('*')
        .single()

      if (insertRoomError) return json(res, 500, { error: insertRoomError.message })

      existingRoom = insertedRoom

      await admin
        .from('agenda_eventos')
        .update({
          video_room_id: insertedRoom.id,
          videocall_url: publicClientUrl,
          video_status: 'created',
        })
        .eq('id', agendaEventoId)

      await admin.from('video_sessions').insert({
        video_room_id: insertedRoom.id,
        agenda_evento_id: agendaEventoId,
        status: 'scheduled',
      })
    }

    const roomName = existingRoom.provider_room_name
    const participantIdentity = cleanRoomName(`${role}-${authUserId || randomUUID()}-${Date.now()}`)

    const participantToken = createLiveKitToken({
      identity: participantIdentity,
      name: participantName,
      ttlSeconds: 2 * 60 * 60,
      video: {
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
    })

    const nextStatus = role === 'host' ? 'host_joined' : 'client_joined'

    await admin
      .from('video_rooms')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', existingRoom.id)

    await admin.from('agenda_eventos').update({ video_status: nextStatus }).eq('id', agendaEventoId)

    return json(res, 200, {
      ok: true,
      serverUrl: LIVEKIT_WS_URL,
      token: participantToken,
      room: existingRoom,
      clientUrl: existingRoom.public_client_url,
    })
  } catch (err: any) {
    return json(res, 500, { error: err?.message || 'Erro inesperado.' })
  }
}
