// /api/livekit-recording.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || ''
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || ''
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || process.env.LIVEKIT_URL || ''

const REC_S3_ENDPOINT = process.env.RECORDING_S3_ENDPOINT || process.env.SUPABASE_S3_ENDPOINT || ''
const REC_S3_REGION = process.env.RECORDING_S3_REGION || process.env.SUPABASE_S3_REGION || 'sa-east-1'
const REC_S3_BUCKET = process.env.RECORDING_S3_BUCKET || process.env.SUPABASE_S3_BUCKET || ''
const REC_S3_ACCESS_KEY = process.env.RECORDING_S3_ACCESS_KEY || process.env.RECORDING_S3_ACCESS_KEY_ID || process.env.SUPABASE_S3_ACCESS_KEY || process.env.SUPABASE_S3_ACCESS_KEY_ID || ''
const REC_S3_SECRET_KEY = process.env.RECORDING_S3_SECRET_KEY || process.env.RECORDING_S3_SECRET_ACCESS_KEY || process.env.SUPABASE_S3_SECRET_KEY || process.env.SUPABASE_S3_SECRET_ACCESS_KEY || ''
const REC_PUBLIC_BASE_URL = process.env.RECORDING_PUBLIC_BASE_URL || process.env.SUPABASE_RECORDING_PUBLIC_BASE_URL || ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

type Action = 'start' | 'stop' | 'status'

type VideoRoomRow = {
  id: string
  agenda_evento_id: string
  provider_room_name: string
  public_client_url?: string | null
  recording_status?: string | null
  recording_egress_id?: string | null
  recording_url?: string | null
}

function json(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body)
}

function parseBody(req: VercelRequest) {
  if (typeof req.body === 'string' && req.body.length) return JSON.parse(req.body)
  return req.body || {}
}

function missingRecordingEnv() {
  const missing: string[] = []
  if (!REC_S3_BUCKET) missing.push('RECORDING_S3_BUCKET')
  if (!REC_S3_ACCESS_KEY) missing.push('RECORDING_S3_ACCESS_KEY')
  if (!REC_S3_SECRET_KEY) missing.push('RECORDING_S3_SECRET_KEY')
  return missing
}

function envPresence() {
  return {
    RECORDING_S3_ENDPOINT: !!REC_S3_ENDPOINT,
    RECORDING_S3_REGION: !!REC_S3_REGION,
    RECORDING_S3_BUCKET: !!REC_S3_BUCKET,
    RECORDING_S3_ACCESS_KEY: !!REC_S3_ACCESS_KEY,
    RECORDING_S3_SECRET_KEY: !!REC_S3_SECRET_KEY,
    RECORDING_PUBLIC_BASE_URL: !!REC_PUBLIC_BASE_URL,
    LIVEKIT_WS_URL: !!LIVEKIT_WS_URL,
    LIVEKIT_API_KEY: !!LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: !!LIVEKIT_API_SECRET,
    SUPABASE_URL: !!SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_ROLE_KEY,
  }
}

function lkHttpUrl() {
  return LIVEKIT_WS_URL.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://').replace(/\/$/, '')
}

function b64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function jwt(payload: Record<string, any>) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const p = b64url(JSON.stringify(payload))
  const s = createHmac('sha256', LIVEKIT_API_SECRET).update(`${h}.${p}`).digest()
  return `${h}.${p}.${b64url(s)}`
}

function livekitToken(video: Record<string, any>, ttl = 600) {
  const now = Math.floor(Date.now() / 1000)
  return jwt({
    iss: LIVEKIT_API_KEY,
    nbf: now - 10,
    exp: now + ttl,
    video,
  })
}

async function authUserId(req: VercelRequest) {
  const h = req.headers.authorization || ''
  if (!h.startsWith('Bearer ')) return null
  const { data } = await admin.auth.getUser(h.replace('Bearer ', ''))
  return data?.user?.id ?? null
}

function safeFileName(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90)
}

function recordingFilePath(agendaEventoId: string) {
  const date = new Date().toISOString().slice(0, 10)
  return `consulmax/agenda/${date}/${safeFileName(agendaEventoId)}-${Date.now()}.mp4`
}

function publicRecordingUrl(filepath: string) {
  if (!REC_PUBLIC_BASE_URL) return null
  return `${REC_PUBLIC_BASE_URL.replace(/\/$/, '')}/${filepath}`
}

