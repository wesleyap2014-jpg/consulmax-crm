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

type Role = 'host' | 'client'

function json(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body)
}

function parseBody(req: VercelRequest) {
  if (typeof req.body === 'string' && req.body.length) return JSON.parse(req.body)
  return req.body || {}
}

function appUrl() {
  if (!PUBLIC_APP_URL) return ''
  if (PUBLIC_APP_URL.startsWith('http')) return PUBLIC_APP_URL.replace(/\/$/, '')
  return `https://${PUBLIC_APP_URL}`.replace(/\/$/, '')
}

function lkHttpUrl() {
  return LIVEKIT_WS_URL
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://')
    .replace(/\/$/, '')
}

function b64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function jwt(payload: Record<string, any>) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const p = b64url(JSON.stringify(payload))
  const s = createHmac('sha256', LIVEKIT_API_SECRET).update(`${h}.${p}`).digest()
  return `${h}.${p}.${b64url(s)}`
}

function token(opts: { identity?: string; name?: string; ttl?: number; video: Record<string, any> }) {
  const now = Math.floor(Date.now() / 1000)

  const payload: Record<string, any> = {
    iss: LIVEKIT_API_KEY,
    nbf: now - 10,
    exp: now + (opts.ttl || 7200),
    video: opts.video,
  }

  if (opts.identity) payload.sub = opts.identity
  if (opts.name) payload.name = opts.name

  return jwt(payload)
}

function clean(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

async function authUserId(req: VercelRequest) {
  const h = req.headers.authorization || ''
  if (!h.startsWith('Bearer ')) return null

  const { data } = await admin.auth.getUser(h.replace('Bearer ', ''))
  return data?.user?.id ?? null
}

async function createRoom(name: string) {
  const adminToken = token({
    ttl: 600,
    video: {
      roomCreate: true,
      roomAdmin: true,
      room: name,
    },
  })

  const response = await fetch(`${lkHttpUrl()}/twirp/livekit.RoomService/CreateRoom`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      emptyTimeout: 900,
      departureTimeout: 300,
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

/**
 * Regra atual:
 * - O link da sala é permanente/reaproveitável.
 * - Finalizar atendimento salva histórico/notas, mas NÃO bloqueia a sala.
 * - Se a sala já existia e ficou vazia no LiveKit, tentamos recriar com o mesmo provider_room_name.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' })

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(res, 500, { error: 'Faltam variáveis do Supabase na Vercel.' })
    }

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_WS_URL) {
      return json(res, 500, { error: 'Faltam variáveis do LiveKit na Vercel.' })
    }

    const publicAppUrl = appUrl()
    if (!publicAppUrl) {
      return json(res, 500, { error: 'Falta PUBLIC_APP_URL na Vercel.' })
    }

    const body = parseBody(req)

    const agendaEventoId = String(body?.agenda_evento_id || '').trim()
    const role: Role = body?.role === 'host' ? 'host' : 'client'
    const participantName = String(
      body?.participant_name || (role === 'host' ? 'Consultor Consulmax' : 'Cliente')
    ).trim()

    if (!agendaEventoId) {
      return json(res, 400, { error: 'agenda_evento_id é obrigatório.' })
    }

    const userId = await authUserId(req)

    if (role === 'host' && !userId) {
      return json(res, 401, { error: 'Usuário não autenticado para entrar como consultor.' })
    }

    const { data: evento, error: evError } = await admin
      .from('agenda_eventos')
      .select('id,titulo,cliente_id,lead_id,user_id,videocall_url,video_room_id,video_status')
      .eq('id', agendaEventoId)
      .maybeSingle()

    if (evError) return json(res, 500, { error: evError.message })
    if (!evento) return json(res, 404, { error: 'Evento não encontrado.' })

    let { data: room, error: roomError } = await admin
      .from('video_rooms')
      .select('*')
      .eq('agenda_evento_id', agendaEventoId)
      .maybeSingle()

    if (roomError) return json(res, 500, { error: roomError.message })

    if (!room) {
      const roomName = clean(`consulmax-${agendaEventoId}-${Date.now()}`)
      const clientUrl = `${publicAppUrl}/agenda/sala/${agendaEventoId}?cliente=1`

      await createRoom(roomName)

      const { data: inserted, error: insertError } = await admin
        .from('video_rooms')
        .insert({
          agenda_evento_id: agendaEventoId,
          provider: 'livekit',
          provider_room_name: roomName,
          provider_room_url: LIVEKIT_WS_URL,
          public_client_url: clientUrl,
          status: 'created',
          created_by: userId,
        })
        .select('*')
        .single()

      if (insertError) return json(res, 500, { error: insertError.message })

      room = inserted

      await admin
        .from('agenda_eventos')
        .update({
          video_room_id: inserted.id,
          videocall_url: clientUrl,
          video_status: 'created',
        })
        .eq('id', agendaEventoId)

      await admin.from('video_sessions').insert({
        video_room_id: inserted.id,
        agenda_evento_id: agendaEventoId,
        status: 'scheduled',
      })
    } else {
      await createRoom(room.provider_room_name)

      if (!room.public_client_url) {
        const clientUrl = `${publicAppUrl}/agenda/sala/${agendaEventoId}?cliente=1`

        const { data: updatedRoom, error: updateRoomError } = await admin
          .from('video_rooms')
          .update({
            public_client_url: clientUrl,
            provider_room_url: LIVEKIT_WS_URL,
            updated_at: new Date().toISOString(),
          })
          .eq('id', room.id)
          .select('*')
          .single()

        if (updateRoomError) return json(res, 500, { error: updateRoomError.message })

        room = updatedRoom

        await admin
          .from('agenda_eventos')
          .update({
            videocall_url: clientUrl,
          })
          .eq('id', agendaEventoId)
      }
    }

    const nextStatus = role === 'host' ? 'host_joined' : 'client_joined'

    const participantToken = token({
      identity: clean(`${role}-${userId || randomUUID()}-${Date.now()}`),
      name: participantName,
      ttl: 7200,
      video: {
        room: room.provider_room_name,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
    })

    await admin
      .from('video_rooms')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', room.id)

    await admin
      .from('agenda_eventos')
      .update({
        video_status: nextStatus,
      })
      .eq('id', agendaEventoId)

    await admin.from('video_sessions').insert({
      video_room_id: room.id,
      agenda_evento_id: agendaEventoId,
      status: nextStatus,
      started_at: new Date().toISOString(),
    })

    return json(res, 200, {
      ok: true,
      serverUrl: LIVEKIT_WS_URL,
      token: participantToken,
      room,
      clientUrl: room.public_client_url,
      reusable: true,
    })
  } catch (err: any) {
    return json(res, 500, { error: err?.message || 'Erro inesperado.' })
  }
}