async function twirp(path: string, payload: Record<string, any>) {
  const egressToken = livekitToken({ roomRecord: true })
  const response = await fetch(`${lkHttpUrl()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${egressToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  let data: any = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }

  if (!response.ok) {
    const msg = data?.msg || data?.error || data?.raw || `LiveKit Egress falhou: ${response.status}`
    throw new Error(msg)
  }

  return data
}

async function fetchVideoRoom(agendaEventoId: string) {
  const { data, error } = await admin
    .from('video_rooms')
    .select('*')
    .eq('agenda_evento_id', agendaEventoId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Sala de vídeo ainda não foi criada para este evento. Entre na sala primeiro.')
  if (!data.provider_room_name) throw new Error('Sala LiveKit sem provider_room_name.')

  return data as VideoRoomRow
}

async function tryUpdateVideoRoom(id: string, patch: Record<string, any>) {
  await admin.from('video_rooms').update(patch).eq('id', id)
}

function extractEgressId(started: any) {
  return started?.egress_id || started?.egressId || started?.info?.egress_id || started?.info?.egressId || null
}

function s3Camel() {
  return {
    endpoint: REC_S3_ENDPOINT || undefined,
    region: REC_S3_REGION,
    bucket: REC_S3_BUCKET,
    accessKey: REC_S3_ACCESS_KEY,
    secret: REC_S3_SECRET_KEY,
    forcePathStyle: !!REC_S3_ENDPOINT,
  }
}

function s3Snake() {
  return {
    endpoint: REC_S3_ENDPOINT || undefined,
    region: REC_S3_REGION,
    bucket: REC_S3_BUCKET,
    access_key: REC_S3_ACCESS_KEY,
    secret: REC_S3_SECRET_KEY,
    force_path_style: !!REC_S3_ENDPOINT,
  }
}

function payloadCandidates(roomName: string, filepath: string) {
  const camelFile = {
    filepath,
    disableManifest: false,
    s3: s3Camel(),
  }

  const snakeFile = {
    filepath,
    disable_manifest: false,
    s3: s3Snake(),
  }

  const protobufEsFile = {
    filepath,
    disableManifest: false,
    output: {
      case: 's3',
      value: s3Camel(),
    },
  }

  return [
    { roomName, layout: 'grid', audioOnly: false, videoOnly: false, file: camelFile },
    { room_name: roomName, layout: 'grid', audio_only: false, video_only: false, file: snakeFile },
    { roomName, layout: 'grid', audioOnly: false, videoOnly: false, fileOutputs: [camelFile] },
    { room_name: roomName, layout: 'grid', audio_only: false, video_only: false, file_outputs: [snakeFile] },
    {
      roomName,
      layout: 'grid',
      audioOnly: false,
      videoOnly: false,
      output: { case: 'file', value: protobufEsFile },
    },
  ]
}

async function startRoomCompositeEgress(roomName: string, filepath: string) {
  const candidates = payloadCandidates(roomName, filepath)
  const errors: string[] = []

  for (let i = 0; i < candidates.length; i += 1) {
    try {
      const started = await twirp('/twirp/livekit.Egress/StartRoomCompositeEgress', candidates[i])
      return { started, variant: i + 1 }
    } catch (err: any) {
      const msg = err?.message || 'erro desconhecido'
      errors.push(`tentativa ${i + 1}: ${msg}`)
      if (!/output|field|missing|invalid|unknown|unmarshal|json/i.test(String(msg))) break
    }
  }

  throw new Error(errors.join(' | '))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' })

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(res, 500, { error: 'Faltam variáveis do Supabase na Vercel.', env: envPresence() })
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_WS_URL) return json(res, 500, { error: 'Faltam variáveis do LiveKit na Vercel.', env: envPresence() })

    const missingS3 = missingRecordingEnv()
    if (missingS3.length) {
      return json(res, 500, {
        error: `Faltam variáveis S3 da gravação na Vercel: ${missingS3.join(', ')}. Verifique se elas estão no mesmo projeto/domínio e faça Redeploy sem cache.`,
        missing: missingS3,
        env: envPresence(),
      })
    }

    const authUser = await authUserId(req)
    if (!authUser) return json(res, 401, { error: 'Usuário não autenticado.' })

    const body = parseBody(req)
    const action: Action = body?.action === 'stop' ? 'stop' : body?.action === 'status' ? 'status' : 'start'
    const agendaEventoId = String(body?.agenda_evento_id || '').trim()
    const egressIdFromBody = String(body?.egress_id || body?.egressId || '').trim()

    if (!agendaEventoId) return json(res, 400, { error: 'agenda_evento_id é obrigatório.' })

    const room = await fetchVideoRoom(agendaEventoId)

    if (action === 'start') {
      if (room.recording_status === 'recording' && room.recording_egress_id) {
        return json(res, 200, { ok: true, alreadyRecording: true, egressId: room.recording_egress_id, room })
      }

      const filepath = recordingFilePath(agendaEventoId)
      const recordingUrl = publicRecordingUrl(filepath)
      const { started, variant } = await startRoomCompositeEgress(room.provider_room_name, filepath)
      const egressId = extractEgressId(started)

      await tryUpdateVideoRoom(room.id, {
        recording_status: 'recording',
        recording_egress_id: egressId,
        recording_started_at: new Date().toISOString(),
        recording_stopped_at: null,
        recording_url: recordingUrl,
        updated_at: new Date().toISOString(),
      })

      await admin.from('agenda_eventos').update({ video_status: 'recording' }).eq('id', agendaEventoId)

      return json(res, 200, { ok: true, action, egressId, recordingUrl, filepath, variant, egress: started })
    }

    if (action === 'stop') {
      const egressId = egressIdFromBody || room.recording_egress_id || ''
      if (!egressId) return json(res, 400, { error: 'Nenhuma gravação em andamento foi encontrada.' })

      let stopped: any
      try {
        stopped = await twirp('/twirp/livekit.Egress/StopEgress', { egressId })
      } catch {
        stopped = await twirp('/twirp/livekit.Egress/StopEgress', { egress_id: egressId })
      }

      await tryUpdateVideoRoom(room.id, {
        recording_status: 'stopped',
        recording_stopped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      return json(res, 200, { ok: true, action, egressId, egress: stopped })
    }

    const egressId = egressIdFromBody || room.recording_egress_id || ''
    if (!egressId) return json(res, 200, { ok: true, action, recording: false, room })

    let status: any
    try {
      status = await twirp('/twirp/livekit.Egress/ListEgress', { egressId })
    } catch {
      status = await twirp('/twirp/livekit.Egress/ListEgress', { egress_id: egressId })
    }

    return json(res, 200, { ok: true, action, recording: room.recording_status === 'recording', room, egress: status })
  } catch (err: any) {
    return json(res, 500, { error: err?.message || 'Erro inesperado.' })
  }
}
